import { Effect } from "effect"
import type { FileSystemApi, FileSystemError } from "@effectgrade/domain"

import { applyOperations, type PlanOperation } from "./plan.js"
import { makeOverlayTree, type TreeChange } from "./tree.js"

export type IdempotencyCheck = {
  readonly id: "idempotency"
  readonly ok: boolean
  readonly detail: string
}

export const remainingPlanChanges = (
  base: FileSystemApi,
  operations: ReadonlyArray<PlanOperation>,
): Effect.Effect<ReadonlyArray<TreeChange>, FileSystemError> =>
  Effect.gen(function* () {
    const tree = makeOverlayTree(base)
    yield* applyOperations(tree, operations)
    return tree.changes()
  })

export const verifyPlanIdempotency = (
  base: FileSystemApi,
  operations: ReadonlyArray<PlanOperation>,
): Effect.Effect<IdempotencyCheck, FileSystemError> =>
  remainingPlanChanges(base, operations).pipe(
    Effect.map((changes) => ({
      id: "idempotency" as const,
      ok: changes.length === 0,
      detail:
        changes.length === 0
          ? "repeated plan is empty"
          : `remaining changes: ${changes.map((change) => change.path).join(", ")}`,
    })),
  )
