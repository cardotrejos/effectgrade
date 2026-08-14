import { Result } from "effect"
import { describe, expect, it } from "vitest"

import {
  decodeCapabilityMetadata,
  decodeCompatibilityProfile,
  decodeEffectReleaseCoordinate,
  decodePackageVersionRule,
} from "./catalog.js"

describe("catalog schemas", () => {
  it("decodes an exact Effect release coordinate", () => {
    expect(
      Result.getOrThrow(
        decodeEffectReleaseCoordinate({
          major: 4,
          channel: "rc",
          version: "4.0.0-rc.108",
        }),
      ),
    ).toEqual({
      major: 4,
      channel: "rc",
      version: "4.0.0-rc.108",
    })
  })

  it("decodes exact and forbidden package rules", () => {
    expect(
      Result.getOrThrow(decodePackageVersionRule({ _tag: "exact", version: "4.0.0-rc.108" })),
    ).toEqual({
      _tag: "exact",
      version: "4.0.0-rc.108",
    })
    expect(
      Result.isSuccess(
        decodePackageVersionRule({
          _tag: "forbidden",
          reason: "use the profile-pinned Hono range",
        }),
      ),
    ).toBe(true)
  })

  it("decodes capability metadata without a planner", () => {
    const capability = Result.getOrThrow(
      decodeCapabilityMetadata({
        id: "hono-bridge",
        version: "0.1.0",
        title: "Hono bridge",
        description: "Mount Effect handlers on an existing Hono app.",
        category: "framework-integration",
        stability: "preview",
        supportedProfiles: ["effect-v4-rc108-node22-pnpm-hono-bridge"],
        supportedTargets: ["server"],
        requires: ["core"],
        conflicts: [],
        packageRequirements: ["hono"],
        approvals: [],
      }),
    )
    expect(capability.requires).toEqual(["core"])
    expect(capability.supportedTargets).toEqual(["server"])
  })

  it("decodes a compatibility profile with a digest", () => {
    const profile = Result.getOrThrow(
      decodeCompatibilityProfile({
        id: "effect-v4-rc108-node22-pnpm-hono-bridge",
        version: "0.1.0",
        digest: `sha256:${"ab".repeat(32)}`,
        channel: "preview",
        lifecycle: "active",
        releasedAt: "2026-08-13",
        toolRange: ">=0.0.0",
        effect: { major: 4, channel: "rc", version: "4.0.0-rc.108" },
        packageManager: "pnpm",
        runtime: "node",
        typescript: {
          minimum: "5.9.0",
          tested: "5.9.3",
          recommended: "5.9.3",
          strict: true,
        },
        packageVersions: {
          effect: { _tag: "exact", version: "4.0.0-rc.108" },
        },
        capabilityVersions: { core: "0.1.0", "hono-bridge": "0.1.0" },
        knownIssues: [],
      }),
    )
    expect(profile.effect.version).toBe("4.0.0-rc.108")
    expect(profile.lifecycle).toBe("active")
  })
})
