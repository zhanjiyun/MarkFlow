import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;
const appVersion = process.env.npm_package_version ?? "0.0.0";

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [react()],
  build: {
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("@milkdown")) return "milkdown";
          if (id.includes("@codemirror") || id.includes("/codemirror/")) return "codemirror";
          if (
            id.includes("markdown-it") ||
            id.includes("dompurify") ||
            id.includes("katex") ||
            id.includes("yaml")
          ) {
            return "markdown";
          }
          if (id.includes("@tauri-apps")) return "tauri";
          if (id.includes("/react/") || id.includes("/react-dom/")) return "react-vendor";
        },
      },
    },
  },

  // Vite options tailored for Tauri development
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
