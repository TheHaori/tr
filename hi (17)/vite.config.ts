import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    viteSingleFile(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      manifest: false,
      includeAssets: [
        "manifest.json",
        "apple-touch-icon.png",
        "icons/icon.svg",
        "icons/pwa-192x192.png",
        "icons/pwa-512x512.png",
        "icons/icon-1024x1024.png",
        "icons/pwa-maskable-192x192.png",
        "icons/pwa-maskable-512x512.png",
        "screenshots/screenshot-wide.png",
        "screenshots/screenshot-narrow.png",
      ],
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,json,woff,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: "/index.html",
      },
      devOptions: {
        enabled: true,
        type: "module",
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
