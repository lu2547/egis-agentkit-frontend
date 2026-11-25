# Egis AgentKit 前端

当前配套版本与变更见 [CHANGELOG](CHANGELOG.md)。

Vue 3 + TypeScript + TDesign + Vite。三栏工作台包含任务/原生聊天、专家与专家团、Skill/MCP、个人助理设置、共享申请与管理员页面。

```sh
npm ci
npm run dev -- --host 127.0.0.1
```

默认监听 `5179`。`/api/auth/login` 代理到独立认证服务（开发默认 `http://127.0.0.1:38093`，可用 `AUTH_API_URL` 指定），其他 `/api` 请求代理到 AgentKit App（默认 `http://localhost:38092`，可用 `APP_API_URL` 或 `API_HOST` + `APP_API_PORT` 指定）。代理转发时去掉 `/api`。

浏览器把认证服务返回的 JWT 通过 Bearer 交给 App。正式部署按公司认证流程配置网关。资源和会话均来自 HTTP，浏览器测试夹具位于 `tests/browser`。

聊天输入区支持选择、拖入或粘贴文件附件，包括图片、Word 和 PDF；这三种入口共用上传校验和权限，允许在可补充引导的运行中添加文件。剪贴板需要提供实际文件内容；只有文件路径时仍按普通文字处理。

DOCX 使用本地 Word 文档视图，显示文档样式、分页、表格和内嵌图片，并自动适应工作区宽度；文件不会提交给外部 Office 服务。旧 `.doc` 沿用已有 PDF 转换。分页按文档的分页和分节信息呈现，复杂版式可下载原文件核对。

```sh
npm test
npm run test:browser
npm run build
npm audit
```

浏览器验收启动独立测试 HTTP 服务（38194）和 Vite（5187），默认使用本机 Google Chrome。可在 `playwright.config.ts` 调整浏览器路径。截图位于 `docs/screenshots/`。

- [API 调用清单](docs/API调用清单.md)
- [页面组件规范](docs/V1页面与组件.md)
- [实现与验收记录](docs/实现验收.md)
