import { Effect } from "effect"
import { digestCanonical, type Digest } from "@effectgrade/domain"

import type { CapabilityPlan } from "./plan.js"
import type { TreeChangeKind } from "./tree.js"

export const planIdentity = (input: {
  readonly profileId: string
  readonly capabilities: ReadonlyArray<string>
  readonly plan: CapabilityPlan
}): Effect.Effect<Digest> =>
  digestCanonical({
    profileId: input.profileId,
    capabilities: [...input.capabilities].toSorted(),
    operations: input.plan.operations,
  }).pipe(Effect.orDie)

export const unifiedFileDiff = (
  path: string,
  before: string | undefined,
  after: string,
): string => {
  if (before === after) {
    return ""
  }
  const afterLines = after.split("\n")
  if (before === undefined) {
    return [
      "--- /dev/null",
      `+++ b/${path}`,
      `@@ -0,0 +1,${String(afterLines.length)} @@`,
      ...afterLines.map((line) => `+${line}`),
      "",
    ].join("\n")
  }
  const beforeLines = before.split("\n")
  return [
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -1,${String(beforeLines.length)} +1,${String(afterLines.length)} @@`,
    ...beforeLines.map((line) => `-${line}`),
    ...afterLines.map((line) => `+${line}`),
    "",
  ].join("\n")
}

export const renderPlanSummary = (input: {
  readonly id: string
  readonly profileId: string
  readonly target: string
  readonly files: ReadonlyArray<{ readonly path: string; readonly kind: TreeChangeKind }>
}): string => {
  const lines = [
    `Plan ${input.id}`,
    `Profile          ${input.profileId}`,
    `Target           ${input.target}`,
    "",
    "Files",
  ]
  for (const file of input.files) {
    const mark = file.kind === "create" ? "+" : file.kind === "delete" ? "-" : "~"
    lines.push(`  ${mark} ${file.path}`)
  }
  return `${lines.join("\n")}\n`
}
