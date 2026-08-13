import { Effect, Result } from "effect"
import { decodeRepoPath, FileSystem } from "@effectgrade/domain"
import { makeMemoryFileSystem } from "@effectgrade/test-kit"
import { describe, expect, it } from "vitest"

import { isBinary, walk, walkCacheKey } from "./walk.js"

const path = (value: string) => Result.getOrThrow(decodeRepoPath(value))

describe("walk", () => {
  it("skips default vendor trees and respects gitignore", async () => {
    const fs = makeMemoryFileSystem({
      "src/index.ts": "export {}\n",
      "node_modules/effect/package.json": "{}",
      "dist/index.js": "export {}",
      "notes.log": "noise",
      ".gitignore": "*.log\n",
    })

    const result = await Effect.runPromise(Effect.provideService(walk(), FileSystem, fs))

    expect(result.entries.map((entry) => entry.path)).toEqual([".gitignore", "src", "src/index.ts"])
    expect(result.ignoredCount).toBeGreaterThan(0)
  })

  it("records an outside symlink as EG1501 and does not follow it", async () => {
    const fs = makeMemoryFileSystem({ "src/index.ts": "ok" })
    await Effect.runPromise(fs.symlink(path("src/escape"), "../../etc/passwd"))

    const result = await Effect.runPromise(Effect.provideService(walk(), FileSystem, fs))

    expect(result.entries.some((entry) => entry.path === "src/escape")).toBe(false)
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "EG1501")).toBe(true)
  })

  it("classifies binary files and stops at the file limit", async () => {
    const fs = makeMemoryFileSystem({
      "src/ok.ts": "export {}\n",
      "src/blob.bin": "a\0b",
      "src/a.ts": "a",
      "src/b.ts": "b",
    })

    expect(isBinary("src/blob.bin", encoder.encode("a\0b"))).toBe(true)
    expect(isBinary("src/ok.ts", encoder.encode("export {}\n"))).toBe(false)

    const limited = await Effect.runPromise(
      Effect.provideService(walk({ limits: { maxFiles: 2, maxBytes: 10_000 } }), FileSystem, fs),
    )

    expect(
      limited.entries.filter((entry) => entry.stat.kind === "file").length,
    ).toBeLessThanOrEqual(2)
    expect(limited.diagnostics.some((diagnostic) => diagnostic.code === "EG1502")).toBe(true)
  })

  it("builds a stable cache key from path, kind, and size", () => {
    expect(
      walkCacheKey({
        path: path("src/index.ts"),
        kind: "file",
        size: 10,
        mode: 0o644,
      }),
    ).toBe("src/index.ts:file:10")
  })
})

const encoder = new TextEncoder()
