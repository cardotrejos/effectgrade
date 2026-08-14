import { Result } from "effect"
import { decodeCapabilityId, decodeProfileId, type CapabilityMetadata } from "@effectgrade/domain"

const capabilityId = (value: string) => Result.getOrThrow(decodeCapabilityId(value))
const profileId = (value: string) => Result.getOrThrow(decodeProfileId(value))

const honoProfile = profileId("effect-v4-rc108-node22-pnpm-hono-bridge")

export const bundledCapabilities: ReadonlyArray<CapabilityMetadata> = [
  {
    id: capabilityId("core"),
    version: "0.1.0",
    title: "Effect core",
    description: "Adds the Effect runtime boundary and official v4 rc.108 packages.",
    category: "foundation",
    stability: "preview",
    supportedProfiles: [honoProfile],
    supportedTargets: ["server", "cli", "worker", "unknown"],
    requires: [],
    conflicts: [],
    packageRequirements: ["effect", "@effect/platform", "@effect/platform-node"],
    approvals: [],
  },
  {
    id: capabilityId("hono-bridge"),
    version: "0.1.0",
    title: "Hono bridge",
    description: "Mounts Effect handlers on an existing Hono application.",
    category: "framework-integration",
    stability: "preview",
    supportedProfiles: [honoProfile],
    supportedTargets: ["server"],
    requires: [capabilityId("core")],
    conflicts: [],
    packageRequirements: ["hono"],
    approvals: [],
  },
]
