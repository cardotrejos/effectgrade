import { Result } from "effect"
import {
  decodeDiagnostic,
  decodeRepoPath,
  type DetectedPackageManager,
  type Diagnostic,
  type PackageManager,
} from "@effectgrade/domain"

export type PackageManagerSignal = {
  readonly manager: PackageManager
  readonly kind: "field" | "lockfile" | "workspace-config"
  readonly path: string
  readonly detail?: string
}

export type RankedPackageManager = {
  readonly detected: DetectedPackageManager
  readonly diagnostics: ReadonlyArray<Diagnostic>
}

const lockfiles: Readonly<Record<string, PackageManager>> = {
  "pnpm-lock.yaml": "pnpm",
  "package-lock.json": "npm",
  "yarn.lock": "yarn",
  "bun.lock": "bun",
  "bun.lockb": "bun",
}

const asPath = (value: string) => Result.getOrThrow(decodeRepoPath(value))

const diagnostic = (input: {
  code: "EG1001" | "EG1006"
  title: string
  detail: string
  severity: "error" | "warning"
  path?: string
}) =>
  Result.getOrThrow(
    decodeDiagnostic({
      code: input.code,
      title: input.title,
      detail: input.detail,
      severity: input.severity,
      ...(input.path === undefined ? {} : { path: asPath(input.path) }),
      remediation:
        input.code === "EG1001"
          ? [
              {
                title: "Align package-manager evidence",
                detail: "Keep one lockfile and set package.json#packageManager to the same tool.",
              },
            ]
          : [
              {
                title: "Use npm or pnpm",
                detail:
                  "EffectGrade inventories Yarn and Bun but only transforms npm and pnpm repositories.",
              },
            ],
    }),
  )

const uniqueManagers = (
  signals: ReadonlyArray<PackageManagerSignal>,
): ReadonlyArray<PackageManager> => [...new Set(signals.map((signal) => signal.manager))].toSorted()

export const parsePackageManagerField = (value: string): PackageManager | undefined => {
  const match = /^(npm|pnpm|yarn|bun)@/.exec(value)
  const name = match?.[1]
  if (name === "npm" || name === "pnpm" || name === "yarn" || name === "bun") {
    return name
  }
  return undefined
}

export const lockfileManager = (fileName: string): PackageManager | undefined => lockfiles[fileName]

export const rankPackageManagerSignals = (
  signals: ReadonlyArray<PackageManagerSignal>,
): RankedPackageManager => {
  const fields = signals.filter((signal) => signal.kind === "field")
  const lockfileSignals = signals.filter((signal) => signal.kind === "lockfile")
  const workspaceSignals = signals.filter((signal) => signal.kind === "workspace-config")

  const fieldManagers = uniqueManagers(fields)
  const lockManagers = uniqueManagers(lockfileSignals)
  const workspaceManagers = uniqueManagers(workspaceSignals)

  let value: PackageManager | undefined
  let confidence: DetectedPackageManager["confidence"] = "low"
  const diagnostics: Array<Diagnostic> = []

  const conflict = (detail: string) =>
    diagnostics.push(
      diagnostic({
        code: "EG1001",
        title: "Conflicting package-manager evidence",
        detail,
        severity: "error",
      }),
    )

  if (fieldManagers.length === 1) {
    value = fieldManagers[0]
    const disagree = lockManagers.filter((manager) => manager !== value)
    if (disagree.length > 0) {
      confidence = "medium"
      conflict(
        `package.json#packageManager is ${value} but lockfile evidence includes ${disagree.join(", ")}`,
      )
    } else {
      confidence = "certain"
    }
  } else if (lockManagers.length === 1) {
    value = lockManagers[0]
    confidence = "high"
  } else if (lockManagers.length > 1) {
    confidence = "low"
    conflict(`Found lockfiles for ${lockManagers.join(" and ")}`)
  } else if (workspaceManagers.length === 1) {
    value = workspaceManagers[0]
    confidence = "medium"
  } else if (workspaceManagers.length > 1) {
    confidence = "low"
    conflict(`Workspace configuration points at ${workspaceManagers.join(" and ")}`)
  }

  const allManagers = uniqueManagers(signals)
  const alternatives =
    value === undefined ? allManagers : allManagers.filter((manager) => manager !== value)

  if (value === "yarn" || value === "bun") {
    diagnostics.push(
      diagnostic({
        code: "EG1006",
        title: "Package manager is detect-only",
        detail: `${value} is recorded from evidence but EffectGrade only transforms npm and pnpm repositories.`,
        severity: "warning",
      }),
    )
  }

  const evidence = signals
    .map((signal) => ({
      kind: signal.kind,
      path: asPath(signal.path),
      ...(signal.detail === undefined ? {} : { detail: signal.detail }),
    }))
    .toSorted((left, right) => {
      const byPath = left.path.localeCompare(right.path)
      return byPath !== 0 ? byPath : left.kind.localeCompare(right.kind)
    })

  return {
    detected: {
      ...(value === undefined ? {} : { value }),
      confidence,
      evidence,
      alternatives,
    },
    diagnostics,
  }
}
