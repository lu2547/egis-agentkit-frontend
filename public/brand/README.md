# 养老险GPT 品牌素材

项目使用以下文件，由 `src/components/common/BrandIdentity.vue` 随主题选择：

- `wordmark-v2-light.png`：浅色背景，深色横版文字。
- `wordmark-v2-dark.png`：深色背景，白色横版文字，无外发光。
- `welcome-v2-light.png`：浅色首页插画，无内嵌标语。
- `welcome-v2-dark.png`：深色首页插画，无内嵌标语。
- `sheep-head-v1.png`：从用户指定的彩色品牌羊头参考图提取的透明头像，个人助理目录、输入框和回复共用；256px。
- `favicon-v3.png`：同一彩色羊头导出的 64px 原始标签页素材。
- `favicon-v4.svg`：当前标签页图标，以 SVG 视口复用 v3 PNG、放大羊头并校正视觉中心，减少留白和偏上问题。

来源是用户在本轮提供的四张图片。使用内置 image_gen 编辑，原始文件保留；未用 CSS 反色来模拟深色素材。

编辑要求（最终提示词要点）：

1. 横版 Logo：保持羊形图标、养老险GPT 的字体风格、橙色点缀和横排结构；把字形从斜体调整为直立。浅色背景使用深色文字，深色背景使用白字。去除外部光晕、雾状底色与阴影，保留真正透明背景。
2. 首页插画：保留原图的品牌面板、机器人、颜色与位置，移除底部“今天，想一起完成什么？”以及橙色下划线；清理棋盘格背景，保留透明通道。标题由页面文本渲染，避免重复。

完整素材目录：`/Users/frankie/Documents/work/workspace/ai-app/egis/egis-agentkit-frontend/public/brand`。

彩色头像来源：用户提供的 `codex-clipboard-5e3b03db-aba8-442a-b1c2-9feab4aaa40d.png`。image_gen 提取完整羊头、橙色耳朵和蝴蝶结，保持蓝紫面屏与白色眼睛，透明背景；再用 sips 生成头像与 favicon 尺寸。原生成文件保留于 Codex generated_images，不使用 CSS 滤镜模拟。
