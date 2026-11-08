/**
 * Builds the web app into the Python package, where the server serves it.
 *
 * `npm run dev` serves it with hot reloading at http://127.0.0.1:5173 and
 * sends `/api` to a running `azathoth-ui --port 8765` (or AZATHOTH_UI_URL).
 * Open that server's printed address once first: its cookie is kept for
 * 127.0.0.1 whatever the port, so the dev server's requests carry it.
 */

import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const outDir = fileURLToPath(new URL("../src/azathoth_ui/static", import.meta.url));

export default defineConfig({
  plugins: [react()],
  build: {
    outDir,
    emptyOutDir: true,
    // Fonts and images stay files: the server's policy admits no data: fonts.
    assetsInlineLimit: 0,
    sourcemap: false,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: process.env.AZATHOTH_UI_URL ?? "http://127.0.0.1:8765",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    restoreMocks: true,
    unstubGlobals: true,
  },
});
