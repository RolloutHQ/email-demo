import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.PORT || 5173),
    proxy: {
      "/api": {
        target: process.env.BACKEND_URL || "http://127.0.0.1:4567",
        changeOrigin: true
      }
    }
  }
});
