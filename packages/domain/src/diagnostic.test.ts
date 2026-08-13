import { Result } from "effect"
import { describe, expect, it } from "vitest"

import { decodeCapabilityId } from "./ids.js"
import { decodeRepoPath } from "./path.js"
import {
  Diagnostic,
  DiagnosticCode,
  decodeDiagnostic,
  decodeDiagnosticCode,
  diagnosticDocsUrl,
  renderDiagnostic,
  sortDiagnostics,
} from "./diagnostic.js"

describe("DiagnosticCode", () => {
  it("accepts EG plus four digits", () => {
    expect(Result.getOrThrow(decodeDiagnosticCode("EG2201"))).toBe("EG2201")
  })

  it("rejects other prefixes and lengths", () => {
    expect(Result.isFailure(decodeDiagnosticCode("E2201"))).toBe(true)
    expect(Result.isFailure(decodeDiagnosticCode("EG22"))).toBe(true)
    expect(Result.isFailure(decodeDiagnosticCode("eg2201"))).toBe(true)
  })
})

describe("Diagnostic", () => {
  it("decodes a complete diagnostic", () => {
    const diagnostic = Result.getOrThrow(
      decodeDiagnostic({
        code: "EG2201",
        title: "Capability dependency cycle",
        detail: "postgres → config → secrets → postgres",
        severity: "error",
        capabilityId: "postgres",
        remediation: [{ title: "Suggested action", detail: "break the cycle" }],
      }),
    )

    expect(diagnostic.code).toBe("EG2201")
    expect(diagnostic.docsKey).toBe("EG2201")
    expect(diagnostic.capabilityId).toBe(Result.getOrThrow(decodeCapabilityId("postgres")))
  })

  it("renders a stable human message", () => {
    const diagnostic = Result.getOrThrow(
      decodeDiagnostic({
        code: "EG2201",
        title: "Capability dependency cycle",
        detail: "postgres → config → secrets → postgres",
        severity: "error",
        path: "src/effect/AppRuntime.ts",
        remediation: [
          {
            title: "Suggested action",
            detail: "merge the mutually dependent concerns or change one edge to a recommendation",
          },
        ],
      }),
    )

    expect(renderDiagnostic(diagnostic)).toBe(
      [
        "EG2201 Capability dependency cycle",
        "",
        "src/effect/AppRuntime.ts",
        "",
        "postgres → config → secrets → postgres",
        "",
        "Suggested action: merge the mutually dependent concerns or change one edge to a recommendation",
        "",
        `Docs: ${diagnosticDocsUrl("EG2201")}`,
      ].join("\n"),
    )
  })

  it("sorts diagnostics by code then path", () => {
    const later = Result.getOrThrow(
      decodeDiagnostic({
        code: "EG1501",
        title: "Symlink skipped",
        detail: "outside",
        severity: "warning",
        path: "b",
      }),
    )
    const earlier = Result.getOrThrow(
      decodeDiagnostic({
        code: "EG1501",
        title: "Symlink skipped",
        detail: "outside",
        severity: "warning",
        path: "a",
      }),
    )
    const other = Result.getOrThrow(
      decodeDiagnostic({
        code: "EG1001",
        title: "Conflicting package-manager evidence",
        detail: "lockfile",
        severity: "error",
      }),
    )

    expect(sortDiagnostics([later, other, earlier]).map((item) => [item.code, item.path])).toEqual([
      ["EG1001", undefined],
      ["EG1501", "a"],
      ["EG1501", "b"],
    ])
  })

  it("is a schema", () => {
    expect(DiagnosticCode.identifier).toBe("DiagnosticCode")
    expect(typeof Diagnostic.make).toBe("function")
  })

  it("defaults docsKey to the code", () => {
    expect(diagnosticDocsUrl("EG3402")).toBe(
      "https://github.com/cardotrejos/effectgrade/blob/main/docs/errors/EG3402.md",
    )
  })
})

describe("path evidence", () => {
  it("stores a branded path when present", () => {
    const diagnostic = Result.getOrThrow(
      decodeDiagnostic({
        code: "EG1501",
        title: "Symlink skipped",
        detail: "points outside the repository",
        severity: "warning",
        path: "vendor/link",
      }),
    )
    expect(diagnostic.path).toBe(Result.getOrThrow(decodeRepoPath("vendor/link")))
  })
})
