# Egis AgentKit 前端

Vue 3 + TypeScript + TDesign + Vite。三栏工作台包含任务/原生聊天、专家与专家团、Skill/MCP、个人助理设置、共享申请与管理员页面。

```sh
npm ci
npm run dev
```

默认监听 `5179`，浏览器 `/api` 请求代理到 `http://localhost:38092` 并去掉 `/api`。可用 `APP_API_URL`，或 `API_HOST` + `APP_API_PORT` 指定 App 地址。前端仅连接 `egis-agentkit-app`。

身份通过 Bearer 传递；演示登录由 App 的 `/auth/login` 显式开启，正式环境需接入组织 JWT。前端不含固定用户或密钥。资源和会话均来自 HTTP；测试夹具只位于 `tests/browser`，不会进入生产构建。

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
