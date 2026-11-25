# 阿里云私有 OSS 接入

图片由 NestJS 后端保存到私有 Bucket，MongoDB 只保存存储类型、对象 Key、SHA-256 与图片元数据。前端继续访问 `/api/workbench/assets/:id/preview` 和下载接口，后端先验证登录、租户和 IAM 权限，再从 OSS 读取图片。无需前端 OSS SDK、签名 URL、公开 Bucket 或 Bucket CORS。

## 1. 准备 Bucket 与 RAM 权限

在阿里云 OSS 控制台创建或选择 Bucket，记下名称和地域，例如 `cn-hangzhou`。将读写权限设为「私有」，保持「阻止公共访问」开启。应用上传时也显式设置对象 ACL 为 private。

本地开发可创建专用 RAM 用户的 AccessKey，并授予以下自定义策略。将 `YOUR_BUCKET` 替换成真实 Bucket 名称；如果修改了 NB_OSS_PREFIX，也要相应修改 Resource。不要使用主账号 AccessKey。

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "oss:PutObject",
        "oss:PutObjectAcl",
        "oss:GetObject",
        "oss:DeleteObject"
      ],
      "Resource": ["acs:oss:*:*:YOUR_BUCKET/nanobanana/images/*"]
    }
  ]
}
```

无需授权列出 Bucket、修改 Bucket 或访问其他目录。`PutObjectAcl` 用于显式私有对象权限；`DeleteObject` 用于自检对象清理及存储层物理清理。作品页面的删除仍是软删除。

## 2. 本地配置

编辑现有 `banana_backend/.env.iam`，保留其中 MongoDB、IAM 和供应商配置，只增加或修改以下字段。**不要把示例文件整份覆盖到已有配置上。** `.env.iam` 已被 Git 忽略；密钥不要发到聊天或写入前端环境变量。

```dotenv
NB_IMAGE_STORAGE=oss
NB_OSS_BUCKET=你的Bucket名称
NB_OSS_REGION=cn-hangzhou
NB_OSS_ENDPOINT=
NB_OSS_PREFIX=nanobanana/images
NB_OSS_AUTH_MODE=access_key
ALIBABA_CLOUD_ACCESS_KEY_ID=在本地填写RAM用户AccessKeyId
ALIBABA_CLOUD_ACCESS_KEY_SECRET=在本地填写RAM用户AccessKeySecret
ALIBABA_CLOUD_SECURITY_TOKEN=
```

`NB_OSS_REGION` 必须与 Bucket 实际地域一致，可填写 `cn-hangzhou` 或 `oss-cn-hangzhou`。`NB_OSS_ENDPOINT` 留空时由 SDK 根据地域选择公网 Endpoint；只有后端能访问同地域阿里云内网时，才填写如 `https://oss-cn-hangzhou-internal.aliyuncs.com`。仅支持 HTTPS 的阿里云 OSS Endpoint，不用于 CDN 或自定义域名。

使用静态 STS 凭证时，填写 AccessKeyId、AccessKeySecret、SecurityToken 三项；过期前需手动更新三项并重启。需要自动轮换时，采用下面的官方凭证链。

## 3. ECS / ACK 部署与自动凭证轮换

生产环境可给 ECS 实例绑定具有上述策略的 RAM 角色，使用：

```dotenv
NB_OSS_AUTH_MODE=default
# 不配置静态 AccessKey / SecurityToken；从部署环境中移除这些变量。
# 可选：ALIBABA_CLOUD_ECS_METADATA=实例RAM角色名称
```

官方 `@alicloud/credentials` 默认凭证链也支持 ACK OIDC 等方式。默认链会优先尝试环境中的静态凭证，因此采用角色时应移除静态凭证及不需要的本地凭证配置。每次 OSS 操作前重新向凭证提供器获取凭证，由提供器缓存并刷新角色临时令牌。

## 4. 验证与启动

从 `banana_backend` 目录执行：

```bash
npm install
npm run check:oss
```

自检先编译，再向 `NB_OSS_PREFIX/0/oss-check-随机ID/` 上传一张 1×1 PNG，读取并校验原始字节和 SHA-256，最后删除测试对象。不连接业务数据库或调用图片供应商，不修改业务图片。仅在已准备好配置的 Bucket 上执行；会产生少量 OSS 请求与存储用量。

成功后重启后端：

```bash
npm run start:iam
```

使用项目原有 PORT 和 WORKBENCH_ORIGIN 部署环境值。登录后生成一张图片，确认预览、下载、历史记录和再次用于生成正常，并确认 MongoDB 新记录的 storageProvider 为 oss。完整登录链路仍需现有 IAM / OIDC 服务可用。

## 5. 已有数据与错误处理

- 默认仍为 local；代码安装不会自动开启 OSS。切换 `NB_IMAGE_STORAGE=oss` 只影响新图片，历史 local 记录仍从 NB_IMAGE_ROOT 读取，保留原目录及备份。
- 回切 local 后，已有 oss 记录仍需 OSS 配置和权限才能读取。历史图片批量搬迁不包含在本次接入中。
- 存在 OSS 记录后，不直接更换 Bucket 或地域；对象 Key 不包含 Bucket 标识，跨 Bucket 迁移需同步迁移文件并验证。更换 Prefix 只改变新对象路径，RAM 策略需保留旧路径读取权限。
- 上传前完整解码图片并限制大小/像素，上传通过 Content-MD5 校验，读取后再核对 MongoDB 中的 SHA-256。网络或权限失败不会回退本地并报告成功。
- 缺少 Bucket、地域或静态凭证时启动报配置错误；`OSS_IMAGE_WRITE_FAILED` 表示上传/取凭证失败，检查 Endpoint、网络和 RAM 策略；`IMAGE_FILE_UNAVAILABLE` 表示读取失败、对象丢失或 SHA-256 不一致。异常响应不会包含 SDK 原始签名请求或密钥。
- 如果自检清理失败，会输出仅含测试对象 Key 的提示；在 OSS 控制台检查并删除该测试对象。Bucket 配置、凭证或网络未提供时，只能完成离线测试，不能声称云端连接成功。

## 官方参考

- [Node.js SDK 初始化与 V4 签名](https://www.alibabacloud.com/help/en/oss/initialization-10)
- [Node.js SDK 凭证与自动轮换](https://www.alibabacloud.com/help/en/oss/node-js-configure-access-credentials)
- [Bucket 私有权限](https://help.aliyun.com/zh/oss/user-guide/oss-bucket-acl)
- [阻止公共访问](https://help.aliyun.com/zh/oss/user-guide/block-public-access)
