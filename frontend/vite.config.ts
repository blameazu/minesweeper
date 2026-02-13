import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), "");
  const env = { ...process.env, ...fileEnv } as Record<string, string | undefined>;
  const apiBase = env.VITE_API_BASE || "http://localhost:8000";
  const basePath = env.VITE_BASE_PATH || (mode === "production" ? "/minesweeper/" : "/");

  return {
    plugins: [react()],
    base: basePath,
    define: {
      // Inline the API base at build time so dist bundles always point to the configured backend
      "import.meta.env.VITE_API_BASE": JSON.stringify(apiBase)
    },
    server: {
      port: 5173,
      host: true
    }
  };
});
