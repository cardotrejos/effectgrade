import { Result, Schema } from "effect"
import { describe, expect, it } from "vitest"

import { RepoPath, decodeRepoPath } from "./path.js"

describe("RepoPath", () => {
  it("accepts a relative posix path", () => {
    const decoded = decodeRepoPath("src/index.ts")
    expect(Result.isSuccess(decoded)).toBe(true)
    if (Result.isSuccess(decoded)) {
      expect(decoded.success).toBe("src/index.ts")
    }
  })

  it("normalizes backslashes, dots, and duplicate slashes", () => {
    const decoded = decodeRepoPath(".\\src\\\\foo/./bar.ts")
    expect(Result.getOrThrow(decoded)).toBe("src/foo/bar.ts")
  })

  it("treats empty and dot as the repository root", () => {
    expect(Result.getOrThrow(decodeRepoPath(""))).toBe(".")
    expect(Result.getOrThrow(decodeRepoPath("."))).toBe(".")
    expect(Result.getOrThrow(decodeRepoPath("./"))).toBe(".")
  })

  it("rejects parent segments and absolute paths", () => {
    expect(Result.isFailure(decodeRepoPath("../secret"))).toBe(true)
    expect(Result.isFailure(decodeRepoPath("src/foo/../bar"))).toBe(true)
    expect(Result.isFailure(decodeRepoPath("/etc/passwd"))).toBe(true)
    expect(Result.isFailure(decodeRepoPath("C:/windows"))).toBe(true)
  })

  it("rejects NUL and reserved names", () => {
    expect(Result.isFailure(decodeRepoPath("src/\0bad.ts"))).toBe(true)
    expect(Result.isFailure(decodeRepoPath("src/foo\u0000"))).toBe(true)
  })

  it("is a branded schema, not a plain string type", () => {
    const path = Result.getOrThrow(decodeRepoPath("package.json"))
    const encoded = Schema.encodeSync(RepoPath)(path)
    expect(encoded).toBe("package.json")
  })
})
