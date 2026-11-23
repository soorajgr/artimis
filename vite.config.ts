import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import path from "node:path";
import fs from "node:fs";

// Auto-detect deployment target; defaults to Cloudflare Workers (edge)
const preset = process.env["NITRO_PRESET"] || "cloudflare-module";

// node_modules may be a symlink outside the project root; allow its realpath
// so the SSR module runner can load server dependencies.
const nodeModulesReal = fs.realpathSync(path.resolve(__dirname, "node_modules"));

export default defineConfig({
  server: {
    port: 8080,
    fs: { allow: [__dirname, nodeModulesReal] },
  },
  plugins: [
    tanstackStart({
      server: { entry: "server" },
    }),
    react(),
    tailwindcss(),
    nitro({
      preset,
      output: { dir: "dist" },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
