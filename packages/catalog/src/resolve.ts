import { Effect, Result } from "effect"
import {
  decodeDiagnostic,
  sortDiagnostics,
  type CapabilityMetadata,
  type CompatibilityProfile,
  type Diagnostic,
  type PackageVersionRule,
  type ProfileId,
} from "@effectgrade/domain"

import { getProfile, listCapabilities } from "./registry.js"

export type ResolveRequest = {
  readonly profileId: string
  readonly capabilities: ReadonlyArray<string>
  readonly existing?: Readonly<Record<string, string>>
}

export type ResolvedPackage = {
  readonly name: string
  readonly version: string
  readonly section: "dependencies" | "devDependencies"
  readonly reason: string
  readonly requestedBy: ReadonlyArray<string>
}

export type ResolutionExplanation = {
  readonly capability: string
  readonly reason: string
}

export type Resolution = {
  readonly profileId?: ProfileId
  readonly capabilities: ReadonlyArray<CapabilityMetadata>
  readonly packages: ReadonlyArray<ResolvedPackage>
  readonly explanations: ReadonlyArray<ResolutionExplanation>
  readonly diagnostics: ReadonlyArray<Diagnostic>
}

const diagnostic = (input: {
  code: "EG2201" | "EG2203" | "EG2204" | "EG2210" | "EG2214"
  title: string
  detail: string
  severity?: "error" | "warning"
}) =>
  Result.getOrThrow(
    decodeDiagnostic({
      code: input.code,
      title: input.title,
      detail: input.detail,
      severity: input.severity ?? "error",
    }),
  )

const versionOf = (rule: PackageVersionRule): string | undefined => {
  if ("prefer" in rule) {
    return rule.prefer
  }
  if ("version" in rule) {
    return rule.version
  }
  return undefined
}

const isEffectFamily = (name: string): boolean => name === "effect" || name.startsWith("@effect/")

const sectionOf = (name: string): ResolvedPackage["section"] =>
  name.includes("vitest") || name === "typescript" ? "devDependencies" : "dependencies"

export const closeCapabilities = (
  requested: ReadonlyArray<string>,
  registry: ReadonlyArray<CapabilityMetadata>,
): {
  readonly order: ReadonlyArray<CapabilityMetadata>
  readonly diagnostics: ReadonlyArray<Diagnostic>
} => {
  const byId = new Map<string, CapabilityMetadata>(
    registry.map((capability) => [capability.id, capability]),
  )
  const diagnostics: Array<Diagnostic> = []
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const order: Array<CapabilityMetadata> = []

  const visit = (id: string): void => {
    if (visited.has(id)) {
      return
    }
    if (visiting.has(id)) {
      diagnostics.push(
        diagnostic({
          code: "EG2201",
          title: "Capability dependency cycle",
          detail: `${[...visiting, id].join(" → ")}`,
        }),
      )
      return
    }
    const capability = byId.get(id)
    if (capability === undefined) {
      diagnostics.push(
        diagnostic({
          code: "EG2203",
          title: "Unknown capability",
          detail: `${id} is not in the bundled registry.`,
        }),
      )
      return
    }
    visiting.add(id)
    for (const required of capability.requires) {
      visit(required)
    }
    visiting.delete(id)
    visited.add(id)
    order.push(capability)
  }

  for (const id of requested) {
    visit(id)
  }

  return { order, diagnostics }
}

const collectPackages = (
  profile: CompatibilityProfile,
  capabilities: ReadonlyArray<CapabilityMetadata>,
  existing: Readonly<Record<string, string>> | undefined,
): {
  readonly packages: ReadonlyArray<ResolvedPackage>
  readonly diagnostics: ReadonlyArray<Diagnostic>
} => {
  const packages = new Map<string, ResolvedPackage>()
  const diagnostics: Array<Diagnostic> = []

  for (const capability of capabilities) {
    for (const name of capability.packageRequirements) {
      const rule = profile.packageVersions[name]
      if (rule === undefined) {
        diagnostics.push(
          diagnostic({
            code: "EG2214",
            title: "Effect release-family mismatch",
            detail: `${name} is required by ${capability.id} but is not pinned in ${profile.id}.`,
          }),
        )
        continue
      }
      const version = versionOf(rule)
      if (version === undefined) {
        diagnostics.push(
          diagnostic({
            code: "EG2214",
            title: "Effect release-family mismatch",
            detail: `${name} is forbidden or unresolvable in ${profile.id}.`,
          }),
        )
        continue
      }
      if (isEffectFamily(name) && version !== profile.effect.version) {
        diagnostics.push(
          diagnostic({
            code: "EG2214",
            title: "Effect release-family mismatch",
            detail: `${name} is pinned to ${version} but the profile coordinate is ${profile.effect.version}.`,
          }),
        )
      }
      const already = existing?.[name]
      if (already !== undefined && already !== version && isEffectFamily(name)) {
        diagnostics.push(
          diagnostic({
            code: "EG2214",
            title: "Effect release-family mismatch",
            detail: `${name} is ${already} in the repository but the profile requires ${version}.`,
          }),
        )
      }

      const previous = packages.get(name)
      packages.set(name, {
        name,
        version,
        section: sectionOf(name),
        reason: `${capability.id} requires ${name}`,
        requestedBy: [...(previous?.requestedBy ?? []), capability.id],
      })
    }
  }

  return {
    packages: [...packages.values()].toSorted((left, right) => left.name.localeCompare(right.name)),
    diagnostics,
  }
}

export const resolveCapabilities = (request: ResolveRequest): Effect.Effect<Resolution> =>
  Effect.gen(function* () {
    const profile = yield* getProfile(request.profileId)
    if (profile === undefined) {
      return {
        capabilities: [],
        packages: [],
        explanations: [],
        diagnostics: [
          diagnostic({
            code: "EG2210",
            title: "Compatibility profile unavailable",
            detail: `${request.profileId} is not a bundled profile.`,
          }),
        ],
      }
    }

    const closed = closeCapabilities(request.capabilities, listCapabilities())
    const selected = new Set(closed.order.map((item) => item.id))
    const conflictDiagnostics: Array<Diagnostic> = []
    for (const capability of closed.order) {
      for (const conflict of capability.conflicts) {
        if (selected.has(conflict)) {
          conflictDiagnostics.push(
            diagnostic({
              code: "EG2204",
              title: "Capability conflict",
              detail: `${capability.id} conflicts with ${conflict}.`,
            }),
          )
        }
      }
    }

    const resolved = collectPackages(profile, closed.order, request.existing)
    const explanations = closed.order.flatMap((capability) =>
      capability.requires.map((required) => ({
        capability: capability.id,
        reason: `${capability.id} requires ${required}`,
      })),
    )

    return {
      profileId: profile.id,
      capabilities: closed.order,
      packages: resolved.packages,
      explanations,
      diagnostics: sortDiagnostics([
        ...closed.diagnostics,
        ...conflictDiagnostics,
        ...resolved.diagnostics,
      ]),
    }
  })
