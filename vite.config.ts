import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  build: {
    // One bundle: the app is small, the Pryv client is most of it.
    chunkSizeWarningLimit: 800,
  },
});
