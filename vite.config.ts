import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const host =
    env.API_HOST && env.API_HOST !== "0.0.0.0" ? env.API_HOST : "localhost";
  return {
    plugins: [vue()],
    server: {
      port: 5179,
      proxy: {
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
