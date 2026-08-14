import { Effect, Result } from "effect"
import {
  decodeDiagnostic,
  type Diagnostic,
  type FileSystemApi,
  type FileSystemError,
  type RepoPath,
} from "@effectgrade/domain"

import { remainingPlanChanges } from "./idempotency.js"
import { applyOperations, type PlanOperation } from "./plan.js"
import { flushOverlay, makeOverlayTree, type TreeChange } from "./tree.js"

export type ApplyResult = {
  readonly applied: boolean
  readonly noop: boolean
  readonly files: ReadonlyArray<TreeChange>
  readonly diagnostics: ReadonlyArray<Diagnostic>
}

const stale = Result.getOrThrow(
  decodeDiagnostic({
    code: "EG5006",
    title: "Plan is stale",
    detail: "Repository preconditions no longer match the verified plan.",
    severity: "error",
  }),
)

export const applyVerifiedPlan = (
  dest: FileSystemApi,
  operations: ReadonlyArray<PlanOperation>,
  preconditions?: {
    readonly expectedDigest?: string
    readonly actualDigest?: string
  },
): Effect.Effect<ApplyResult> =>
  Effect.gen(function* () {
    if (
      preconditions?.expectedDigest !== undefined &&
      preconditions.actualDigest !== undefined &&
      preconditions.expectedDigest !== preconditions.actualDigest
    ) {
      return { applied: false, noop: false, files: [], diagnostics: [stale] }
    }

    const remaining = yield* remainingPlanChanges(dest, operations)
    if (remaining.length === 0) {
      return { applied: false, noop: true, files: [], diagnostics: [] }
    }

    const backups = new Map<string, string | undefined>()
    for (const change of remaining) {
      const previous = yield* dest.readFile(change.path).pipe(Effect.orElseSucceed(() => undefined))
      backups.set(change.path, previous)
    }

    const tree = makeOverlayTree(dest)
    yield* applyOperations(tree, operations)
    const flushed = yield* flushOverlay(tree, dest).pipe(Effect.result)
    if (Result.isFailure(flushed)) {
      yield* restore(dest, backups)
      return {
        applied: false,
        noop: false,
        files: [],
        diagnostics: [
          Result.getOrThrow(
            decodeDiagnostic({
              code: "EG5004",
              title: "Apply rolled back",
              detail: flushed.failure.detail,
              severity: "error",
            }),
          ),
        ],
      }
    }

    return { applied: true, noop: false, files: remaining, diagnostics: [] }
  }).pipe(Effect.orDie)

const restore = (
  dest: FileSystemApi,
  backups: ReadonlyMap<string, string | undefined>,
): Effect.Effect<void, FileSystemError> =>
  Effect.gen(function* () {
    for (const [path, previous] of [...backups.entries()].toReversed()) {
      if (previous !== undefined) {
        yield* dest.writeFile(path as RepoPath, previous)
      }
    }
  })
