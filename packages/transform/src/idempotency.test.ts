import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"

import { Effect } from "effect"
import { FileSystem } from "@effectgrade/domain"
import { inspectInventory } from "@effectgrade/inventory"
import { makeMemoryFileSystem } from "@effectgrade/test-kit"
import { describe, expect, it } from "vitest"

import { remainingPlanChanges, verifyPlanIdempotency } from "./idempotency.js"
import { applyOperations, compileHonoAdoptionPlan } from "./plan.js"
import { flushOverlay, makeOverlayTree } from "./tree.js"

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

describe("verifyPlanIdempotency", () => {
  it("reports remaining changes before apply and an empty plan after apply", async () => {
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

    const before = await Effect.runPromise(remainingPlanChanges(fs, plan.operations))
    expect(before.length).toBeGreaterThan(0)

    const tree = makeOverlayTree(fs)
    await Effect.runPromise(applyOperations(tree, plan.operations))
    await Effect.runPromise(flushOverlay(tree, fs))

    const after = await Effect.runPromise(verifyPlanIdempotency(fs, plan.operations))
    expect(after.id).toBe("idempotency")
    expect(after.ok).toBe(true)
    expect(after.detail).toContain("empty")
    expect(await Effect.runPromise(remainingPlanChanges(fs, plan.operations))).toEqual([])
  })
})
