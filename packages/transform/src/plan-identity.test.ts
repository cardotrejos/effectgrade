import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { planIdentity, renderPlanSummary, unifiedFileDiff } from "./plan-identity.js"
import type { CapabilityPlan } from "./plan.js"

const samplePlan = {
  resolution: {
    capabilities: [],
    packages: [],
    explanations: [],
    diagnostics: [],
  },
  operations: [
    {
      kind: "write-owned-file",
      path: "src/effect/AppRuntime.ts",
      contents: "export {}\n",
    },
  ],
  diagnostics: [],
} as unknown as CapabilityPlan

describe("planIdentity", () => {
  it("is a stable sha256 of the operations and profile", async () => {
    const first = await Effect.runPromise(
      planIdentity({
        profileId: "effect-v4-rc108-node22-pnpm-hono-bridge",
        capabilities: ["core", "hono-bridge"],
        plan: samplePlan,
      }),
    )
    const second = await Effect.runPromise(
      planIdentity({
        capabilities: ["hono-bridge", "core"],
        profileId: "effect-v4-rc108-node22-pnpm-hono-bridge",
        plan: samplePlan,
      }),
    )
    expect(first).toBe(second)
    expect(first.startsWith("sha256:")).toBe(true)
  })
})

describe("unifiedFileDiff", () => {
  it("emits an add hunk for a new file", () => {
    const diff = unifiedFileDiff("src/effect/AppRuntime.ts", undefined, "export const ok = true\n")
    expect(diff).toContain("--- /dev/null")
    expect(diff).toContain("+++ b/src/effect/AppRuntime.ts")
    expect(diff).toContain("+export const ok = true")
  })
})

describe("renderPlanSummary", () => {
  it("starts with the plan id and lists file operations", () => {
    const text = renderPlanSummary({
      id: "sha256:abc",
      profileId: "effect-v4-rc108-node22-pnpm-hono-bridge",
      target: ".",
      files: [
        { path: "src/effect/AppRuntime.ts", kind: "create" },
        { path: "src/index.ts", kind: "modify" },
      ],
    })
    expect(text).toContain("Plan sha256:abc")
    expect(text).toContain("effect-v4-rc108-node22-pnpm-hono-bridge")
    expect(text).toContain("+ src/effect/AppRuntime.ts")
    expect(text).toContain("~ src/index.ts")
  })
})
