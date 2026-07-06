import { defineConfig } from "vite";

const GITHUB_PAGES_BASE = "/tscrossing/";

export default defineConfig({
  base: process.env.GITHUB_PAGES === "true" ? GITHUB_PAGES_BASE : "/",
  server: {
    open: true,
  },
});
