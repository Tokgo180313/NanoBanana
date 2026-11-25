# MongoDB 与本地图片存储

本项目的业务会话、登录状态、生成任务、图片记录和 IAM 注册 Outbox 全部使用本地 MongoDB；外部 IAM 不变。旧 IAM MySQL 连接仅用于历史迁移。模型管理使用独立的 MySQL 连接配置。前端 API、业务 ID、租户隔离、IAM 对象授权及 CSRF 校验保持兼容。

## 配置与启动

从 banana_backend 目录运行，依照 `.env.iam.example` 配置 `.env.iam`：

```dotenv
NB_MONGO_URI=mongodb://127.0.0.1:27017
NB_MONGO_DB=nanobanana
NB_IMAGE_STORAGE=local
NB_IMAGE_ROOT=./data/images
NB_MIGRATION_DIR=./data/migrations
```

部署时 NB_IMAGE_ROOT 使用绝对路径；MongoDB 数据目录与图片目录都必须持久化。不要把图片目录公开为静态目录。data/ 已忽略，迁移备份包含加密凭证，不提交版本库。继续保留既有 IAM_SESSION_KEY，迁移时需要解密旧图片来源；不要重新生成覆盖旧密钥。

```bash
npm install
npm run build:iam
PORT=3100 WORKBENCH_ORIGIN=http://localhost:5274 npm run start:iam
```

MongoDB 必须已启动且仅监听本机。后端启动时创建唯一、查询及 TTL 索引，连接/索引异常时拒绝启动。会话过期由应用主动校验，不依赖 TTL 删除时机；登录状态使用 findOneAndDelete 原子消费。服务关闭时释放连接。

## 数据与图片

集合：iam_sessions、iam_login_states、image_tasks、image_assets、iam_outbox。业务字段沿用既有 tenant_id、owner_user_id、created_at 等命名；日期为 BSON Date，settings/payload 为文档，不再保存 JSON 字符串。原任务和图片 ID 保留。

image_assets 保存 storageProvider、storageKey、storageUrl、mimeType、size、width、height、contentHash，不保存图片 Base64/二进制或供应商源 URL。source_hash 仅为旧版兼容与结果去重的不可逆摘要。新资产先进入 STORING，文件验证/原子落盘成功后进入 REGISTERING，完成 IAM 注册才进入 ACTIVE。失败记录可由同一结果再次处理恢复；不会发布半成品。并发相同结果使用稳定 ID 和唯一索引去重。

预览、下载、删除仍使用 `/api/workbench/assets/:id/...`；读取文件前校验租户和 IAM，文件 SHA-256 不一致或丢失时返回明确不可用错误。删除为软删除，保留文件供恢复/备份；不在请求中立即物理删除。历史列表排除未完成、删除和不可用图片。保留原 1000 条候选窗口限制。

供应商 URL 仅允许 NB_IMAGE_HOST_ALLOWLIST 中的 HTTPS 域名，并检查公网 DNS、不跟随重定向；原有 20 MiB/8000 万像素上限保留，落盘前完整解码校验。供应商图片在完成阶段落盘，预览不再依赖供应商链接有效期。已有作品重新用于生成时，由后端读取文件转为供应商输入；即梦图生图和纯本地作品融合会映射至 Base64 字段。混合远程 URL 与 Base64 的即梦融合仍受原有互斥输入限制。

## 历史 MySQL 迁移

保留 NB*DB*\* 旧库配置。旧 SQL migration 保留不修改，不对外部 IAM 数据库操作。

```bash
# 仅只读统计，不写源库、MongoDB 或备份
npm run migrate:mongo

# 暂停旧后端和其他业务写入，确认没有进行中的生成任务后执行
NB_MIGRATION_MAINTENANCE=1 npm run migrate:mongo -- --apply
```

脚本读取 MySQL 一致性快照，先在 data/migrations 写入并回读校验私有 JSON 备份，再导入 MongoDB。过期会话/登录状态跳过；有效会话保留密文和过期时间。图片按原 ID 解密来源并下载落盘。迁移使用源记录指纹和业务唯一键，重复运行不覆盖已有业务修改；冲突进入报告。

每次输出 `*-report.json`，逐字段核对任务、归属、状态、时间及元数据，已落盘图片重读并校验 SHA-256。失效图片保留记录并标记 UNAVAILABLE，报告列出 ID，退出码 2；后续恢复原图片来源后可重复迁移重试。记录冲突同样返回 2，连接/写入等异常返回 1。只有 verified=true 才切换服务；不静默忽略异常。不记录源 URL、密钥或令牌到终端。

迁移备份不是后续日常备份的替代品。正式运行后，停写或使用一致性快照同时备份 MongoDB、图片目录，以及单独安全保管的密钥配置。恢复时配套恢复数据库和图片，重读并校验文件。MongoDB 接收新写入后不能直接切回旧 MySQL；需先对齐新增记录。

## OSS 扩展

ImageStorageAdapter 已实现 local / 阿里云私有 OSS，按记录的 storageProvider 读取和清理文件。NB_IMAGE_STORAGE 只决定新图片写入位置，已有本地图片可以继续读取。凭证只在服务端，预览和下载仍经 IAM 鉴权接口，不向前端返回 OSS 密钥或临时签名链接。配置、自检及 RAM 策略见 [README-OSS.md](README-OSS.md)。

切换配置不会自动搬迁历史文件。未来批量迁移应采用上传 → 校验 → 条件更新 MongoDB 的 storageProvider/storageKey/storageUrl；保留 contentHash 和业务 ID，不把临时签名地址作为永久地址。完成迁移验收和备份后再清理本地文件。

## 验证

```bash
npm test -- --runInBand
npm run test:mongo
npm run build:iam
```

test:mongo 连接本机 27017，在随机命名的 nanobanana*test*\* 独立库及临时文件目录执行，并清理测试数据；不调用付费供应商。覆盖文件保存、任务完成、历史查询、再次生成输入、并发去重、软删除、防跨租户、IAM 注册失败恢复、损坏文件、磁盘错误、会话过期/退出/CSRF、登录状态原子消费及 TTL 索引。旧真实 IAM/OIDC E2E 需另行在现有环境执行，不与存储集成测试混称。

## 模型接入数据库

任务、历史和 IAM 业务继续使用 MongoDB。提供商和模型配置使用独立的 MySQL 库，初始化方法见 [MySQL 配置](README-MYSQL.md)。
