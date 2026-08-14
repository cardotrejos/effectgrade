import { Effect } from "effect"
import { FileSystem } from "@effectgrade/domain"
import { makeMemoryFileSystem } from "@effectgrade/test-kit"
import { describe, expect, it } from "vitest"

import { renderPackageGraph, renderPackageGraphJson } from "./render.js"
import { inspectPackageGraph } from "./workspace.js"

const inventoryOf = (seed: Readonly<Record<string, string>>) =>
  Effect.runPromise(
    Effect.provideService(inspectPackageGraph(), FileSystem, makeMemoryFileSystem(seed)),
  )

describe("renderPackageGraph", () => {
  it("prints the package manager, workspace, packages, and targets", async () => {
    const inventory = await inventoryOf({
      "package.json": JSON.stringify({
        name: "acme",
        private: true,
        packageManager: "pnpm@11.1.1",
      }),
      "pnpm-workspace.yaml": "packages:\n  - apps/*\n",
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
      "apps/api/package.json": JSON.stringify({
        name: "api",
        scripts: { start: "node dist/index.js" },
      }),
    })

    const human = renderPackageGraph(inventory)

    expect(human).toContain("Root              .")
    expect(human).toContain("Package manager   pnpm")
    expect(human).toContain("Workspace         pnpm workspace")
    expect(human).toContain("apps/api")
    expect(human).toContain("api")
    expect(human).toMatch(/kind\s+unknown/)
  })

  it("emits stable JSON from the inspected graph", async () => {
    const seed = {
      "package.json": JSON.stringify({ name: "solo", packageManager: "npm@10.9.2" }),
      "package-lock.json": '{"lockfileVersion": 3}',
    }
    const first = renderPackageGraphJson(await inventoryOf(seed))
    const second = renderPackageGraphJson(await inventoryOf(seed))
    const parsed = JSON.parse(first) as {
      readonly repositoryKind: string
      readonly packageManager: { readonly value: string }
    }

    expect(first).toBe(second)
    expect(parsed.repositoryKind).toBe("single-package")
    expect(parsed.packageManager.value).toBe("npm")
    expect(first.startsWith("{")).toBe(true)
  })
})
