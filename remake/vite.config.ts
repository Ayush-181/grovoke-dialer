import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Standalone design sandbox: no TanStack server, auth, database or voice provider.
export default defineConfig({
  root: resolve(import.meta.dirname, ".."),
  envDir: false,
  plugins: [react()],
  resolve: { preserveSymlinks: true },
  server: { host: "127.0.0.1", port: 4174, strictPort: true, hmr: false },
  build: {
    outDir: "dist/remake",
    emptyOutDir: true,
    rollupOptions: { input: resolve(import.meta.dirname, "index.html") },
  },
});
