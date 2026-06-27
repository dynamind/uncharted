import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// `vite build` inlines everything into one self-contained dist/index.html, so the
// original "single HTML file, opens from file://" requirement still holds — we just
// gain a dev server and a Vitest harness for the routing logic.
export default defineConfig({
  plugins: [viteSingleFile()],
  build: { target: "es2022" },
  test: {
    environment: "node",
    include: ["test/**/*.test.js"],
  },
});
