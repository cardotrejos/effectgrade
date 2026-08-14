import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"

import { Effect, Result } from "effect"
import { decodeRepoPath, FileSystem } from "@effectgrade/domain"
import { inspectInventory } from "@effectgrade/inventory"
import { makeMemoryFileSystem, withWriteFaults } from "@effectgrade/test-kit"
import { describe, expect, it } from "vitest"

import { applyVerifiedPlan } from "./apply.js"
import { compileHonoAdoptionPlan } from "./plan.js"

const fixtureRoot = fileURLToPath(
  new URL("../../../fixtures/repositories/hono-pnpm-basic", import.meta.url),
)
const path = (value: string) => Result.getOrThrow(decodeRepoPath(value))

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

const planFor = async (fs: ReturnType<typeof makeMemoryFileSystem>) => {
  const inventory = await Effect.runPromise(
    Effect.provideService(inspectInventory(), FileSystem, fs),
  )
  return Effect.runPromise(
    compileHonoAdoptionPlan({
      inventory,
      profileId: "effect-v4-rc108-node22-pnpm-hono-bridge",
      capabilities: ["core", "hono-bridge"],
    }),
  )
}

describe("applyVerifiedPlan", () => {
  it("applies once and is a no-op the second time", async () => {
    const fs = makeMemoryFileSystem(seedFromFixture())
    const plan = await planFor(fs)
    const first = await Effect.runPromise(applyVerifiedPlan(fs, plan.operations))
    expect(first.noop).toBe(false)
    expect(first.applied).toBe(true)
    expect(await Effect.runPromise(fs.readFile(path("src/effect/AppRuntime.ts")))).toContain(
      "ManagedRuntime",
    )

    const second = await Effect.runPromise(applyVerifiedPlan(fs, plan.operations))
    expect(second.noop).toBe(true)
    expect(second.applied).toBe(false)
    expect(second.files).toEqual([])
  })

  it("refuses a stale plan and rolls back a failed write", async () => {
    const fs = makeMemoryFileSystem(seedFromFixture())
    const plan = await planFor(fs)
    const stale = await Effect.runPromise(
      applyVerifiedPlan(fs, plan.operations, {
        expectedDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        actualDigest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      }),
    )
    expect(stale.applied).toBe(false)
    expect(stale.diagnostics.some((item) => item.code === "EG5006")).toBe(true)

    const original = await Effect.runPromise(fs.readFile(path("package.json")))
    const faulty = withWriteFaults(fs, 2)
    const failed = await Effect.runPromise(applyVerifiedPlan(faulty, plan.operations))
    expect(failed.applied).toBe(false)
    expect(await Effect.runPromise(fs.readFile(path("package.json")))).toBe(original)
  })

  it("deletes files created by a mid-flush failure", async () => {
    const fs = makeMemoryFileSystem(seedFromFixture())
    const plan = await planFor(fs)
    const originalManifest = await Effect.runPromise(fs.readFile(path("package.json")))
    const originalEntry = await Effect.runPromise(fs.readFile(path("src/index.ts")))

    const failed = await Effect.runPromise(
      applyVerifiedPlan(withWriteFaults(fs, 3), plan.operations),
    )
    expect(failed.applied).toBe(false)
    expect(failed.diagnostics.some((item) => item.code === "EG5004")).toBe(true)
    expect(await Effect.runPromise(fs.readFile(path("package.json")))).toBe(originalManifest)
    expect(await Effect.runPromise(fs.readFile(path("src/index.ts")))).toBe(originalEntry)

    for (const created of [
      "src/effect/AppRuntime.ts",
      "src/effect/index.ts",
      "src/effect/http/routes.ts",
      "src/effect/http/handlers/health.ts",
    ]) {
      const result = await Effect.runPromise(fs.readFile(path(created)).pipe(Effect.result))
      expect(Result.isFailure(result)).toBe(true)
    }
  })
})
