import { Effect, Result } from "effect"
import { decodeRepoPath, FileSystem, type FileSystemApi } from "@effectgrade/domain"
import { describe, expect, it } from "vitest"

import { makeMemoryFileSystem } from "./memory-fs.js"

const path = (value: string) => Result.getOrThrow(decodeRepoPath(value))

const run = <A, E>(effect: Effect.Effect<A, E, FileSystemApi>, fs = makeMemoryFileSystem()) =>
  Effect.runPromise(Effect.provideService(effect, FileSystem, fs))

describe("MemoryFileSystem", () => {
  it("writes, stats, lists, and reads a file", async () => {
    const fs = makeMemoryFileSystem()
    const file = path("src/index.ts")

    await run(
      Effect.gen(function* () {
        const store = yield* FileSystem
        yield* store.writeFile(file, "export {}\n")
      }),
      fs,
    )

    const result = await run(
      Effect.gen(function* () {
        const store = yield* FileSystem
        const stat = yield* store.stat(file)
        const contents = yield* store.readFile(file)
        const children = yield* store.list(path("src"))
        return { stat, contents, children }
      }),
      fs,
    )

    expect(result.contents).toBe("export {}\n")
    expect(result.stat.kind).toBe("file")
    expect(result.stat.size).toBe(Buffer.byteLength("export {}\n"))
    expect(result.children).toEqual([file])
  })

  it("fails when a file is missing", async () => {
    const result = await run(
      Effect.gen(function* () {
        const store = yield* FileSystem
        return yield* Effect.result(store.readFile(path("missing.ts")))
      }),
    )

    expect(Result.isFailure(result)).toBe(true)
    if (Result.isFailure(result)) {
      expect(result.failure.reason).toBe("not-found")
    }
  })

  it("follows an in-root symlink and rejects an escape", async () => {
    const fs = makeMemoryFileSystem()
    await run(
      Effect.gen(function* () {
        const store = yield* FileSystem
        yield* store.writeFile(path("src/real.ts"), "ok")
        yield* store.symlink(path("src/alias.ts"), "real.ts")
        yield* store.symlink(path("src/escape.ts"), "../../etc/passwd")
      }),
      fs,
    )

    const inside = await run(
      Effect.gen(function* () {
        const store = yield* FileSystem
        return yield* store.readFile(path("src/alias.ts"))
      }),
      fs,
    )
    expect(inside).toBe("ok")

    const escaped = await run(
      Effect.gen(function* () {
        const store = yield* FileSystem
        return yield* Effect.result(store.readFile(path("src/escape.ts")))
      }),
      fs,
    )
    expect(Result.isFailure(escaped)).toBe(true)
    if (Result.isFailure(escaped)) {
      expect(escaped.failure.reason).toBe("symlink-outside")
    }
  })
})
