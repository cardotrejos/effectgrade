import { Schema } from "effect"

import { Digest } from "./canonical.js"
import { CapabilityId, ProfileId } from "./ids.js"
import { PackageManager, RuntimeKind, TargetKind } from "./inventory.js"

export const ProfileChannel = Schema.Literals(["stable", "preview", "experimental"])
export type ProfileChannel = typeof ProfileChannel.Type

export const ProfileLifecycle = Schema.Literals(["active", "superseded", "revoked"])
export type ProfileLifecycle = typeof ProfileLifecycle.Type

export const EffectReleaseChannel = Schema.Literals(["stable", "rc", "beta", "nightly"])
export type EffectReleaseChannel = typeof EffectReleaseChannel.Type

export const EffectReleaseCoordinate = Schema.Struct({
  major: Schema.Literals([3, 4]),
  channel: EffectReleaseChannel,
  version: Schema.String,
})
export type EffectReleaseCoordinate = typeof EffectReleaseCoordinate.Type

export const ExactPackageVersion = Schema.Struct({
  _tag: Schema.Literal("exact"),
  version: Schema.String,
})
export type ExactPackageVersion = typeof ExactPackageVersion.Type

export const RangePackageVersion = Schema.Struct({
  _tag: Schema.Literal("range"),
  range: Schema.String,
  prefer: Schema.String,
})
export type RangePackageVersion = typeof RangePackageVersion.Type

export const ForbiddenPackageVersion = Schema.Struct({
  _tag: Schema.Literal("forbidden"),
  reason: Schema.String,
})
export type ForbiddenPackageVersion = typeof ForbiddenPackageVersion.Type

export const PackageVersionRule = Schema.Union([
  ExactPackageVersion,
  RangePackageVersion,
  ForbiddenPackageVersion,
])
export type PackageVersionRule = typeof PackageVersionRule.Type

export const TypeScriptProfile = Schema.Struct({
  minimum: Schema.String,
  tested: Schema.String,
  recommended: Schema.String,
  strict: Schema.Boolean,
})
export type TypeScriptProfile = typeof TypeScriptProfile.Type

export const CompatibilityProfile = Schema.Struct({
  id: ProfileId,
  version: Schema.String,
  digest: Digest,
  channel: ProfileChannel,
  lifecycle: ProfileLifecycle,
  releasedAt: Schema.String,
  toolRange: Schema.String,
  effect: EffectReleaseCoordinate,
  packageManager: PackageManager,
  runtime: RuntimeKind,
  typescript: TypeScriptProfile,
  packageVersions: Schema.Record(Schema.String, PackageVersionRule),
  capabilityVersions: Schema.Record(CapabilityId, Schema.String),
  knownIssues: Schema.Array(Schema.String),
  notes: Schema.optionalKey(Schema.String),
})
export type CompatibilityProfile = typeof CompatibilityProfile.Type

export const CapabilityCategory = Schema.Literals([
  "foundation",
  "framework-integration",
  "transport",
  "database",
  "observability",
  "testing",
  "tooling",
  "deployment",
  "migration",
])
export type CapabilityCategory = typeof CapabilityCategory.Type

export const CapabilityStability = Schema.Literals(["stable", "preview", "experimental"])
export type CapabilityStability = typeof CapabilityStability.Type

export const CapabilityMetadata = Schema.Struct({
  id: CapabilityId,
  version: Schema.String,
  title: Schema.String,
  description: Schema.String,
  category: CapabilityCategory,
  stability: CapabilityStability,
  supportedProfiles: Schema.Array(ProfileId),
  supportedTargets: Schema.Array(TargetKind),
  requires: Schema.Array(CapabilityId),
  conflicts: Schema.Array(CapabilityId),
  packageRequirements: Schema.Array(Schema.String),
  approvals: Schema.Array(Schema.String),
})
export type CapabilityMetadata = typeof CapabilityMetadata.Type

export const decodeEffectReleaseCoordinate = Schema.decodeUnknownResult(EffectReleaseCoordinate)
export const decodePackageVersionRule = Schema.decodeUnknownResult(PackageVersionRule)
export const decodeCompatibilityProfile = Schema.decodeUnknownResult(CompatibilityProfile)
export const decodeCapabilityMetadata = Schema.decodeUnknownResult(CapabilityMetadata)
