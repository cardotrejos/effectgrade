import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

const domainEntry = fileURLToPath(new URL("./packages/domain/src/index.ts", import.meta.url))
const testKitEntry = fileURLToPath(new URL("./packages/test-kit/src/index.ts", import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      "@effectgrade/domain": domainEntry,
      "@effectgrade/test-kit": testKitEntry,
    },
  },
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      include: ["packages/*/src/**/*.ts", "apps/*/src/**/*.ts"],
      exclude: ["**/*.test.ts"],
    },
  },
})
