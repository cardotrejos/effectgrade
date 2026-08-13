import { sortDiagnostics, type Diagnostic } from "./diagnostic.js"
import type { ProfileId } from "./ids.js"

export const envelopeSchemaVersion = "1"

export type CommandEnvelope<A = unknown> = {
  readonly schemaVersion: string
  readonly command: string
  readonly ok: boolean
  readonly result?: A
  readonly errors: ReadonlyArray<Diagnostic>
  readonly warnings: ReadonlyArray<Diagnostic>
  readonly metadata: {
    readonly toolVersion: string
    readonly profileId?: ProfileId
    readonly startedAt: string
    readonly completedAt: string
    readonly durationMs: number
  }
}

export const makeCommandEnvelope = <A>(input: {
  readonly command: string
  readonly result?: A
  readonly errors: ReadonlyArray<Diagnostic>
  readonly warnings: ReadonlyArray<Diagnostic>
  readonly toolVersion: string
  readonly profileId?: ProfileId
  readonly startedAt: string
  readonly completedAt: string
  readonly durationMs: number
}): CommandEnvelope<A> => {
  const metadata: CommandEnvelope<A>["metadata"] = {
    toolVersion: input.toolVersion,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    durationMs: input.durationMs,
  }

  const envelope: CommandEnvelope<A> = {
    schemaVersion: envelopeSchemaVersion,
    command: input.command,
    ok: input.errors.length === 0,
    errors: sortDiagnostics(input.errors),
    warnings: sortDiagnostics(input.warnings),
    metadata:
      input.profileId === undefined ? metadata : { ...metadata, profileId: input.profileId },
  }

  if (input.result !== undefined && envelope.ok) {
    return { ...envelope, result: input.result }
  }

  return envelope
}
