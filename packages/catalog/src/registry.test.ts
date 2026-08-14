import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import {
  certifyProfile,
  getCapability,
  getProfile,
  listCapabilities,
  listProfiles,
  validateRegistry,
} from "./registry.js"

describe("catalog registry", () => {
  it("lists core and hono-bridge without planners", async () => {
    const capabilities = listCapabilities()
    expect(capabilities.map((item) => item.id)).toEqual(["core", "hono-bridge"])
    expect(getCapability("hono-bridge")?.requires).toEqual(["core"])
    expect(getCapability("hono-bridge")?.supportedTargets).toEqual(["server"])
    expect(await Effect.runPromise(validateRegistry())).toEqual([])
  })

  it("bundles the rc.108 Hono profile and migration-source metadata", async () => {
    const ids = (await Effect.runPromise(listProfiles())).map((item) => item.id)
    expect(ids).toContain("effect-v4-rc108-node22-pnpm-hono-bridge")
    expect(ids).toContain("effect-v3-node22-migration-source")
    expect(ids).toContain("effect-v4-beta107-node22-migration-source")

    const profile = await Effect.runPromise(getProfile("effect-v4-rc108-node22-pnpm-hono-bridge"))
    expect(profile?.effect.version).toBe("4.0.0-rc.108")
    expect(profile?.packageManager).toBe("pnpm")
    expect(profile?.packageVersions.effect).toEqual({ _tag: "exact", version: "4.0.0-rc.108" })
    expect(profile?.digest.startsWith("sha256:")).toBe(true)

    const recertified = await Effect.runPromise(
      certifyProfile({
        ...profile!,
        digest: `sha256:${"00".repeat(32)}`,
      }),
    )
    expect(recertified.digest).toBe(profile?.digest)
  })

  it("changes the profile digest when the Effect coordinate changes", async () => {
    const profile = await Effect.runPromise(getProfile("effect-v4-rc108-node22-pnpm-hono-bridge"))
    expect(profile).toBeDefined()
    const shifted = await Effect.runPromise(
      certifyProfile({
        ...profile!,
        effect: { major: 4, channel: "rc", version: "4.0.0-rc.107" },
      }),
    )
    expect(shifted.digest).not.toBe(profile?.digest)
  })
})
