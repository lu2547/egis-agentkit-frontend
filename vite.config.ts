import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const host =
    env.API_HOST && env.API_HOST !== "0.0.0.0" ? env.API_HOST : "localhost";
  const knowledge = env.KNOWLEDGE_API_URL
    ? new URL(env.KNOWLEDGE_API_URL)
    : null;
  return {
    cacheDir: env.VITE_CACHE_DIR || "node_modules/.vite",
    plugins: [vue()],
    // Designer 的 CommonJS 依赖和表格本体共用一份预构建，避免热加载混入两份命名空间。
    optimizeDeps: {
      include: [
        "@mescius/spread-sheets",
        "@mescius/spread-sheets-designer",
        "@mescius/spread-sheets-io",
        "@mescius/spread-sheets-print",
        "@mescius/spread-sheets-resources-zh",
        "@mescius/spread-sheets-designer-resources-cn",
        "@mescius/spread-sheets-languagepackages",
      ],
    },
    server: {
      port: 5179,
      proxy: {
        ...(knowledge
          ? {
              "^/knowledge(?:/|$)": {
                target: knowledge.origin,
                changeOrigin: true,
                rewrite: (path: string) =>
                  knowledge.pathname.replace(/\/$/, "") +
                  path.slice("/knowledge".length),
              },
            }
          : {}),
        "/api": {
          target:
            env.APP_API_URL || `http://${host}:${env.APP_API_PORT || "38092"}`,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
  };
});
