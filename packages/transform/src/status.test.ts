import { Effect, Result } from "effect"
import { configFileName, decodeRepoPath, FileSystem, lockFileName } from "@effectgrade/domain"
import { makeMemoryFileSystem } from "@effectgrade/test-kit"
import { describe, expect, it } from "vitest"

import { inspectInventory } from "@effectgrade/inventory"

import { applyVerifiedPlan } from "./apply.js"
import { compileHonoAdoptionPlan } from "./plan.js"
import { projectDesiredState, statusRepository, writeProjectedState } from "./status.js"

const path = (value: string) => Result.getOrThrow(decodeRepoPath(value))

describe("projectDesiredState", () => {
  it("records profile and capabilities as desired state", () => {
    const config = projectDesiredState({
      profileId: "effect-v4-rc108-node22-pnpm-hono-bridge",
      capabilities: ["core", "hono-bridge"],
    })
    expect(config.profile).toBe("effect-v4-rc108-node22-pnpm-hono-bridge")
    expect(config.capabilities).toEqual(["core", "hono-bridge"])
  })
})

describe("statusRepository", () => {
  it("reports unmanaged, clean, and drifted", async () => {
    const fs = makeMemoryFileSystem({
      "package.json": JSON.stringify({
        name: "acme",
        packageManager: "pnpm@11.1.1",
        dependencies: { hono: "4.7.5", "@hono/node-server": "1.13.8" },
        devDependencies: { typescript: "5.9.3" },
      }),
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
      "tsconfig.json": "{}",
      "src/index.ts": `import { Hono } from "hono"\nconst app = new Hono()\n`,
    })

    const unmanaged = await Effect.runPromise(statusRepository(fs))
    expect(unmanaged.category).toBe("unmanaged")

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
    await Effect.runPromise(applyVerifiedPlan(fs, plan.operations))
    await Effect.runPromise(
      writeProjectedState(fs, {
        profileId: "effect-v4-rc108-node22-pnpm-hono-bridge",
        capabilities: ["core", "hono-bridge"],
        planId: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        packages: plan.resolution.packages.map((item) => ({
          name: item.name,
          version: item.version,
        })),
      }),
    )

    const clean = await Effect.runPromise(statusRepository(fs))
    expect(clean.category).toBe("clean")
    expect(await Effect.runPromise(fs.readFile(path(configFileName)))).toContain("hono-bridge")
    expect(await Effect.runPromise(fs.readFile(path(lockFileName)))).toContain("4.0.0-rc.108")

    await Effect.runPromise(fs.writeFile(path("src/effect/AppRuntime.ts"), "export {}\n"))
    const drifted = await Effect.runPromise(statusRepository(fs))
    expect(drifted.category).toBe("drifted")
  })
})
