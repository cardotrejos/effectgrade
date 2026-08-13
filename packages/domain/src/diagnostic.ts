import { Result, Schema } from "effect"

import { CapabilityId, OperationId, TargetId } from "./ids.js"
import { RepoPath } from "./path.js"

export const DiagnosticCode = Schema.String.check(Schema.isPattern(/^EG\d{4}$/)).pipe(
  Schema.brand("DiagnosticCode"),
)
export type DiagnosticCode = typeof DiagnosticCode.Type

export const diagnosticNamespaces = {
  inspect: { from: 1000, to: 1999 },
  catalog: { from: 2000, to: 2999 },
  plan: { from: 3000, to: 3999 },
  verify: { from: 4000, to: 4999 },
  apply: { from: 5000, to: 5999 },
} as const

export const Severity = Schema.Literals(["info", "warning", "error"])
export type Severity = typeof Severity.Type

const PositiveInt = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1))

export const SourcePosition = Schema.Struct({
  line: PositiveInt,
  column: PositiveInt,
})
export type SourcePosition = typeof SourcePosition.Type

export const SourceRange = Schema.Struct({
  start: SourcePosition,
  end: SourcePosition,
})
export type SourceRange = typeof SourceRange.Type

export const Remediation = Schema.Struct({
  title: Schema.String,
  detail: Schema.String,
})
export type Remediation = typeof Remediation.Type

export const Diagnostic = Schema.Struct({
  code: DiagnosticCode,
  title: Schema.String,
  detail: Schema.String,
  severity: Severity,
  path: Schema.optionalKey(RepoPath),
  range: Schema.optionalKey(SourceRange),
  capabilityId: Schema.optionalKey(CapabilityId),
  targetId: Schema.optionalKey(TargetId),
  operationId: Schema.optionalKey(OperationId),
  remediation: Schema.optionalKey(Schema.Array(Remediation)),
  docsKey: Schema.optionalKey(Schema.String),
})
export type Diagnostic = typeof Diagnostic.Type

export const decodeDiagnosticCode = Schema.decodeUnknownResult(DiagnosticCode)

export const decodeDiagnostic = (value: unknown) => {
  const decoded = Schema.decodeUnknownResult(Diagnostic)(value)
  if (Result.isFailure(decoded)) {
    return decoded
  }

  const diagnostic = decoded.success
  if (diagnostic.docsKey !== undefined) {
    return Result.succeed(diagnostic)
  }

  return Result.succeed({
    ...diagnostic,
    docsKey: diagnostic.code,
  })
}

export const diagnosticDocsUrl = (docsKey: string): string =>
  `https://github.com/cardotrejos/effectgrade/blob/main/docs/errors/${docsKey}.md`

export const renderDiagnostic = (diagnostic: Diagnostic): string => {
  const sections = [`${diagnostic.code} ${diagnostic.title}`]

  if (diagnostic.path !== undefined) {
    sections.push(diagnostic.path)
  }

  sections.push(diagnostic.detail)

  for (const step of diagnostic.remediation ?? []) {
    sections.push(`${step.title}: ${step.detail}`)
  }

  sections.push(`Docs: ${diagnosticDocsUrl(diagnostic.docsKey ?? diagnostic.code)}`)

  return sections.join("\n\n")
}

export const sortDiagnostics = (
  diagnostics: ReadonlyArray<Diagnostic>,
): ReadonlyArray<Diagnostic> =>
  diagnostics.toSorted((left, right) => {
    const byCode = left.code.localeCompare(right.code)
    if (byCode !== 0) {
      return byCode
    }
    return (left.path ?? "").localeCompare(right.path ?? "")
  })
