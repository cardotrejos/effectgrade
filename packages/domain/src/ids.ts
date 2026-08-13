import { Schema } from "effect"

import { RepoPath, type RepoPath as RepoPathType } from "./path.js"

const kebab = Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9-]*$/))

export const CapabilityId = kebab.pipe(Schema.brand("CapabilityId"))
export type CapabilityId = typeof CapabilityId.Type

export const ProfileId = kebab.pipe(Schema.brand("ProfileId"))
export type ProfileId = typeof ProfileId.Type

export const TargetId = RepoPath.pipe(Schema.brand("TargetId"))
export type TargetId = typeof TargetId.Type

export const PlanId = Schema.String.check(Schema.isPattern(/^sha256:[0-9a-f]{64}$/)).pipe(
  Schema.brand("PlanId"),
)
export type PlanId = typeof PlanId.Type

export const OperationId = Schema.String.check(
  Schema.isPattern(/^[a-z][a-z0-9-]*:(?:\.|(?:[^/]+)(?:\/[^/]+)*)$/),
).pipe(Schema.brand("OperationId"))
export type OperationId = typeof OperationId.Type

export const decodeCapabilityId = Schema.decodeUnknownResult(CapabilityId)
export const decodeProfileId = Schema.decodeUnknownResult(ProfileId)
export const decodeTargetId = Schema.decodeUnknownResult(TargetId)
export const decodePlanId = Schema.decodeUnknownResult(PlanId)
export const decodeOperationId = Schema.decodeUnknownResult(OperationId)

export const operationId = (kind: string, path: RepoPathType): OperationId =>
  Schema.decodeUnknownSync(OperationId)(`${kind}:${path}`)
