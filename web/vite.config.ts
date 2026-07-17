import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4816",
      "/ws": { target: "ws://localhost:4816", ws: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
});
