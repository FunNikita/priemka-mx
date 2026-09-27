import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { createDevMaxInitData } from "./vite-dev-max-auth.ts";

export default defineConfig(({ mode }) => {
  const webRoot = fileURLToPath(new URL(".", import.meta.url));
  const env = loadEnv(mode, webRoot, "");
  const target = env.API_PROXY_TARGET || "http://127.0.0.1:3000";
  const stubEnabled = env.DEV_MAX_AUTH_STUB === "true";
  return ({
    envDir: webRoot,
    plugins: [react(), {
      name: "local-dev-max-auth",
      apply: "serve",
      configureServer(server) {
        if (!stubEnabled) return;
        server.middlewares.use((req, res, next) => {
          const url = new URL(req.url ?? "/", "http://localhost");
          if (url.pathname !== "/__dev/max-init-data") return next();
          const remote = req.socket.remoteAddress;
          if (!remote || !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote)) {
            res.statusCode = 403;
            return res.end();
          }
          if (req.method !== "GET" || url.search) {
            res.statusCode = 405;
            return res.end();
          }
          if (!env.DEV_MAX_BOT_TOKEN || !env.DEV_MAX_USER_ID || !env.DEV_MAX_FIRST_NAME || !env.DEV_MAX_LAST_NAME) {
            res.statusCode = 503;
            return res.end();
          }
          try {
            const initData = createDevMaxInitData({
              botToken: env.DEV_MAX_BOT_TOKEN,
              userId: env.DEV_MAX_USER_ID,
              firstName: env.DEV_MAX_FIRST_NAME,
              lastName: env.DEV_MAX_LAST_NAME,
            });
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.setHeader("Cache-Control", "no-store");
            return res.end(JSON.stringify({ initData }));
          } catch {
            res.statusCode = 503;
            return res.end();
          }
        });
      },
    }],
    base: "/app/",
    server: {
      host: stubEnabled ? "127.0.0.1" : "0.0.0.0",
      port: 5173,
      proxy: Object.fromEntries(["/api", "/photo", "/doc"].map((path) => [path, { target, changeOrigin: true }])),
    },
  });
});
