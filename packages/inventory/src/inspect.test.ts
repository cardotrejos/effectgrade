import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"

import { Effect } from "effect"
import { FileSystem } from "@effectgrade/domain"
import { makeMemoryFileSystem } from "@effectgrade/test-kit"
import { describe, expect, it } from "vitest"

import { inspectInventory } from "./inspect.js"
import { renderPackageGraph } from "./render.js"

const fixtureRoot = (name: string) =>
  fileURLToPath(new URL(`../../../fixtures/repositories/${name}`, import.meta.url))

const seedFromFixture = (name: string): Readonly<Record<string, string>> => {
  const root = fixtureRoot(name)
  const seed: Record<string, string> = {}
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules") {
        continue
      }
      const fullPath = join(directory, entry.name)
      if (entry.isDirectory()) {
        visit(fullPath)
        continue
      }
      seed[relative(root, fullPath).replaceAll("\\", "/")] = readFileSync(fullPath, "utf8")
    }
  }
  visit(root)
  return seed
}

const inspectFixture = (name: string) =>
  Effect.runPromise(
    Effect.provideService(
      inspectInventory(),
      FileSystem,
      makeMemoryFileSystem(seedFromFixture(name)),
    ),
  )

describe("inspectInventory fixtures", () => {
  it("inventories the hono-pnpm-basic fixture as a Node Hono server", async () => {
    const inventory = await inspectFixture("hono-pnpm-basic")
    const target = inventory.targets[0]
    const human = renderPackageGraph(inventory)

    expect(inventory.packageManager.value).toBe("pnpm")
    expect(inventory.typescript?.version).toBe("5.9.3")
    expect(target?.kind).toBe("server")
    expect(target?.runtime.value).toBe("node")
    expect(target?.frameworks[0]?.id).toBe("hono")
    expect(target?.entrypoints).toEqual(["src/index.ts"])
    expect(target?.tsconfig).toBe("tsconfig.json")
    expect(human).toContain("TypeScript        5.9.3")
    expect(human).toContain("Framework         Hono")
    expect(human).toContain("Entry point       src/index.ts")
  })

  it("selects the Hono workspace package as a server target", async () => {
    const inventory = await inspectFixture("hono-npm-workspace")
    const api = inventory.targets.find((target) => target.root === "apps/api")
    const lib = inventory.targets.find((target) => target.root === "packages/lib")

    expect(inventory.repositoryKind).toBe("workspace")
    expect(api?.kind).toBe("server")
    expect(api?.frameworks[0]?.id).toBe("hono")
    expect(lib?.kind).toBe("unknown")
    expect(lib?.frameworks).toEqual([])
  })

  it("records ambiguity and unexecuted JS tsconfig diagnostics from fixtures", async () => {
    const ambiguous = await inspectFixture("hono-ambiguous-apps")
    expect(ambiguous.diagnostics.some((diagnostic) => diagnostic.code === "EG1104")).toBe(true)

    const jsConfig = await inspectFixture("tsconfig-js-only")
    expect(jsConfig.diagnostics.some((diagnostic) => diagnostic.code === "EG1403")).toBe(true)
    expect(jsConfig.typescript?.configs).toEqual([])
  })
})
