import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

const adaptersEntry = fileURLToPath(
  new URL("./packages/adapters-node/src/index.ts", import.meta.url),
)
const catalogEntry = fileURLToPath(new URL("./packages/catalog/src/index.ts", import.meta.url))
const domainEntry = fileURLToPath(new URL("./packages/domain/src/index.ts", import.meta.url))
const inventoryEntry = fileURLToPath(new URL("./packages/inventory/src/index.ts", import.meta.url))
const testKitEntry = fileURLToPath(new URL("./packages/test-kit/src/index.ts", import.meta.url))
const transformEntry = fileURLToPath(new URL("./packages/transform/src/index.ts", import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      "@effectgrade/adapters-node": adaptersEntry,
      "@effectgrade/catalog": catalogEntry,
      "@effectgrade/domain": domainEntry,
      "@effectgrade/inventory": inventoryEntry,
      "@effectgrade/test-kit": testKitEntry,
      "@effectgrade/transform": transformEntry,
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
