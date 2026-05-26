import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon.svg"],
      workbox: {
        // The Verovio WASM toolkit is ~8 MB; raise the precache size limit
        // above Workbox's 2 MiB default so it is cached for offline use.
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        // Take over open tabs as soon as a new build is fetched, instead of
        // waiting for every Vercel tab to close. Without this, users on the
        // cached previous bundle keep seeing yesterday's CSS even after a
        // successful deploy — a real bug we hit on the lane highlights.
        skipWaiting: true,
        clientsClaim: true,
      },
      manifest: {
        name: "Arpeggio",
        short_name: "Arpeggio",
        description: "Piano practice tool — falldown notes and interactive sheet music.",
        theme_color: "#15151a",
        background_color: "#15151a",
        display: "standalone",
        icons: [
          {
            src: "icons/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    exclude: [
      "tests/e2e/**",
      "node_modules/**",
      ".claude/**",
      ".claire/**",
      ".clone/**",
    ],
  },
});
