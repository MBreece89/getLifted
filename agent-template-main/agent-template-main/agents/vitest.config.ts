import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["dev-team/**/*.test.ts"],
    environment: "node",
  },
});
