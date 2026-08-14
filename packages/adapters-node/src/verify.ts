import { runProcess, type ProcessRequest, type ProcessResult } from "./process.js"

export type TypecheckResult = {
  readonly ok: boolean
  readonly detail: string
  readonly stdout: string
  readonly stderr: string
}

export type HonoProbeResult = {
  readonly ok: boolean
  readonly status: number
  readonly body: unknown
  readonly detail: string
}

export type VerificationCheck = {
  readonly id: string
  readonly ok: boolean
  readonly detail: string
}

export type VerificationReport = {
  readonly ok: boolean
  readonly checks: ReadonlyArray<VerificationCheck>
}

const typecheckFlags = ["--noEmit", "--pretty", "false", "-p", "tsconfig.json"] as const

export const typecheckSandbox = async (input: {
  readonly cwd: string
  readonly tsc?: string
  readonly run?: (request: ProcessRequest) => Promise<ProcessResult>
}): Promise<TypecheckResult> => {
  const tsc = input.tsc ?? "tsc"
  const isJs = tsc.endsWith(".js") || tsc.endsWith(".cjs") || tsc.endsWith(".mjs")
  const request: ProcessRequest = isJs
    ? { cwd: input.cwd, command: process.execPath, args: [tsc, ...typecheckFlags] }
    : { cwd: input.cwd, command: tsc, args: [...typecheckFlags] }
  const result = await (input.run ?? runProcess)(request)
  return {
    ok: result.exitCode === 0,
    detail: result.exitCode === 0 ? "tsc ok" : `tsc exited ${String(result.exitCode)}`,
    stdout: result.stdout,
    stderr: result.stderr,
  }
}

export const probeHonoHealth = async (app: {
  readonly request: (input: string) => Promise<Response>
}): Promise<HonoProbeResult> => {
  const response = await app.request("/effect/health")
  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = undefined
  }
  const ok =
    response.status === 200 &&
    typeof body === "object" &&
    body !== null &&
    "ok" in body &&
    (body as { ok: unknown }).ok === true
  return {
    ok,
    status: response.status,
    body,
    detail: ok ? "health ok" : `health probe failed with status ${String(response.status)}`,
  }
}

export const verifySandbox = async (input: {
  readonly cwd: string
  readonly typecheck?: () => Promise<TypecheckResult>
  readonly probe?: () => Promise<HonoProbeResult>
}): Promise<VerificationReport> => {
  const typecheck = input.typecheck ?? (() => typecheckSandbox({ cwd: input.cwd }))
  const probe =
    input.probe ??
    (async () => ({
      ok: false,
      status: 0,
      body: undefined,
      detail: "Hono app was not provided",
    }))
  const typecheckResult = await typecheck()
  const probeResult = await probe()
  const checks: ReadonlyArray<VerificationCheck> = [
    { id: "typecheck", ok: typecheckResult.ok, detail: typecheckResult.detail },
    { id: "hono-health", ok: probeResult.ok, detail: probeResult.detail },
  ]
  return { ok: checks.every((check) => check.ok), checks }
}
