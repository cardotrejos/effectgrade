import { Effect, Result } from "effect"
import { decodeRepoPath } from "@effectgrade/domain"
import { describe, expect, it } from "vitest"

import { withWriteFaults } from "./fault.js"
import { makeMemoryFileSystem } from "./memory-fs.js"

const path = (value: string) => Result.getOrThrow(decodeRepoPath(value))

describe("withWriteFaults", () => {
  it("fails the configured write and succeeds afterwards", async () => {
    const fs = withWriteFaults(makeMemoryFileSystem(), 1)
    const file = path("src/a.ts")

    const first = await Effect.runPromise(Effect.result(fs.writeFile(file, "one")))
    expect(Result.isFailure(first)).toBe(true)

    await Effect.runPromise(fs.writeFile(file, "two"))
    expect(await Effect.runPromise(fs.readFile(file))).toBe("two")
  })
})
