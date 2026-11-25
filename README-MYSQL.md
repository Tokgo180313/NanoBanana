# 模型管理 MySQL 配置

1. 在 MySQL 8.4 或兼容版本上创建独立数据库，例如 `nanobanana_models`，并为迁移账号授权。
2. 在后端进程环境或本地 `.env.iam` 中设置 `NB_MYSQL_URI`，格式为 `mysql://用户:密码@主机:3306/库名`。用户名或密码中的 URL 特殊字符需要编码。
3. 在后端目录运行 `npm run migrate:mysql`。使用有建表权限的迁移账号。重复运行会跳过已登记的迁移。
4. 为应用设置同库的运行账号连接串并启动后端。运行账号可按业务需要授予数据读写权限。设置连接串后，启动时会检查连接。未设置时现有工作台仍可启动。

迁移创建提供商、模型、默认模型和配置审计表。API Key 字段用于保存 AES-256-GCM 密文、nonce、认证标签和密钥版本。提供商写入接口先加密再落库，加密主密钥由独立 Secret 或密钥服务提供。

## 启用管理页面

1. 在 Nexus_IAM 的 `image-workbench` 应用登记 `model:config:read` 和 `model:config:write`。随部署运行本仓库 `migrations/nexus-iam/register-model-config-permissions.sql`，目标为 IAM 数据库。然后在 IAM 角色管理中给指定 NanoBanana 管理员授予两项权限。只读角色仅授予 read。保留这些角色原有的权限和应用访问授权。
2. 设置 `NB_MODEL_ADMIN_TENANT_ID` 为管理目录的 Nexus_IAM 租户 ID。当前数据库使用应用级目录，接口只允许该租户访问。
3. 生成 32 字节随机主密钥（例如用 `openssl rand -base64 32`），将输出配置到独立部署 Secret `NB_MODEL_KEY_BASE64`，并设置 `NB_MODEL_KEY_VERSION`（默认 `1`）。保留用于已有密文的主密钥及版本。
4. 部署前后端，从「模型接入」新建提供商和模型。工作台通过已启用模型读取提供商地址和 API Key。

工作台生成使用 Linkfox 图片、147AI 图片和火山方舟视频协议。已有模型关联时，提供商协议锁定。API Key 编辑留空表示保留当前值。

## 切换工作台生成模型

1. 备份目标库，先运行 `npm run migrate:mysql`。随后在部署环境用原有的
   `LINKFOX_API_KEY`、`AI147_API_KEY`、`ARK_API_KEY`、
   `ARK_VIDEO_MODEL` 和模型加密主密钥运行 `npm run seed:generation-models`。
   导入在一个事务内登记三个提供商、五个图片模型、一个视频模型、默认项和旧版请求映射。
   成功后再次运行会保留管理员修改。若目标库已有对应协议的提供商，脚本会退出。
   请在测试库先核对现有记录，保留其配置并由数据库管理员补齐对应的旧版映射和默认项。
2. 提供商的 API 地址按协议填写。Linkfox 填写图片 API 公共前缀
   `https://sbappstoreapi.ziniao.com/openapi-router/linkfox-ai/image/v2`。
   147AI 填写站点根地址，火山方舟填写 `/api/v3/contents/generations/tasks`
   对应的完整地址。额外获准的提供商域名分别通过
   `NB_MODEL_HOSTS_LINKFOX`、`NB_MODEL_HOSTS_AI147` 和
   `NB_MODEL_HOSTS_ARK` 设置，多个域名用逗号分隔。
3. 先部署后端并确认图片、视频目录有预期的默认项，再部署前端。
   旧版视频请求使用 `generation_model_aliases` 中协议为 `ark`、
   旧模型字段为空的记录。切换管理页的默认模型不会改变该映射。
4. 存量 Linkfox 和方舟异步任务继续使用原查询配置。待这些任务结束后，
   再清理运行环境中的旧查询配置。方舟 API Key 如果还用于范围外的历史接口，应继续保留。
   切换后的异步任务通过 `provider_connection_versions` 查询旧配置。
   轮换提供商 API Key 时，保留原上游凭据的有效性，直至相关任务结束。
   轮换加密主密钥时，将仍需使用的旧版本主密钥保存在部署 Secret
   `NB_MODEL_PREVIOUS_KEYS_JSON` 中，格式为以版本为键、Base64 密钥为值的 JSON 对象。

### DeepSeek 提示词优化

1. 应用模型管理迁移，并配置现有的模型凭据加密密钥。
2. 在「提供商」新增 DeepSeek，协议选「OpenAI Chat Completions 兼容」，API 地址填写 `https://api.deepseek.com`，在表单中录入 API Key。
3. 在「模型」新增并启用文本模型，选择 DeepSeek 提供商，上游模型 ID 填写 `deepseek-flash`。启用后点击「设为默认」。后端每次优化时读取数据库里的默认文本模型，后台变更即时生效。
4. 在测试环境分别验证图片和视频页的优化、回填及生成。没有启用的默认文本模型时，优化接口会提示检查配置。
