# 局域网访问

当前前端地址：`http://192.168.1.178:5274/`。局域网内电脑通过该地址访问项目；本机仍可使用 `http://localhost:5274/`。

## 运行配置

前端监听 `0.0.0.0:5274`，浏览器 API 请求由前端代理到本机后端 `127.0.0.1:3100`。从对应目录启动：

```bash
# banana_backend：首次或改后端代码后先编译
npm run build:iam
npm run start:lan

# banana_front：另一个终端
npm run dev:lan
```

后端 `.env.iam` 已配置精确的应用来源：

```dotenv
WORKBENCH_ORIGIN=http://localhost:5274
WORKBENCH_ORIGINS=http://127.0.0.1:5274,http://192.168.1.178:5274,https://679go8vq5053.vicp.fun
OIDC_BROWSER_PATH=/realms/nexus
```

隧道地址为 `https://679go8vq5053.vicp.fun`，转发到前端 5274 端口。Vite 对该域名设置精确 `allowedHosts`，登录代理使用同一 HTTPS 来源。域名变更时同步修改前端 `vite.config.ts` 的 `tunnelOrigin`、上述来源列表及 IdP 精确回调。

登录 state、授权码兑换和新会话会绑定发起登录时的应用来源。POST 等修改请求仍校验来源白名单及 CSRF Token；新增会话还校验与会话绑定的来源。已有无 origin 字段的会话仍兼容。

## 身份登录

Keycloak 保持当前本机回环监听和规范 issuer，IAM 的 JWT 校验配置不变。前端仅代理公开的 `/realms/nexus/` 与 `/resources/` 路径，并把登录表单、静态资源和重定向中的本机 IdP 地址改写成访问项目时的地址。因此其他电脑无需连接本机的 8180 端口，也不会被导向自己电脑的 localhost。

代理不包含 Keycloak 的 admin/master 入口，并拒绝路径穿越。MongoDB、Redis、IAM 管理端的监听配置没有变更。

当前 image-workbench 客户端已注册上述来源对应的精确 `/api/auth/callback`，同时保留已有回调；更新也持久化到相邻 Nexus_IAM 项目的 `deploy/generated/realm.json`，没有重建 realm 或授予新的业务角色。

## 本机 IP 变化时

1. 更新 `.env.iam` 中的 WORKBENCH_ORIGINS，使用新的精确地址和 5274 端口。
2. 运行以下命令同步精确的 IdP 回调，再重启后端：

```bash
# 默认仅检查当前回调配置，不写入
npm run configure:lan-idp

# 应用并验证回调，同时持久化现有 realm 配置
npm run configure:lan-idp -- --apply
```

脚本只在内存中使用现有 Nexus_IAM 管理凭证，终端不输出凭证或令牌。来源列表采用精确 URL，不使用通配符或放开所有来源。前端代理为当前开发环境配置；部署生产版本时需由实际 Web 服务器提供等效反向代理及精确回调配置。
