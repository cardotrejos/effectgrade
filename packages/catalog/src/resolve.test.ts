import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { bundledCapabilities } from "./capabilities.js"
import { closeCapabilities, resolveCapabilities } from "./resolve.js"

describe("closeCapabilities", () => {
  it("includes required capabilities before dependents", () => {
    const closed = closeCapabilities(["hono-bridge"], bundledCapabilities)
    expect(closed.order.map((item) => item.id)).toEqual(["core", "hono-bridge"])
    expect(closed.diagnostics).toEqual([])
  })

  it("reports EG2201 on a capability cycle", () => {
    const cycled = closeCapabilities(
      ["a"],
      [
        {
          ...bundledCapabilities[0]!,
          id: "a" as (typeof bundledCapabilities)[0]["id"],
          requires: ["b" as (typeof bundledCapabilities)[0]["id"]],
        },
        {
          ...bundledCapabilities[0]!,
          id: "b" as (typeof bundledCapabilities)[0]["id"],
          requires: ["a" as (typeof bundledCapabilities)[0]["id"]],
        },
      ],
    )
    expect(cycled.diagnostics.some((diagnostic) => diagnostic.code === "EG2201")).toBe(true)
  })
})

describe("resolveCapabilities", () => {
  it("resolves hono-bridge to exact rc.108 packages with an explanation", async () => {
    const resolved = await Effect.runPromise(
      resolveCapabilities({
        profileId: "effect-v4-rc108-node22-pnpm-hono-bridge",
        capabilities: ["hono-bridge"],
      }),
    )

    expect(resolved.capabilities.map((item) => item.id)).toEqual(["core", "hono-bridge"])
    expect(resolved.packages.map((item) => [item.name, item.version, item.section])).toEqual([
      ["@effect/platform", "4.0.0-rc.108", "dependencies"],
      ["@effect/platform-node", "4.0.0-rc.108", "dependencies"],
      ["effect", "4.0.0-rc.108", "dependencies"],
      ["hono", "4.7.5", "dependencies"],
    ])
    expect(resolved.explanations.some((item) => item.reason.includes("requires core"))).toBe(true)
    expect(resolved.diagnostics).toEqual([])
  })

  it("reports EG2214 when an existing Effect package is outside the profile coordinate", async () => {
    const resolved = await Effect.runPromise(
      resolveCapabilities({
        profileId: "effect-v4-rc108-node22-pnpm-hono-bridge",
        capabilities: ["core"],
        existing: { effect: "4.0.0-beta.107" },
      }),
    )

    expect(resolved.diagnostics.some((diagnostic) => diagnostic.code === "EG2214")).toBe(true)
  })
})
