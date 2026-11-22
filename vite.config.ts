import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import path from "node:path";

// Auto-detect deployment target: defaults to "vercel" (Build Output API v3 in .vercel/output)
const preset = process.env.NITRO_PRESET || (process.env.CF_PAGES ? "cloudflare-module" : "vercel");

export default defineConfig({
  server: {
    port: 8080,
  },
  plugins: [
    tanstackStart({
      server: { entry: "server" },
    }),
    react(),
    tailwindcss(),
    nitro({
      preset,
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
