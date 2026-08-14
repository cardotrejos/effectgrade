import { Result } from "effect"
import { decodeDiagnostic, decodeRepoPath, type Diagnostic } from "@effectgrade/domain"

import type { VerificationCheck } from "./verify.js"

const diagnostic = (input: {
  code: "EG1207" | "EG1208"
  title: string
  detail: string
  severity: "error" | "warning"
  path?: string
}): Diagnostic =>
  Result.getOrThrow(
    decodeDiagnostic({
      code: input.code,
      title: input.title,
      detail: input.detail,
      severity: input.severity,
      ...(input.path === undefined ? {} : { path: Result.getOrThrow(decodeRepoPath(input.path)) }),
    }),
  )

export const normalizeEffectDiagnostic = (payload: {
  readonly code: number
  readonly message: string
  readonly file?: string
  readonly category?: string
}): Diagnostic =>
  diagnostic({
    code: "EG1207",
    title: "Effect package versions are outside the selected profile",
    detail: `Effect diagnostic ${String(payload.code)}: ${payload.message}`,
    severity: payload.category === "warning" ? "warning" : "error",
    ...(payload.file === undefined ? {} : { path: payload.file }),
  })

const unstableImport = /from\s+["'](effect\/unstable\/[^"']+|@effect\/[^"']*unstable[^"']*)["']/g

export const collectEffectDiagnostics = (input: {
  readonly profileVersion: string
  readonly installedVersion?: string
  readonly files: ReadonlyArray<{ readonly path: string; readonly text: string }>
}): ReadonlyArray<Diagnostic> => {
  const diagnostics: Array<Diagnostic> = []
  if (input.installedVersion !== undefined && input.installedVersion !== input.profileVersion) {
    diagnostics.push(
      diagnostic({
        code: "EG1207",
        title: "Effect package versions are outside the selected profile",
        detail: `Installed effect@${input.installedVersion} does not match profile ${input.profileVersion}.`,
        severity: "error",
      }),
    )
  }

  for (const file of input.files) {
    for (const match of file.text.matchAll(unstableImport)) {
      diagnostics.push(
        diagnostic({
          code: "EG1208",
          title: "Unstable Effect import",
          detail: `Imported ${match[1] ?? "effect/unstable"} from ${file.path}.`,
          severity: "warning",
          path: file.path,
        }),
      )
    }
  }

  return diagnostics
}

export const runEffectDiagnosticsCheck = (input: {
  readonly profileVersion: string
  readonly installedVersion?: string
  readonly files: ReadonlyArray<{ readonly path: string; readonly text: string }>
}): VerificationCheck => {
  const diagnostics = collectEffectDiagnostics(input)
  const errors = diagnostics.filter((item) => item.severity === "error")
  return {
    id: "effect-diagnostics",
    ok: errors.length === 0,
    detail:
      errors.length === 0
        ? `Effect ${input.profileVersion} diagnostics clean`
        : diagnostics.map((item) => item.detail).join(" "),
  }
}
