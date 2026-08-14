import { Result } from "effect"
import { decodeRepoPath } from "@effectgrade/domain"
import { describe, expect, it } from "vitest"

import { detectEffect } from "./effect.js"

const path = (value: string) => Result.getOrThrow(decodeRepoPath(value))

describe("detectEffect", () => {
  it("reports not present when there is no Effect evidence", () => {
    const detected = detectEffect({
      packages: [{ root: path("."), dependencies: { hono: "4.7.5" } }],
      files: [{ path: path("src/index.ts"), text: `import { Hono } from "hono"\n` }],
      languageService: false,
    })

    expect(detected.effect.present).toBe(false)
    expect(detected.effect.channel).toBe("unknown")
    expect(detected.diagnostics).toEqual([])
  })

  it("classifies v4 topology from package versions and source hints", () => {
    const detected = detectEffect({
      packages: [
        {
          root: path("."),
          dependencies: { effect: "4.0.0-rc.108", "@effect/platform-node": "4.0.0-rc.108" },
        },
      ],
      files: [
        {
          path: path("src/runtime.ts"),
          text: `
import { Context, Layer, ManagedRuntime, Schema } from "effect"
import { Config } from "effect"

class Clock extends Context.Service<Clock>()("Clock", { succeed: { now: () => 0 } }) {}
const layer = Layer.empty.pipe(Layer.provide(Clock.Default))
export const runtime = ManagedRuntime.make(layer)
export const Name = Schema.String
export const port = Config.number("PORT")
`,
        },
        {
          path: path("src/unstable.ts"),
          text: `import { Ai } from "effect/unstable/ai"\n`,
        },
      ],
      languageService: true,
    })

    expect(detected.effect.present).toBe(true)
    expect(detected.effect.channel).toBe("v4")
    expect(detected.effect.versions.map((item) => [item.name, item.version])).toEqual([
      ["@effect/platform-node", "4.0.0-rc.108"],
      ["effect", "4.0.0-rc.108"],
    ])
    expect(detected.effect.runtimeCandidates).toEqual(["src/runtime.ts"])
    expect(detected.effect.layerCandidates).toEqual(["src/runtime.ts"])
    expect(detected.effect.serviceCandidates).toBeGreaterThan(0)
    expect(detected.effect.schemaUsage).toBe(true)
    expect(detected.effect.configUsage).toBe(true)
    expect(detected.effect.unstableImports).toEqual(["effect/unstable/ai"])
    expect(detected.effect.languageService).toBe(true)
    expect(detected.diagnostics).toEqual([])
  })

  it("reports EG1202 when Effect versions diverge and classifies mixed channels", () => {
    const detected = detectEffect({
      packages: [
        { root: path("apps/api"), dependencies: { effect: "4.0.0-rc.108" } },
        {
          root: path("packages/legacy"),
          dependencies: { effect: "3.20.1", "@effect/schema": "0.75.0" },
        },
      ],
      files: [
        {
          path: path("packages/legacy/src/index.ts"),
          text: `import * as Schema from "@effect/schema/Schema"\n`,
        },
      ],
      languageService: false,
    })

    expect(detected.effect.channel).toBe("mixed")
    expect(detected.effect.duplicateVersions).toEqual(["effect"])
    expect(detected.diagnostics.some((diagnostic) => diagnostic.code === "EG1202")).toBe(true)
  })
})
