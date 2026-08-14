import { Result } from "effect"
import { decodeDiagnostic } from "@effectgrade/domain"
import { describe, expect, it } from "vitest"

import {
  collectEffectDiagnostics,
  normalizeEffectDiagnostic,
  runEffectDiagnosticsCheck,
} from "./effect-diagnostics.js"

describe("normalizeEffectDiagnostic", () => {
  it("maps a pinned Effect diagnostic payload onto the EG schema", () => {
    const diagnostic = normalizeEffectDiagnostic({
      code: 2345,
      message: "Argument of type 'string' is not assignable to parameter of type 'number'.",
      file: "src/effect/AppRuntime.ts",
      category: "error",
    })
    expect(diagnostic.code).toBe("EG1207")
    expect(diagnostic.path).toBe("src/effect/AppRuntime.ts")
    expect(diagnostic.detail).toContain("2345")
    expect(diagnostic.severity).toBe("error")
  })
})

describe("collectEffectDiagnostics", () => {
  it("reports a profile coordinate mismatch and unstable imports", () => {
    const diagnostics = collectEffectDiagnostics({
      profileVersion: "4.0.0-rc.108",
      installedVersion: "4.0.0-beta.107",
      files: [
        {
          path: "src/legacy.ts",
          text: `import { Ai } from "effect/unstable/ai"\n`,
        },
      ],
    })

    expect(diagnostics.some((item) => item.code === "EG1207")).toBe(true)
    expect(diagnostics.some((item) => item.path === "src/legacy.ts")).toBe(true)
    expect(Result.isSuccess(decodeDiagnostic(diagnostics[0]))).toBe(true)
  })

  it("is clean when the installed coordinate matches and there are no unstable imports", () => {
    const diagnostics = collectEffectDiagnostics({
      profileVersion: "4.0.0-rc.108",
      installedVersion: "4.0.0-rc.108",
      files: [{ path: "src/effect/AppRuntime.ts", text: `import { Layer } from "effect"\n` }],
    })
    expect(diagnostics).toEqual([])
  })
})

describe("runEffectDiagnosticsCheck", () => {
  it("fails the verification check when diagnostics include errors", () => {
    const check = runEffectDiagnosticsCheck({
      profileVersion: "4.0.0-rc.108",
      installedVersion: "3.17.13",
      files: [],
    })
    expect(check.id).toBe("effect-diagnostics")
    expect(check.ok).toBe(false)
    expect(check.detail).toContain("4.0.0-rc.108")
  })
})
