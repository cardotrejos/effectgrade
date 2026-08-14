import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

import { withTempDir } from "@effectgrade/test-kit"
import { describe, expect, it } from "vitest"

import { installCommand, installSandboxDependencies } from "./install.js"
import type { ProcessRequest, ProcessResult } from "./process.js"

describe("installCommand", () => {
  it("denies lifecycle scripts for pnpm and npm", () => {
    expect(installCommand("pnpm", "update")).toEqual(["pnpm", "install", "--ignore-scripts"])
    expect(installCommand("pnpm", "frozen")).toEqual([
      "pnpm",
      "install",
      "--ignore-scripts",
      "--frozen-lockfile",
    ])
    expect(installCommand("npm", "update")).toEqual(["npm", "install", "--ignore-scripts"])
    expect(installCommand("npm", "frozen")).toEqual(["npm", "ci", "--ignore-scripts"])
  })
})

describe("installSandboxDependencies", () => {
  it("runs the package-manager command in the sandbox and captures lockfile revision", async () => {
    await withTempDir(async (root) => {
      await writeFile(join(root, "package.json"), '{"name":"acme","private":true}\n')
      await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n")

      const calls: Array<ProcessRequest> = []
      const run = async (request: ProcessRequest): Promise<ProcessResult> => {
        calls.push(request)
        await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\npackages: {}\n")
        return { exitCode: 0, stdout: "done\n", stderr: "" }
      }

      const result = await installSandboxDependencies({
        sandboxRoot: root,
        packageManager: "pnpm",
        mode: "update",
        run,
      })

      expect(calls).toEqual([
        {
          cwd: root,
          command: "pnpm",
          args: ["install", "--ignore-scripts"],
        },
      ])
      expect(result.exitCode).toBe(0)
      expect(result.lockfile?.path).toBe("pnpm-lock.yaml")
      expect(result.lockfile?.changed).toBe(true)
      expect(result.lockfile?.contents).toContain("packages: {}")
    })
  })

  it("does not run a local package preinstall script", async () => {
    await withTempDir(async (tmp) => {
      const sandbox = join(tmp, "app")
      const evil = join(tmp, "evil")
      await mkdir(sandbox, { recursive: true })
      await mkdir(evil, { recursive: true })
      await writeFile(
        join(evil, "package.json"),
        JSON.stringify({
          name: "evil",
          version: "1.0.0",
          scripts: {
            preinstall: "node -e \"require('node:fs').writeFileSync('pwned.txt','nope')\"",
          },
        }) + "\n",
      )
      await writeFile(
        join(sandbox, "package.json"),
        JSON.stringify({
          name: "app",
          private: true,
          dependencies: { evil: "file:../evil" },
        }) + "\n",
      )

      const result = await installSandboxDependencies({
        sandboxRoot: sandbox,
        packageManager: "npm",
        mode: "update",
      })

      expect(result.command).toEqual(["npm", "install", "--ignore-scripts"])
      if (result.exitCode !== 0) {
        expect(result.stderr + result.stdout).toMatch(/npm|lock|pack/i)
      }
      await expect(readFile(join(sandbox, "pwned.txt"), "utf8")).rejects.toThrow()
      await expect(readFile(join(evil, "pwned.txt"), "utf8")).rejects.toThrow()
    })
  })
})
