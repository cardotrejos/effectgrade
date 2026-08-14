import { readdirSync, readFileSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

import { digestDirectory, makeNodeFileSystem } from "@effectgrade/adapters-node"
import { expectExitCode, makeMemoryFileSystem, withTempDir } from "@effectgrade/test-kit"
import { describe, expect, it } from "vitest"

import { cliVersion, runCli } from "./cli.js"

const fixtureRoot = (name: string) =>
  fileURLToPath(new URL("../../../fixtures/repositories/" + name, import.meta.url))

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

const packageJson = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../package.json"), "utf8"),
) as { readonly version: string }

describe("cli contract", () => {
  it("keeps the exported version aligned with the package", () => {
    expect(cliVersion).toBe(packageJson.version)
  })

  it("prints help on --help", async () => {
    const result = await runCli(["--help"])
    expectExitCode(result, 0)
    expect(result.stdout).toContain("verified Effect adoption")
    expect(result.stdout).toContain("inspect")
    expect(result.stderr).toBe("")
  })

  it("prints version on version", async () => {
    const result = await runCli(["version"])
    expectExitCode(result, 0)
    expect(result.stdout).toContain("EffectGrade 0.0.0")
    expect(result.stdout).toContain("4.0.0-rc.108")
    expect(result.stderr).toBe("")
  })

  it("prints JSON version when --json is set", async () => {
    const result = await runCli(["--json", "version"])
    expectExitCode(result, 0)
    expect(JSON.parse(result.stdout)).toMatchObject({
      product: "EffectGrade",
      version: "0.0.0",
      engineEffect: "4.0.0-rc.108",
    })
    expect(result.stderr).toBe("")
  })

  it("refuses unimplemented commands without polluting stdout", async () => {
    const result = await runCli(["doctor"])
    expectExitCode(result, 2)
    expect(result.stdout).toBe("")
    expect(result.stderr).toContain("not implemented")
  })

  it("applies a saved plan and is a no-op on the second apply", async () => {
    const fileSystem = makeMemoryFileSystem(seedFromFixture("hono-pnpm-basic"))
    await runCli(["plan", "add", "core", "hono-bridge"], { fileSystem })
    const first = await runCli(["apply"], { fileSystem })
    expectExitCode(first, 0)
    expect(first.stdout).toContain("Applied")
    expect(first.stdout).toContain("src/effect/AppRuntime.ts")

    const second = await runCli(["apply"], { fileSystem })
    expectExitCode(second, 0)
    expect(second.stdout).toContain("no-op")

    const status = await runCli(["status"], { fileSystem })
    expectExitCode(status, 0)
    expect(status.stdout).toContain("clean")
  })

  it("plans core and hono-bridge against a Hono fixture", async () => {
    const result = await runCli(["plan", "add", "core", "hono-bridge"], {
      fileSystem: makeMemoryFileSystem(seedFromFixture("hono-pnpm-basic")),
    })
    expectExitCode(result, 0)
    expect(result.stdout).toContain("Plan sha256:")
    expect(result.stdout).toContain("effect-v4-rc108-node22-pnpm-hono-bridge")
    expect(result.stdout).toContain("+ src/effect/AppRuntime.ts")
    expect(result.stdout).toContain("~ src/index.ts")
  })

  it("lists bundled capabilities and profiles", async () => {
    const result = await runCli(["catalog"])
    expectExitCode(result, 0)
    expect(result.stdout).toContain("core")
    expect(result.stdout).toContain("hono-bridge")
    expect(result.stdout).toContain("effect-v4-rc108-node22-pnpm-hono-bridge")
    expect(result.stdout).toContain("4.0.0-rc.108")
  })

  it("shows capability and profile detail", async () => {
    const capability = await runCli(["catalog", "capability", "core"])
    expectExitCode(capability, 0)
    expect(capability.stdout).toContain("Effect core")
    expect(capability.stdout).toContain("foundation")

    const profile = await runCli(["catalog", "profile", "effect-v4-rc108-node22-pnpm-hono-bridge"])
    expectExitCode(profile, 0)
    expect(profile.stdout).toContain("4.0.0-rc.108")
    expect(profile.stdout).toContain("sha256:")
  })

  it("verifies in a sandbox without changing the source fixture", async () => {
    await withTempDir(async (root) => {
      const seed = seedFromFixture("hono-pnpm-basic")
      for (const [rel, contents] of Object.entries(seed)) {
        const fullPath = join(root, rel)
        await mkdir(dirname(fullPath), { recursive: true })
        await writeFile(fullPath, contents)
      }
      const fileSystem = makeNodeFileSystem(root)
      await runCli(["plan", "add", "core", "hono-bridge"], { fileSystem, sourceRoot: root })
      const before = await digestDirectory(root)
      const verified = await runCli(["verify"], { fileSystem, sourceRoot: root })
      expectExitCode(verified, 0)
      expect(verified.stdout).toContain("passed")
      expect(verified.stdout).toContain("unchanged")
      expect(await digestDirectory(root)).toBe(before)
      await expect(readFile(join(root, "src/effect/AppRuntime.ts"), "utf8")).rejects.toThrow()
    })
  })

  it("adopts core and hono-bridge and is a no-op the second time", async () => {
    await withTempDir(async (root) => {
      const seed = seedFromFixture("hono-pnpm-basic")
      for (const [rel, contents] of Object.entries(seed)) {
        const fullPath = join(root, rel)
        await mkdir(dirname(fullPath), { recursive: true })
        await writeFile(fullPath, contents)
      }
      const fileSystem = makeNodeFileSystem(root)
      const first = await runCli(["adopt", "core", "hono-bridge"], { fileSystem, sourceRoot: root })
      expectExitCode(first, 0)
      expect(first.stdout).toContain("Plan sha256:")
      expect(first.stdout).toContain("Verify")
      expect(first.stdout).toContain("Applied")
      expect(first.stdout).toContain("clean")
      expect(await readFile(join(root, "src/effect/AppRuntime.ts"), "utf8")).toContain(
        "ManagedRuntime",
      )

      const second = await runCli(["adopt", "core", "hono-bridge"], {
        fileSystem,
        sourceRoot: root,
      })
      expectExitCode(second, 0)
      expect(second.stdout).toContain("no-op")
      expect(second.stdout).not.toMatch(/^\s*[+~-] /m)
      const firstPlan = first.stdout.match(/Plan (sha256:[a-f0-9]+)/)?.[1]
      const secondPlan = second.stdout.match(/Plan (sha256:[a-f0-9]+)/)?.[1]
      expect(firstPlan).toBeDefined()
      expect(secondPlan).toBe(firstPlan)
    })
  })

  it("verifies the plan just created, not the lexicographically last hash", async () => {
    await withTempDir(async (root) => {
      const seed = seedFromFixture("hono-pnpm-basic")
      for (const [rel, contents] of Object.entries(seed)) {
        const fullPath = join(root, rel)
        await mkdir(dirname(fullPath), { recursive: true })
        await writeFile(fullPath, contents)
      }
      const fileSystem = makeNodeFileSystem(root)
      const planned = await runCli(["plan", "add", "core", "hono-bridge"], {
        fileSystem,
        sourceRoot: root,
      })
      expectExitCode(planned, 0)
      const planId = planned.stdout.match(/Plan (sha256:[a-f0-9]+)/)?.[1]
      expect(planId).toBeDefined()

      const decoyId = `sha256:${"f".repeat(64)}`
      await mkdir(join(root, ".effectgrade/plans"), { recursive: true })
      await writeFile(
        join(root, `.effectgrade/plans/${decoyId.slice("sha256:".length)}.json`),
        `${JSON.stringify({ id: decoyId, profileId: "decoy", capabilities: [], operations: [] }, null, 2)}\n`,
      )

      const verified = await runCli(["verify"], { fileSystem, sourceRoot: root })
      expectExitCode(verified, 0)
      expect(verified.stdout).toContain(planId)
      expect(verified.stdout).not.toContain(decoyId)
    })
  })

  it("uses exit 8 for an unknown profile", async () => {
    const result = await runCli(["catalog", "profile", "missing-profile"])
    expectExitCode(result, 8)
    expect(result.stderr).toContain("Unknown profile")
  })

  it("reports unknown commands on stderr", async () => {
    const result = await runCli(["scaffold"])
    expectExitCode(result, 2)
    expect(result.stdout).toBe("")
    expect(result.stderr).toContain("Unknown command: scaffold")
  })

  it("inspects a Hono fixture and reports Effect as not installed", async () => {
    const result = await runCli(["inspect"], {
      fileSystem: makeMemoryFileSystem(seedFromFixture("hono-pnpm-basic")),
    })
    expectExitCode(result, 0)
    expect(result.stdout).toContain("Package manager   pnpm")
    expect(result.stdout).toContain("Framework         Hono")
    expect(result.stdout).toContain("Effect            not installed")
    expect(result.stderr).toBe("")
  })

  it("emits a JSON inspect envelope from the same fixture", async () => {
    const result = await runCli(["--json", "inspect"], {
      fileSystem: makeMemoryFileSystem(seedFromFixture("hono-pnpm-basic")),
    })
    expectExitCode(result, 0)
    const parsed = JSON.parse(result.stdout) as {
      readonly command: string
      readonly ok: boolean
      readonly result: {
        readonly packageManager: { readonly value: string }
        readonly effect: { readonly present: boolean }
      }
    }
    expect(parsed.command).toBe("inspect")
    expect(parsed.ok).toBe(true)
    expect(parsed.result.packageManager.value).toBe("pnpm")
    expect(parsed.result.effect.present).toBe(false)
  })

  it("exits 3 when Hono apps are ambiguous", async () => {
    const result = await runCli(["inspect"], {
      fileSystem: makeMemoryFileSystem(seedFromFixture("hono-ambiguous-apps")),
    })
    expectExitCode(result, 3)
    expect(result.stdout).toContain("EG1104")
  })
})
