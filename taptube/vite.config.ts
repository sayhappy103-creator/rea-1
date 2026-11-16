import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    outDir: "web-dist",
    emptyOutDir: true,
    assetsDir: "assets",
    target: "es2020",
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
  },
});
