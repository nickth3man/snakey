import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  base: mode === "production" ? "/snakey/" : "/",
  server: {
    open: true,
  },
}));
