import { mkdir, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { join } from "node:path"

import { withTempDir } from "@effectgrade/test-kit"
import { describe, expect, it } from "vitest"

import { probeHonoHealth, typecheckSandbox, verifySandbox } from "./verify.js"
import type { ProcessRequest, ProcessResult } from "./process.js"

const require = createRequire(import.meta.url)

describe("typecheckSandbox", () => {
  it("invokes tsc --noEmit against the sandbox tsconfig", async () => {
    const calls: Array<ProcessRequest> = []
    const run = async (request: ProcessRequest): Promise<ProcessResult> => {
      calls.push(request)
      return { exitCode: 0, stdout: "", stderr: "" }
    }

    const result = await typecheckSandbox({ cwd: "/sandbox", run, tsc: "/tools/tsc.js" })
    expect(result.ok).toBe(true)
    expect(calls[0]?.command).toBe(process.execPath)
    expect(calls[0]?.args).toEqual([
      "/tools/tsc.js",
      "--noEmit",
      "--pretty",
      "false",
      "-p",
      "tsconfig.json",
    ])
    expect(calls[0]?.cwd).toBe("/sandbox")
  })

  it("typechecks a valid sandbox with the real tsc", async () => {
    await withTempDir(async (root) => {
      await writeFile(
        join(root, "tsconfig.json"),
        JSON.stringify({ compilerOptions: { strict: true, noEmit: true }, include: ["index.ts"] }) +
          "\n",
      )
      await writeFile(join(root, "index.ts"), "export const ok: number = 1\n")
      const result = await typecheckSandbox({
        cwd: root,
        tsc: require.resolve("typescript/bin/tsc"),
      })
      expect(result.ok).toBe(true)
    })
  })
})

describe("probeHonoHealth", () => {
  it("requests GET /effect/health on the provided app", async () => {
    const paths: Array<string> = []
    const app = {
      request: async (input: string) => {
        paths.push(input)
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      },
    }

    const result = await probeHonoHealth(app)
    expect(paths).toEqual(["/effect/health"])
    expect(result.ok).toBe(true)
    expect(result.status).toBe(200)
    expect(result.body).toEqual({ ok: true })
  })
})

describe("verifySandbox", () => {
  it("aggregates typecheck and Hono probe into a report", async () => {
    await withTempDir(async (root) => {
      await mkdir(root, { recursive: true })
      const report = await verifySandbox({
        cwd: root,
        typecheck: async () => ({ ok: true, detail: "tsc ok", stdout: "", stderr: "" }),
        probe: async () => ({ ok: true, status: 200, body: { ok: true }, detail: "health ok" }),
      })
      expect(report.ok).toBe(true)
      expect(report.checks.map((check) => check.id)).toEqual(["typecheck", "hono-health"])
      expect(report.checks.every((check) => check.ok)).toBe(true)
    })
  })
})
