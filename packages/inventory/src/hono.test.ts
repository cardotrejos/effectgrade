import { Result } from "effect"
import { decodeRepoPath } from "@effectgrade/domain"
import { describe, expect, it } from "vitest"

import { detectHono } from "./hono.js"

const path = (value: string) => Result.getOrThrow(decodeRepoPath(value))

describe("detectHono", () => {
  it("detects a Hono server from dependency, constructor, and serve entrypoint", () => {
    const detected = detectHono({
      packageRoot: path("."),
      dependencies: { hono: "4.7.5", "@hono/node-server": "1.13.8" },
      files: [
        {
          path: path("src/index.ts"),
          text: `
import { Hono } from "hono"
import { serve } from "@hono/node-server"

const app = new Hono()
app.get("/health", (c) => c.text("ok"))
serve({ fetch: app.fetch, port: 3000 })
`,
        },
      ],
    })

    expect(detected.framework?.id).toBe("hono")
    expect(detected.framework?.version).toBe("4.7.5")
    expect(detected.framework?.confidence).toBe("certain")
    expect(detected.framework?.identifiers).toEqual(["app"])
    expect(detected.framework?.entrypoints).toEqual(["src/index.ts"])
    expect(detected.framework?.supportedTransformations).toEqual(["hono-bridge"])
    expect(detected.kind).toBe("server")
    expect(detected.runtime.value).toBe("node")
    expect(detected.diagnostics).toEqual([])
  })

  it("reports EG1104 when two exported Hono apps are present", () => {
    const detected = detectHono({
      packageRoot: path("."),
      dependencies: { hono: "4.7.5" },
      files: [
        {
          path: path("src/app-a.ts"),
          text: `import { Hono } from "hono"\nexport const app = new Hono()\n`,
        },
        {
          path: path("src/app-b.ts"),
          text: `import { Hono } from "hono"\nexport const app = new Hono()\n`,
        },
      ],
    })

    expect(detected.framework?.id).toBe("hono")
    expect(detected.diagnostics.some((diagnostic) => diagnostic.code === "EG1104")).toBe(true)
  })

  it("reports EG1301 when Hono is a dependency but no app identifier exists", () => {
    const detected = detectHono({
      packageRoot: path("."),
      dependencies: { hono: "4.7.5" },
      files: [
        {
          path: path("src/index.ts"),
          text: `export const ping = () => "ok"\n`,
        },
      ],
    })

    expect(detected.framework?.id).toBe("hono")
    expect(detected.framework?.identifiers).toEqual([])
    expect(detected.diagnostics.some((diagnostic) => diagnostic.code === "EG1301")).toBe(true)
  })
})
