import { describe, expect, it } from "vitest"

import {
  lockfileManager,
  parsePackageManagerField,
  rankPackageManagerSignals,
} from "./package-manager.js"

describe("parsePackageManagerField", () => {
  it("reads the Corepack name before the version", () => {
    expect(parsePackageManagerField("pnpm@11.1.1")).toBe("pnpm")
    expect(parsePackageManagerField("npm@10.9.2")).toBe("npm")
    expect(parsePackageManagerField("yarn@1.22.22")).toBe("yarn")
    expect(parsePackageManagerField("bun@1.2.4")).toBe("bun")
  })

  it("ignores integrity suffixes", () => {
    expect(parsePackageManagerField("pnpm@9.12.0+sha512.abcdef")).toBe("pnpm")
  })

  it("rejects empty or unknown values", () => {
    expect(parsePackageManagerField("")).toBeUndefined()
    expect(parsePackageManagerField("corepack@1.0.0")).toBeUndefined()
    expect(parsePackageManagerField("pnpm")).toBeUndefined()
  })
})

describe("lockfileManager", () => {
  it("maps supported and detect-only lockfiles", () => {
    expect(lockfileManager("pnpm-lock.yaml")).toBe("pnpm")
    expect(lockfileManager("package-lock.json")).toBe("npm")
    expect(lockfileManager("yarn.lock")).toBe("yarn")
    expect(lockfileManager("bun.lock")).toBe("bun")
    expect(lockfileManager("bun.lockb")).toBe("bun")
    expect(lockfileManager("package.json")).toBeUndefined()
  })
})

describe("rankPackageManagerSignals", () => {
  it("prefers package.json#packageManager over a lockfile", () => {
    const ranked = rankPackageManagerSignals([
      { manager: "npm", kind: "lockfile", path: "package-lock.json" },
      {
        manager: "pnpm",
        kind: "field",
        path: "package.json",
        detail: "packageManager=pnpm@11.1.1",
      },
    ])

    expect(ranked.detected.value).toBe("pnpm")
    expect(ranked.detected.confidence).toBe("medium")
    expect(ranked.detected.alternatives).toEqual(["npm"])
    expect(ranked.diagnostics.some((diagnostic) => diagnostic.code === "EG1001")).toBe(true)
  })

  it("is certain when the field and lockfile agree", () => {
    const ranked = rankPackageManagerSignals([
      {
        manager: "pnpm",
        kind: "field",
        path: "package.json",
        detail: "packageManager=pnpm@11.1.1",
      },
      { manager: "pnpm", kind: "lockfile", path: "pnpm-lock.yaml" },
    ])

    expect(ranked.detected.value).toBe("pnpm")
    expect(ranked.detected.confidence).toBe("certain")
    expect(ranked.detected.alternatives).toEqual([])
    expect(ranked.diagnostics).toEqual([])
  })

  it("leaves the value empty when two lockfiles conflict and there is no field", () => {
    const ranked = rankPackageManagerSignals([
      { manager: "pnpm", kind: "lockfile", path: "pnpm-lock.yaml" },
      { manager: "npm", kind: "lockfile", path: "package-lock.json" },
    ])

    expect(ranked.detected.value).toBeUndefined()
    expect(ranked.detected.confidence).toBe("low")
    expect(ranked.detected.alternatives).toEqual(["npm", "pnpm"])
    expect(ranked.diagnostics.some((diagnostic) => diagnostic.code === "EG1001")).toBe(true)
  })
})
