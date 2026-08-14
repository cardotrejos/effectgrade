import { describe, expect, it } from "vitest"

import { upsertJsonProperty, upsertPackageDependency } from "./package-ops.js"

describe("upsertJsonProperty", () => {
  it("returns the original text when the value is already present", () => {
    const text = `{
  // keep
  "name": "acme"
}
`
    const result = upsertJsonProperty(text, ["name"], "acme")
    expect(result.status).toBe("unchanged")
    if (result.status === "unchanged") {
      expect(result.text).toBe(text)
    }
  })

  it("adds a missing property and is idempotent", () => {
    const first = upsertJsonProperty(`{\n  "name": "acme"\n}\n`, ["private"], true)
    expect(first.status).toBe("changed")
    if (first.status !== "changed") {
      return
    }
    const second = upsertJsonProperty(first.text, ["private"], true)
    expect(second.status).toBe("unchanged")
    expect(JSON.parse(first.text)).toMatchObject({ name: "acme", private: true })
  })
})

describe("upsertPackageDependency", () => {
  it("adds a missing dependency", () => {
    const result = upsertPackageDependency({
      text: `{\n  "name": "acme"\n}\n`,
      name: "effect",
      version: "4.0.0-rc.108",
      section: "dependencies",
    })
    expect(result.status).toBe("changed")
    if (result.status === "changed") {
      expect(JSON.parse(result.text).dependencies.effect).toBe("4.0.0-rc.108")
    }
  })

  it("leaves an exact match unchanged", () => {
    const text = `{\n  "dependencies": {\n    "effect": "4.0.0-rc.108"\n  }\n}\n`
    const result = upsertPackageDependency({
      text,
      name: "effect",
      version: "4.0.0-rc.108",
      section: "dependencies",
    })
    expect(result.status).toBe("unchanged")
    if (result.status === "unchanged") {
      expect(result.text).toBe(text)
    }
  })

  it("conflicts when the version or section already disagrees", () => {
    const version = upsertPackageDependency({
      text: `{\n  "dependencies": {\n    "effect": "3.17.13"\n  }\n}\n`,
      name: "effect",
      version: "4.0.0-rc.108",
      section: "dependencies",
    })
    expect(version.status).toBe("conflict")

    const section = upsertPackageDependency({
      text: `{\n  "devDependencies": {\n    "effect": "4.0.0-rc.108"\n  }\n}\n`,
      name: "effect",
      version: "4.0.0-rc.108",
      section: "dependencies",
    })
    expect(section.status).toBe("conflict")
  })
})
