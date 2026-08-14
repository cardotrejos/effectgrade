import { Effect, Result } from "effect"
import {
  decodeDiagnostic,
  digestCanonical,
  type CapabilityMetadata,
  type CompatibilityProfile,
  type Diagnostic,
} from "@effectgrade/domain"

import { bundledCapabilities } from "./capabilities.js"
import { profileDrafts, type ProfileDraft } from "./profiles.js"

const withoutDigest = (profile: ProfileDraft | CompatibilityProfile): ProfileDraft => {
  if ("digest" in profile) {
    const { digest: _digest, ...document } = profile
    return document
  }
  return profile
}

export const certifyProfile = (
  profile: ProfileDraft | CompatibilityProfile,
): Effect.Effect<CompatibilityProfile> =>
  digestCanonical(withoutDigest(profile)).pipe(
    Effect.map((digest) => ({ ...withoutDigest(profile), digest })),
    Effect.orDie,
  )

export const listProfiles = (): Effect.Effect<ReadonlyArray<CompatibilityProfile>> =>
  Effect.forEach(profileDrafts, certifyProfile, { concurrency: 1 })

export const getProfile = (id: string): Effect.Effect<CompatibilityProfile | undefined> =>
  listProfiles().pipe(Effect.map((profiles) => profiles.find((profile) => profile.id === id)))

export const listCapabilities = (): ReadonlyArray<CapabilityMetadata> => bundledCapabilities

export const getCapability = (id: string): CapabilityMetadata | undefined =>
  bundledCapabilities.find((capability) => capability.id === id)

export const validateRegistry = (): Effect.Effect<ReadonlyArray<Diagnostic>> =>
  Effect.gen(function* () {
    const capabilities = listCapabilities()
    const profiles = yield* listProfiles()
    const seen = new Set<string>()
    const duplicates: Array<string> = []

    for (const item of [
      ...capabilities.map((capability) => capability.id),
      ...profiles.map((profile) => profile.id),
    ]) {
      if (seen.has(item)) {
        duplicates.push(item)
      }
      seen.add(item)
    }

    if (duplicates.length === 0) {
      return []
    }

    return [
      Result.getOrThrow(
        decodeDiagnostic({
          code: "EG2001",
          title: "Duplicate catalog identity",
          detail: `Duplicate ids: ${duplicates.join(", ")}`,
          severity: "error",
        }),
      ),
    ]
  })
