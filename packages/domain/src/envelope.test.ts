import { Effect, Result } from "effect"
import { describe, expect, it } from "vitest"

import { digestCanonical } from "./canonical.js"
import { decodeDiagnostic } from "./diagnostic.js"
import { envelopeSchemaVersion, makeCommandEnvelope } from "./envelope.js"

describe("CommandEnvelope", () => {
  it("is ok only when there are no errors", () => {
    const warning = Result.getOrThrow(
      decodeDiagnostic({
        code: "EG1501",
        title: "Symlink skipped",
        detail: "outside",
        severity: "warning",
      }),
    )
    const error = Result.getOrThrow(
      decodeDiagnostic({
        code: "EG1001",
        title: "Conflicting package-manager evidence",
        detail: "lockfile",
        severity: "error",
      }),
    )

    const ok = makeCommandEnvelope({
      command: "inspect",
      result: { targets: 1 },
      errors: [],
      warnings: [warning],
      toolVersion: "0.0.0",
      startedAt: "2026-08-13T00:00:00.000Z",
      completedAt: "2026-08-13T00:00:01.000Z",
      durationMs: 1000,
    })

    expect(ok.ok).toBe(true)
    expect(ok.schemaVersion).toBe(envelopeSchemaVersion)
    expect(ok.result).toEqual({ targets: 1 })

    const failed = makeCommandEnvelope({
      command: "inspect",
      errors: [error],
      warnings: [],
      toolVersion: "0.0.0",
      startedAt: "2026-08-13T00:00:00.000Z",
      completedAt: "2026-08-13T00:00:01.000Z",
      durationMs: 1000,
    })

    expect(failed.ok).toBe(false)
    expect(failed.result).toBeUndefined()
  })

  it("excludes volatile metadata from identity", async () => {
    const first = makeCommandEnvelope({
      command: "version",
      result: { version: "0.0.0" },
      errors: [],
      warnings: [],
      toolVersion: "0.0.0",
      startedAt: "2026-08-13T00:00:00.000Z",
      completedAt: "2026-08-13T00:00:01.000Z",
      durationMs: 12,
    })
    const second = makeCommandEnvelope({
      command: "version",
      result: { version: "0.0.0" },
      errors: [],
      warnings: [],
      toolVersion: "0.0.0",
      startedAt: "2026-08-13T00:00:09.000Z",
      completedAt: "2026-08-13T00:00:11.000Z",
      durationMs: 99,
    })

    expect(await Effect.runPromise(digestCanonical(first))).toBe(
      await Effect.runPromise(digestCanonical(second)),
    )
  })
})
