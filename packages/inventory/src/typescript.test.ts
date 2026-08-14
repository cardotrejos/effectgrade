import { Effect } from "effect"
import { FileSystem } from "@effectgrade/domain"
import { makeMemoryFileSystem } from "@effectgrade/test-kit"
import { describe, expect, it } from "vitest"

import { inspectTypeScript } from "./typescript.js"

const run = (seed: Readonly<Record<string, string>>) =>
  Effect.runPromise(
    Effect.provideService(inspectTypeScript(), FileSystem, makeMemoryFileSystem(seed)),
  )

describe("inspectTypeScript", () => {
  it("reads the tsconfig graph, compiler options, references, and plugins", async () => {
    const result = await run({
      "package.json": JSON.stringify({
        name: "acme",
        devDependencies: { typescript: "5.9.3" },
      }),
      "tsconfig.json": `{
        "extends": "./tsconfig.base.json",
        "compilerOptions": {
          "module": "NodeNext",
          "moduleResolution": "NodeNext",
          "strict": true,
          "plugins": [{ "name": "@effect/language-service" }]
        },
        "references": [{ "path": "./packages/domain" }],
        "include": ["src"]
      }`,
      "tsconfig.base.json": `{
        // shared
        "compilerOptions": { "target": "ES2023", "jsx": "react-jsx" }
      }`,
      "packages/domain/tsconfig.json": `{
        "compilerOptions": { "composite": true, "strict": true }
      }`,
    })

    expect(result.typescript.version).toBe("5.9.3")
    expect(result.typescript.configs.map((config) => config.path)).toEqual([
      "packages/domain/tsconfig.json",
      "tsconfig.base.json",
      "tsconfig.json",
    ])
    const root = result.typescript.configs.find((config) => config.path === "tsconfig.json")
    expect(root?.extends).toBe("./tsconfig.base.json")
    expect(root?.module).toBe("NodeNext")
    expect(root?.moduleResolution).toBe("NodeNext")
    expect(root?.strict).toBe(true)
    expect(root?.references).toEqual(["./packages/domain"])
    expect(root?.plugins).toEqual(["@effect/language-service"])
    expect(root?.effectLanguageService).toBe(true)
    expect(result.diagnostics).toEqual([])
  })

  it("reports EG1403 and does not execute a JavaScript tsconfig", async () => {
    const result = await run({
      "package.json": JSON.stringify({ name: "js-config" }),
      "tsconfig.js": `throw new Error("should not execute"); module.exports = { compilerOptions: { strict: false } }`,
      "src/index.ts": "export {}\n",
    })

    expect(result.typescript.configs).toEqual([])
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "EG1403")).toBe(true)
  })
})
