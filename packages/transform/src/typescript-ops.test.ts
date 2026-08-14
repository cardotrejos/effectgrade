import { describe, expect, it } from "vitest"

import { addNamedImport, registerHonoRoute } from "./typescript-ops.js"

describe("addNamedImport", () => {
  it("adds a missing named import without reprinting the file", () => {
    const source = `import { Hono } from "hono"\n\nconst app = new Hono()\n`
    const result = addNamedImport(source, {
      moduleSpecifier: "./effect/http/routes",
      name: "effectRoutes",
    })
    expect(result.status).toBe("changed")
    if (result.status === "changed") {
      expect(result.text).toContain('import { effectRoutes } from "./effect/http/routes"')
      expect(result.text).toContain("const app = new Hono()")
    }
  })

  it("is unchanged when the named import already exists", () => {
    const source = `import { effectRoutes } from "./effect/http/routes"\n`
    const result = addNamedImport(source, {
      moduleSpecifier: "./effect/http/routes",
      name: "effectRoutes",
    })
    expect(result.status).toBe("unchanged")
    if (result.status === "unchanged") {
      expect(result.text).toBe(source)
    }
  })
})

describe("registerHonoRoute", () => {
  it("registers a route after the Hono app and is idempotent", () => {
    const source = `import { Hono } from "hono"\n\nconst app = new Hono()\napp.get("/health", (c) => c.text("ok"))\n`
    const first = registerHonoRoute(source, {
      appIdentifier: "app",
      mountPath: "/effect",
      handlerIdentifier: "effectRoutes",
    })
    expect(first.status).toBe("changed")
    if (first.status !== "changed") {
      return
    }
    expect(first.text).toContain('app.route("/effect", effectRoutes)')
    const second = registerHonoRoute(first.text, {
      appIdentifier: "app",
      mountPath: "/effect",
      handlerIdentifier: "effectRoutes",
    })
    expect(second.status).toBe("unchanged")
  })

  it("conflicts when the mount path is already used", () => {
    const source = `const app = new Hono()\napp.route("/effect", otherRoutes)\n`
    const result = registerHonoRoute(source, {
      appIdentifier: "app",
      mountPath: "/effect",
      handlerIdentifier: "effectRoutes",
    })
    expect(result.status).toBe("conflict")
  })
})
