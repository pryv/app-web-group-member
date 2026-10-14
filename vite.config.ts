import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// `pryv` and `@pryv/cmc` are CommonJS. During development they are linked
// from a lib-js checkout (see README, Development), which Vite does not
// pre-bundle by default: list them so the dev server converts them.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    include: ["pryv", "@pryv/cmc"],
  },
  build: {
    // One bundle: the app is small, the Pryv client is most of it.
    chunkSizeWarningLimit: 800,
    commonjsOptions: {
      include: [/node_modules/, /components\/pryv/],
    },
  },
});
