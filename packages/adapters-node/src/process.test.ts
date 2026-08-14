import { describe, expect, it } from "vitest"

import { runProcess } from "./process.js"

describe("runProcess", () => {
  it("runs argv without a shell and captures stdout and the exit code", async () => {
    const result = await runProcess({
      cwd: process.cwd(),
      command: process.execPath,
      args: ["-e", "process.stdout.write('ok:' + process.argv[1])", "not;shell"],
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe("ok:not;shell")
    expect(result.stderr).toBe("")
  })

  it("returns a non-zero exit code without throwing", async () => {
    const result = await runProcess({
      cwd: process.cwd(),
      command: process.execPath,
      args: ["-e", "process.exit(7)"],
    })
    expect(result.exitCode).toBe(7)
  })
})
