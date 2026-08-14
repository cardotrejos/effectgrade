import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

import { expectExitCode, makeMemoryFileSystem } from "@effectgrade/test-kit"
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
    const result = await runCli(["verify"])
    expectExitCode(result, 2)
    expect(result.stdout).toBe("")
    expect(result.stderr).toContain("not implemented")
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
