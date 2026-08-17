import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"))

export default defineConfig({
  plugins: [react()],
  base: "./",
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__:  JSON.stringify(new Date().toISOString()),
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        manualChunks: {
          // React core — muda raramente, fica em cache
          "vendor-react": ["react", "react-dom"],
          // DOMPurify — usado só no ChatRAG, isolado
          "vendor-dompurify": ["dompurify"],
        },
      },
    },
  },
  server: {
    host: "::",
    port: 5174,
    strictPort: true,
    proxy: {
      "/api-proxy": {
        target: "http://localhost:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-proxy/, "/api"),
      },
    },
  },
});
