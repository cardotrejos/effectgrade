import { Result } from "effect"
import { describe, expect, it } from "vitest"

import {
  CapabilityId,
  OperationId,
  PlanId,
  ProfileId,
  TargetId,
  decodeCapabilityId,
  decodeOperationId,
  decodePlanId,
  decodeProfileId,
  decodeTargetId,
  operationId,
} from "./ids.js"
import { decodeRepoPath } from "./path.js"

describe("branded identifiers", () => {
  it("accepts kebab-case capability and profile ids", () => {
    expect(Result.getOrThrow(decodeCapabilityId("hono-bridge"))).toBe("hono-bridge")
    expect(Result.getOrThrow(decodeProfileId("effect-v4-rc108-node22-pnpm-hono-bridge"))).toBe(
      "effect-v4-rc108-node22-pnpm-hono-bridge",
    )
  })

  it("rejects empty or uppercase capability ids", () => {
    expect(Result.isFailure(decodeCapabilityId(""))).toBe(true)
    expect(Result.isFailure(decodeCapabilityId("Hono"))).toBe(true)
    expect(Result.isFailure(decodeCapabilityId("1core"))).toBe(true)
  })

  it("treats target ids as repository paths", () => {
    expect(Result.getOrThrow(decodeTargetId("apps/api"))).toBe("apps/api")
    expect(Result.getOrThrow(decodeTargetId("."))).toBe(".")
    expect(Result.isFailure(decodeTargetId("../outside"))).toBe(true)
  })

  it("derives operation ids from kind and path", () => {
    const path = Result.getOrThrow(decodeRepoPath("src/index.ts"))
    const id = operationId("register-hono-route", path)
    expect(id).toBe("register-hono-route:src/index.ts")
    expect(Result.getOrThrow(decodeOperationId(id))).toBe(id)
  })

  it("requires plan ids to be sha256 digests", () => {
    const digest = `sha256:${"ab".repeat(32)}`
    expect(Result.getOrThrow(decodePlanId(digest))).toBe(digest)
    expect(Result.isFailure(decodePlanId("not-a-digest"))).toBe(true)
  })

  it("keeps each brand on its own schema", () => {
    expect(CapabilityId.identifier).toBe("CapabilityId")
    expect(ProfileId.identifier).toBe("ProfileId")
    expect(TargetId.identifier).toBe("TargetId")
    expect(PlanId.identifier).toBe("PlanId")
    expect(OperationId.identifier).toBe("OperationId")
  })
})
