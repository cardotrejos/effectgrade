import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { expectExitCode } from "@effectgrade/test-kit"
import { describe, expect, it } from "vitest"

import { cliVersion, runCli } from "./cli.js"

const packageJson = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../package.json"), "utf8"),
) as { readonly version: string }

describe("cli contract", () => {
  it("keeps the exported version aligned with the package", () => {
    expect(cliVersion).toBe(packageJson.version)
  })

  it("prints help on --help", () => {
    const result = runCli(["--help"])
    expectExitCode(result, 0)
    expect(result.stdout).toContain("verified Effect adoption")
    expect(result.stdout).toContain("inspect")
    expect(result.stderr).toBe("")
  })

  it("prints version on version", () => {
    const result = runCli(["version"])
    expectExitCode(result, 0)
    expect(result.stdout).toContain("EffectGrade 0.0.0")
    expect(result.stdout).toContain("4.0.0-rc.108")
    expect(result.stderr).toBe("")
  })

  it("prints JSON version when --json is set", () => {
    const result = runCli(["--json", "version"])
    expectExitCode(result, 0)
    expect(JSON.parse(result.stdout)).toMatchObject({
      product: "EffectGrade",
      version: "0.0.0",
      engineEffect: "4.0.0-rc.108",
    })
    expect(result.stderr).toBe("")
  })

  it("refuses unimplemented commands without polluting stdout", () => {
    const result = runCli(["inspect"])
    expectExitCode(result, 2)
    expect(result.stdout).toBe("")
    expect(result.stderr).toContain("not implemented")
  })

  it("reports unknown commands on stderr", () => {
    const result = runCli(["scaffold"])
    expectExitCode(result, 2)
    expect(result.stdout).toBe("")
    expect(result.stderr).toContain("Unknown command: scaffold")
  })
})
