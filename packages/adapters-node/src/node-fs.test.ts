import { writeFile, symlink, mkdir } from "node:fs/promises"
import { join } from "node:path"

import { Effect, Result } from "effect"
import { decodeRepoPath, FileSystem } from "@effectgrade/domain"
import { withTempDir } from "@effectgrade/test-kit"
import { describe, expect, it } from "vitest"

import { makeNodeFileSystem } from "./node-fs.js"

const path = (value: string) => Result.getOrThrow(decodeRepoPath(value))

describe("NodeFileSystem", () => {
  it("reads and lists files inside the root", async () => {
    await withTempDir(async (root) => {
      await mkdir(join(root, "src"), { recursive: true })
      await writeFile(join(root, "src/index.ts"), "export {}\n")

      const fs = makeNodeFileSystem(root)
      const result = await Effect.runPromise(
        Effect.provideService(
          Effect.gen(function* () {
            const store = yield* FileSystem
            return {
              contents: yield* store.readFile(path("src/index.ts")),
              children: yield* store.list(path("src")),
            }
          }),
          FileSystem,
          fs,
        ),
      )

      expect(result.contents).toBe("export {}\n")
      expect(result.children).toEqual([path("src/index.ts")])
    })
  })

  it("refuses to follow a symlink out of the root", async () => {
    await withTempDir(async (root) => {
      await mkdir(join(root, "src"), { recursive: true })
      await symlink("/etc/passwd", join(root, "src/escape"))

      const fs = makeNodeFileSystem(root)
      const result = await Effect.runPromise(
        Effect.provideService(
          Effect.gen(function* () {
            const store = yield* FileSystem
            return yield* Effect.result(store.readFile(path("src/escape")))
          }),
          FileSystem,
          fs,
        ),
      )

      expect(Result.isFailure(result)).toBe(true)
      if (Result.isFailure(result)) {
        expect(result.failure.reason).toBe("symlink-outside")
      }
    })
  })

  it("rejects an absolute RepoPath before touching disk", async () => {
    await withTempDir(async (root) => {
      const fs = makeNodeFileSystem(root)
      const decoded = decodeRepoPath("/etc/passwd")
      expect(Result.isFailure(decoded)).toBe(true)
      expect(fs).toBeDefined()
    })
  })
})
