import { Result } from "effect"
import {
  decodeCapabilityId,
  decodeProfileId,
  type CompatibilityProfile,
  type PackageVersionRule,
  type ProfileId,
} from "@effectgrade/domain"

const profileId = (value: string): ProfileId => Result.getOrThrow(decodeProfileId(value))
const capabilityId = (value: string) => Result.getOrThrow(decodeCapabilityId(value))
const coreId = capabilityId("core")
const honoBridgeId = capabilityId("hono-bridge")

const exact = (version: string): PackageVersionRule => ({ _tag: "exact", version })

const rc108 = {
  effect: exact("4.0.0-rc.108"),
  "@effect/platform": exact("4.0.0-rc.108"),
  "@effect/platform-node": exact("4.0.0-rc.108"),
  "@effect/vitest": exact("4.0.0-rc.108"),
  hono: { _tag: "range" as const, range: "^4.7.0", prefer: "4.7.5" },
}

const typescript = {
  minimum: "5.9.0",
  tested: "5.9.3",
  recommended: "5.9.3",
  strict: true,
}

export type ProfileDraft = Omit<CompatibilityProfile, "digest">

export const profileDrafts: ReadonlyArray<ProfileDraft> = [
  {
    id: profileId("effect-v4-rc108-node22-pnpm-hono-bridge"),
    version: "0.1.0",
    channel: "preview",
    lifecycle: "active",
    releasedAt: "2026-08-13",
    toolRange: ">=0.0.0",
    effect: { major: 4, channel: "rc", version: "4.0.0-rc.108" },
    packageManager: "pnpm",
    runtime: "node",
    typescript,
    packageVersions: rc108,
    capabilityVersions: { [coreId]: "0.1.0", [honoBridgeId]: "0.1.0" },
    knownIssues: [],
    notes: "First certified Hono adoption profile for Effect 4.0.0-rc.108.",
  },
  {
    id: profileId("effect-v3-node22-migration-source"),
    version: "0.1.0",
    channel: "preview",
    lifecycle: "active",
    releasedAt: "2026-08-13",
    toolRange: ">=0.0.0",
    effect: { major: 3, channel: "stable", version: "3.17.13" },
    packageManager: "pnpm",
    runtime: "node",
    typescript,
    packageVersions: {
      effect: { _tag: "range", range: "^3.17.0", prefer: "3.17.13" },
    },
    capabilityVersions: {},
    knownIssues: [],
    notes: "Migration-source metadata only. Not a transformation target.",
  },
  {
    id: profileId("effect-v4-beta107-node22-migration-source"),
    version: "0.1.0",
    channel: "preview",
    lifecycle: "active",
    releasedAt: "2026-08-13",
    toolRange: ">=0.0.0",
    effect: { major: 4, channel: "beta", version: "4.0.0-beta.107" },
    packageManager: "pnpm",
    runtime: "node",
    typescript,
    packageVersions: {
      effect: exact("4.0.0-beta.107"),
    },
    capabilityVersions: {},
    knownIssues: [],
    notes: "Migration-source metadata from v4 beta.107 toward rc.108.",
  },
]
