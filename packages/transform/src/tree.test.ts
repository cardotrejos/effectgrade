import { Effect, Result } from "effect"
import { decodeRepoPath } from "@effectgrade/domain"
import { makeMemoryFileSystem } from "@effectgrade/test-kit"
import { describe, expect, it } from "vitest"

import { makeOverlayTree } from "./tree.js"

const path = (value: string) => Result.getOrThrow(decodeRepoPath(value))

describe("overlay tree", () => {
  it("reads the base snapshot and overlays writes without mutating the base", async () => {
    const base = makeMemoryFileSystem({ "package.json": '{"name":"acme"}' })
    const tree = makeOverlayTree(base)

    expect(await Effect.runPromise(tree.readFile(path("package.json")))).toBe('{"name":"acme"}')
    await Effect.runPromise(tree.writeFile(path("package.json"), '{"name":"acme","private":true}'))
    await Effect.runPromise(tree.writeFile(path("src/effect/index.ts"), "export {}\n"))

    expect(await Effect.runPromise(tree.readFile(path("package.json")))).toBe(
      '{"name":"acme","private":true}',
    )
    expect(await Effect.runPromise(base.readFile(path("package.json")))).toBe('{"name":"acme"}')
    expect(tree.changes()).toEqual([
      { path: "package.json", kind: "modify" },
      { path: "src/effect/index.ts", kind: "create" },
    ])
  })

  it("is idempotent when writing the same contents twice", async () => {
    const tree = makeOverlayTree(makeMemoryFileSystem({ "readme.md": "hello\n" }))
    await Effect.runPromise(tree.writeFile(path("readme.md"), "hello\n"))
    expect(tree.changes()).toEqual([])
    await Effect.runPromise(tree.writeFile(path("src/new.ts"), "export {}\n"))
    await Effect.runPromise(tree.writeFile(path("src/new.ts"), "export {}\n"))
    expect(tree.changes()).toEqual([{ path: "src/new.ts", kind: "create" }])
  })

  it("refuses to write through a symlink", async () => {
    const base = makeMemoryFileSystem({ "real.txt": "ok" })
    await Effect.runPromise(base.symlink(path("link.txt"), "real.txt"))
    const tree = makeOverlayTree(base)
    const result = await Effect.runPromise(Effect.result(tree.writeFile(path("link.txt"), "nope")))
    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) {
      expect(result.failure.reason).toBe("io")
      expect(result.failure.detail).toContain("symlink")
    }
  })
})
