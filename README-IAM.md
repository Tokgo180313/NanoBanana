# NanoBanana 统一权限接入

## 边界

原工程为NestJS11 + Vue3，无真实账号认证和服务端历史库。本次在原生成服务之外增加IAM适配层，所有现有生成、融合、查询、上传接口均使用服务端会话与IAM校验。业务数据在本地独立 MongoDB 库 nanobanana；图片保存到后端本地持久化目录；IAM 库只保留权限索引。

登录采用confidential客户端image-workbench的OIDC Authorization Code + PKCE。后端验证ID Token的签名/issuer/audience/exp/nonce，并验证访问令牌身份及IAM成员资格。浏览器只接收随机HttpOnly、SameSite=Lax会话Cookie，访问令牌使用AES-256-GCM加密保存在业务库。写请求要求同源Origin和会话CSRF值，用户及租户不接受浏览器指定。

## 配置和启动

1. 保留供应商原.env；在单独.env.iam填写 NB_MONGO_URI、NB_MONGO_DB、NB_IMAGE_ROOT、IAM、OIDC客户端密钥和32字节base64会话加密密钥。该文件已加入.gitignore，权限应为0600。
2. `npm install`。后端启动时自动连接本地 MongoDB 并创建索引。旧 MySQL 历史迁移见 README-MONGODB.md；migrate:iam 仅用于维护旧库，不是新版启动步骤。
3. IAM和开发IdP运行后，执行`npm run build:iam`，再执行`PORT=3100 WORKBENCH_ORIGIN=http://localhost:5274 npm run start:iam`。前端用`VITE_API_PROXY_TARGET=http://127.0.0.1:3100 npm run dev -- --host 127.0.0.1 --port 5274`。本次联调使用5274/3100，保留原5174/3000进程。
4. Keycloak的image-workbench客户端精确注册`http://localhost:5274/api/auth/callback`。Nexus_IAM项目的scripts/configure-nanobanana-idp.py可配置本地回调，不重建realm。
5. 开发业务账号为member/leader/other，随机密码见Nexus_IAM/deploy/generated/accounts.txt。admin默认只管理IAM，没有图片业务权限；正式用户必须由IdP供应，并在IAM分配角色。

生产必须HTTPS、安全Cookie、企业IdP、最小权限数据库账号、私网/mTLS、依赖安全升级、密钥管理与轮换、审计和备份。不启用测试夹具。当前会话按访问令牌有效期到期，未实现refresh token续期，重新登录可恢复身份。

## 资源与数据

- 本地生成任务ID为nb-task-UUID；真正的供应商ID只存服务端。轮询先用本地ID核查租户和IAM权限，再替换为服务端记录的供应商ID。所有候选ID字段都会按接口重新组装，不能夹带第二个供应商ID。
- 生成前登记IMAGE_TASK；作品完成时登记IMAGE_ASSET。任务/作品含tenant_id与owner_user_id。注册未完成的记录不进入普通列表；nb_iam_outbox持久化注册意图，失败可由原所有者调用retry-registration补偿。没有长期保存用户Token的后台重试worker。
- GET /api/workbench/tasks 与 GET /api/workbench/assets 对本租户候选索引执行批量IAM对象授权，授权后再读取提示词等业务内容，按当前组织关系实现组长看组内、组员看本人。当前候选窗口最多1000，超过返回明确错误，不静默截断。
- 预览、下载、删除分别为GET assets/:id/preview、GET assets/:id/download、DELETE assets/:id，每次服务端重新鉴权；返回内容代理流，不返回供应商源URL。未授权作品不可通过更换ID访问。
- 图片源 URL/内嵌图片在生成完成时下载并校验，落入本地文件；MongoDB 只保存受控地址、路径和元数据，IAM 不存图片。下载/预览只允许PNG/JPEG/WebP/GIF并限制体积/像素；HTTPS源必须命中NB_IMAGE_HOST_ALLOWLIST精确主机名，DNS结果还要通过公网地址检查并绑定到连接，不跟随重定向。
- NB_IMAGE_HOST_ALLOWLIST为空时拒绝远程图片源。必须根据真实供应商返回的图片主机名配置，不能填写任意来源或把任意URL作为下载接口参数。测试仅使用受保护的内嵌PNG，不据此声称已验证实际供应商CDN。
- 供应商endpoint/apiKey只能由服务端配置，禁止浏览器请求覆盖；移除了原Linkfox中输出密钥/原始响应的console日志。

原浏览器历史保留，但不自动归属到任何账号；新历史读取服务端。草稿/任务卡缓存按租户+用户分区，不能把旧未认证localStorage直接当成可信权限记录。原任务卡的“停止等待”仍只中断浏览器等待，不宣称取消供应商计费任务；“重试生成”为新的受控生成请求，未新增供应商取消/重试API。

## 旧版验证记录（MySQL）

- 后端独立构建build:iam和18项单元/接入边界测试通过。
- 前端生产构建和25项既有/新增测试通过。
- 4项真实OIDC/IAM/MySQL端到端测试通过：匿名旧接口拒绝；生成结果保护、预览/下载/服务端历史；组内范围与跨用户拒绝；退出会话不可重放。生成供应商在测试专用服务中使用无付费夹具。
- 本地MySQL版本化迁移实际执行；原供应商真实付费生成未执行。

测试服务位于test/iam-fixture-server.ts，要求NODE_ENV=test且NB_IAM_FIXTURE=1；生产构建排除整个test目录。不得用测试服务替代正式服务。可在Nexus_IAM运行`NB_LIVE_E2E=1 npm --prefix iam-admin run test:e2e -- tests/nanobanana.spec.ts`，前提是5274前端和3100测试服务已经运行。

## 剩余上线事项

真实图片域名白名单和供应商契约验证；后台异步完成/Outbox worker与独立服务身份；大集合查询优化；服务端业务取消/重试；对象存储与密钥轮换再加密；企业身份供应和生产会话续期；生产负载/渗透/回滚演练。

依赖审计：原后端与接入锁文件均报告38项（低1/中12/高22/严重3），本次新增jose/mysql2/dotenv没有新增审计项。未自动批量升级现有业务依赖；上线前需单独修复。该结果是本次npm audit快照，不代表生产安全验收通过。

原有watch进程持续写入dist时，标准nest build会争用目录；build:iam使用独立dist-iam输出，不中断现有开发服务。

.env.iam默认沿用原前端5174且不设置PORT，避免改变现有开发进程的端口；独立3100/5274联调用进程环境变量覆盖。GROUP根据IAM当前用户成员关系计算，业务表未假设已有org_id；DEPT等额外组织归属策略需要后续明确业务归属适配。

## MongoDB 更新

当前版本已切换 MongoDB。本轮 18 项常规测试和 8 项真实 MongoDB/文件存储集成测试通过；旧 MySQL 数据已迁移并重复校验。配置、备份恢复、历史迁移及 OSS 扩展见 [README-MONGODB.md](README-MONGODB.md)。上方 MySQL 端到端测试及依赖审计是旧版历史记录。

## 当前浏览器统一退出（2026-10-29）

点击“退出登录”先调用 IAM /me/logout-current，撤销当前浏览器同次 SSO 会话，再删除本地 MongoDB 登录会话、清除 Cookie，经身份中心退出并校验 /api/auth/callback 的退出 state。再次登录须输入账号密码；关联 Agent/IAM 旧会话被拒绝，其他设备或独立浏览器会话保持登录。其他已打开页面在下一次请求、焦点恢复或轮询时显示失效；重新登录后正常 SSO 恢复。保持原有紫色登录风格，不新增身份中心管理权限。

三个入口共 18 项真实退出联调通过；图片工作台前端 25 项、后端 20 项测试通过，8 项需专用 MongoDB 配置的集成测试在本轮跳过。此次不调用真实生成供应商。详细记录见 Nexus_IAM/docs/browser-session-logout.md。
