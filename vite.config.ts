import { defineConfig } from "vitest/config";

// Relative asset paths support this project and forks under any Pages subdirectory.
export default defineConfig({
  base: process.env.GITHUB_PAGES ? "./" : "/",
  worker: {
    format: "es",
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
