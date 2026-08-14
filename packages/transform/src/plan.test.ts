import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"

import { Effect, Result } from "effect"
import { decodeRepoPath, FileSystem } from "@effectgrade/domain"
import { inspectInventory } from "@effectgrade/inventory"
import { makeMemoryFileSystem } from "@effectgrade/test-kit"
import { describe, expect, it } from "vitest"

import { applyOperations, compileHonoAdoptionPlan } from "./plan.js"
import { makeOverlayTree } from "./tree.js"

const path = (value: string) => Result.getOrThrow(decodeRepoPath(value))

const fixtureRoot = fileURLToPath(
  new URL("../../../fixtures/repositories/hono-pnpm-basic", import.meta.url),
)

const seedFromFixture = (): Readonly<Record<string, string>> => {
  const seed: Record<string, string> = {}
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = join(directory, entry.name)
      if (entry.isDirectory()) {
        visit(fullPath)
        continue
      }
      seed[relative(fixtureRoot, fullPath).replaceAll("\\", "/")] = readFileSync(fullPath, "utf8")
    }
  }
  visit(fixtureRoot)
  return seed
}

describe("compileHonoAdoptionPlan", () => {
  it("plans core and hono-bridge files against the Hono fixture", async () => {
    const fs = makeMemoryFileSystem(seedFromFixture())
    const inventory = await Effect.runPromise(
      Effect.provideService(inspectInventory(), FileSystem, fs),
    )
    const plan = await Effect.runPromise(
      compileHonoAdoptionPlan({
        inventory,
        profileId: "effect-v4-rc108-node22-pnpm-hono-bridge",
        capabilities: ["core", "hono-bridge"],
      }),
    )

    expect(plan.diagnostics).toEqual([])
    expect(plan.operations.some((operation) => operation.kind === "write-owned-file")).toBe(true)
    expect(plan.operations.some((operation) => operation.kind === "register-hono-route")).toBe(true)

    const tree = makeOverlayTree(fs)
    await Effect.runPromise(applyOperations(tree, plan.operations))
    const afterFirst = tree.changes()

    expect(await Effect.runPromise(tree.readFile(path("src/effect/AppRuntime.ts")))).toContain(
      "ManagedRuntime",
    )
    expect(await Effect.runPromise(tree.readFile(path("src/index.ts")))).toContain(
      'app.route("/effect", effectRoutes)',
    )
    const manifest = JSON.parse(await Effect.runPromise(tree.readFile(path("package.json")))) as {
      readonly dependencies: Readonly<Record<string, string>>
    }
    expect(manifest.dependencies.effect).toBe("4.0.0-rc.108")

    await Effect.runPromise(applyOperations(tree, plan.operations))
    expect(tree.changes()).toEqual(afterFirst)
  })
})
