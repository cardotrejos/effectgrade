import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

import { Effect, Result } from "effect"
import { decodeRepoPath } from "@effectgrade/domain"
import { withTempDir } from "@effectgrade/test-kit"
import { describe, expect, it } from "vitest"

import { cleanupSandbox, digestDirectory, materializeCopySandbox } from "./sandbox.js"

const path = (value: string) => Result.getOrThrow(decodeRepoPath(value))

describe("materializeCopySandbox", () => {
  it("copies a repository, applies operations, and leaves the source digest unchanged", async () => {
    await withTempDir(async (tmp) => {
      const source = join(tmp, "source")
      const sandbox = join(tmp, "sandbox")
      await mkdir(join(source, "src"), { recursive: true })
      await mkdir(join(source, "node_modules", "secret"), { recursive: true })
      await writeFile(join(source, "package.json"), '{"name":"acme"}\n')
      await writeFile(join(source, "src", "index.ts"), "export const app = 1\n")
      await writeFile(join(source, "node_modules", "secret", "leak.js"), "stolen\n")

      const before = await digestDirectory(source)
      const result = await materializeCopySandbox({
        sourceRoot: source,
        sandboxRoot: sandbox,
        operations: [
          {
            kind: "write-owned-file",
            path: path("src/effect/AppRuntime.ts"),
            contents: "export const AppRuntime = true\n",
          },
        ],
      })

      expect(result.sourceDigest).toBe(before)
      expect(await digestDirectory(source)).toBe(before)
      expect(await readFile(join(source, "src", "index.ts"), "utf8")).toBe("export const app = 1\n")

      expect(await readFile(join(sandbox, "src", "index.ts"), "utf8")).toBe(
        "export const app = 1\n",
      )
      expect(await readFile(join(sandbox, "src", "effect", "AppRuntime.ts"), "utf8")).toBe(
        "export const AppRuntime = true\n",
      )
      await expect(
        readFile(join(sandbox, "node_modules", "secret", "leak.js"), "utf8"),
      ).rejects.toThrow()
      expect(result.changes.map((change) => [change.path, change.kind])).toEqual([
        ["src/effect/AppRuntime.ts", "create"],
      ])
    })
  })

  it("removes a marked sandbox and refuses an unmarked directory", async () => {
    await withTempDir(async (tmp) => {
      const source = join(tmp, "source")
      const sandbox = join(tmp, "sandbox")
      const other = join(tmp, "other")
      await mkdir(source, { recursive: true })
      await writeFile(join(source, "package.json"), "{}\n")
      await mkdir(other, { recursive: true })
      await writeFile(join(other, "keep.txt"), "safe\n")

      await materializeCopySandbox({
        sourceRoot: source,
        sandboxRoot: sandbox,
        operations: [],
      })
      await cleanupSandbox(sandbox)
      await expect(readFile(join(sandbox, "package.json"), "utf8")).rejects.toThrow()

      const refused = await Effect.runPromise(
        Effect.result(Effect.tryPromise(() => cleanupSandbox(other))),
      )
      expect(Result.isFailure(refused)).toBe(true)
      expect(await readFile(join(other, "keep.txt"), "utf8")).toBe("safe\n")
    })
  })
})
