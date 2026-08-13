import { describe, expect, it } from "vitest"

import { expectExitCode } from "./index.js"

describe("expectExitCode", () => {
  it("accepts a matching exit code", () => {
    expect(() => expectExitCode({ exitCode: 0, stdout: "", stderr: "" }, 0)).not.toThrow()
  })

  it("includes stdout and stderr when the exit code differs", () => {
    expect(() => expectExitCode({ exitCode: 2, stdout: "out", stderr: "err" }, 0)).toThrow(
      /expected exit code 0, received 2/,
    )
  })
})
