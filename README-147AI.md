# 147AI Gemini 图片模型

已接入 `nn.147ai.com` 的两个模型：

| 页面名称                 | model ID                     | 用途               | 分辨率                                      |
| ------------------------ | ---------------------------- | ------------------ | ------------------------------------------- |
| Gemini 2.5 Flash · 147AI | `gemini-2.5-flash-image`     | 文生图、参考图编辑 | 约 1K，由模型决定实际尺寸；不发送 imageSize |
| Gemini 3 Pro · 147AI     | `gemini-3-pro-image-preview` | 文生图、参考图编辑 | 1K / 2K / 4K                                |

在现有任务卡或批量设置中选择模型。不上传参考图时执行文生图，上传参考图时执行图片编辑；沿用当前工作台最多四张参考图的限制。切换模型、应用批量参数、复制任务和复用历史时会修正不支持的分辨率，已有供应商的 2K / 4K 选项保持兼容。

## 服务端配置

编辑已有 `.env.iam`，保留原有 IAM、数据库和 OSS 配置：

```dotenv
AI147_BASE_URL=https://nn.147ai.com
AI147_API_KEY=在本地填写该平台的API令牌
```

不要把 Key 发到聊天、提交到 Git、放到前端或通过请求体传入。请求仅接受服务器配置的 Key 和 Base URL，模型 ID 限定为上表两个值。

当前平台文档明确给出的地址是 `https://nn.147ai.com/v1beta/models/{model}:generateContent`。使用 Gemini 原生 JSON：`contents[].parts` 中传提示词和带正确 MIME 的 `inlineData`，`generationConfig.imageConfig` 设置比例及适用的分辨率。请求采用该平台文档中的 Authorization 头，禁止跟随重定向。

## 鉴权、存储与失败处理

前端调用 `/api/ai147/generate`；后端复用 IamSessionGuard 和 ImageGateway，先进行会话、CSRF、租户及 IAM 任务授权，再调用模型。返回图片经现有 ImageStorage 完整解码校验并写入私有 OSS，MongoDB 保存图片元数据；浏览器仅收到 `/api/workbench/assets/:id/preview`，历史记录、预览、下载和再次读取均沿用已有授权接口。

只采用最终完成候选中的图片，过滤标记为 thought 的中间思考图片，不转发供应商原始响应。兼容 inlineData / inline_data，保留 PNG、JPEG、WebP 的实际 MIME。参考图会完整解码验证，不接受由客户端指定的远程地址。已有受保护资产地址可以经过共享鉴权层解析为图片输入。

生成请求最长等待 10 分钟，浏览器请求超时稍长以容纳图片存储和权限登记；用户取消时会中断后端到上游的连接。取消连接不保证上游已开始的任务停止计费。上游 HTTP 错误、无图片、审核拒绝、无效 JSON、超大响应等都返回失败，不伪造成功图片或泄漏原始签名请求与密钥。

## 验证

```bash
# 离线请求、结果解析、授权及存储测试
npm test -- --runInBand
npm run build:iam

# 仅检查本地是否已配置令牌，不产生模型调用
npm run check:ai147

# 实际生成：两个模型分别执行文生图和参考图编辑，共四次平台调用
npm run check:ai147 -- --live
```

实测命令使用简单几何图形提示词和程序生成的蓝色参考图，输出保存到 OSS 独立测试目录，校验 SHA-256 后清理测试对象。它不创建业务数据库任务或伪造用户身份。仅写入不含密钥及图片二进制的 `data/ai147-check-*.json` 验证结果；实际生成会使用平台额度，需主动加 `--live`。

改完配置和代码后编译并重启后端，沿用当前开发环境的 `PORT=3100` 与 `WORKBENCH_ORIGIN=http://localhost:5274`。前端开发服务会自动更新；部署构建需运行前端 `npm run build`。

## 参考文档

- [147AI Gemini 原生图片接口](https://147api-nn.apifox.cn/428297201e0)
- [Google Generate Content 图片参数](https://ai.google.dev/gemini-api/docs/generate-content/image-generation)
