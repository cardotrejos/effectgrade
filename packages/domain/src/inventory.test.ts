import { Result, Schema } from "effect"
import { describe, expect, it } from "vitest"

import { decodeDiagnostic } from "./diagnostic.js"
import { decodeRepoPath } from "./path.js"
import {
  Confidence,
  DetectedPackageManager,
  PackageGraphInventory,
  PackageInventory,
  TargetInventory,
  WorkspaceTool,
  decodePackageGraphInventory,
  decodePackageManager,
} from "./inventory.js"

describe("PackageManager", () => {
  it("accepts npm and pnpm as transformation-supported values", () => {
    expect(Result.getOrThrow(decodePackageManager("npm"))).toBe("npm")
    expect(Result.getOrThrow(decodePackageManager("pnpm"))).toBe("pnpm")
  })

  it("accepts yarn and bun as detect-only values", () => {
    expect(Result.getOrThrow(decodePackageManager("yarn"))).toBe("yarn")
    expect(Result.getOrThrow(decodePackageManager("bun"))).toBe("bun")
  })

  it("rejects unknown manager names", () => {
    expect(Result.isFailure(decodePackageManager("pnPm"))).toBe(true)
    expect(Result.isFailure(decodePackageManager("corepack"))).toBe(true)
  })
})

describe("PackageGraphInventory", () => {
  it("decodes a single-package inventory with evidence", () => {
    const inventory = Result.getOrThrow(
      decodePackageGraphInventory({
        root: ".",
        repositoryKind: "single-package",
        packageManager: {
          value: "pnpm",
          confidence: "certain",
          evidence: [{ kind: "field", path: "package.json", detail: "packageManager=pnpm@11.1.1" }],
          alternatives: [],
        },
        packages: [
          {
            name: "acme-api",
            root: ".",
            private: false,
            workspaceDependencies: [],
            scripts: { start: "node dist/index.js" },
          },
        ],
        targets: [
          {
            id: ".",
            root: ".",
            packageName: "acme-api",
            kind: "unknown",
            runtime: { confidence: "low", evidence: [], alternatives: [] },
            frameworks: [],
            entrypoints: [],
            scripts: { start: "node dist/index.js" },
          },
        ],
        diagnostics: [],
      }),
    )

    expect(inventory.repositoryKind).toBe("single-package")
    expect(inventory.packageManager.value).toBe("pnpm")
    expect(inventory.packages[0]?.name).toBe("acme-api")
    expect(inventory.targets[0]?.id).toBe(Result.getOrThrow(decodeRepoPath(".")))
  })

  it("decodes workspace-protocol dependencies and optional workspace tool", () => {
    const inventory = Result.getOrThrow(
      decodePackageGraphInventory({
        root: ".",
        repositoryKind: "workspace",
        packageManager: {
          value: "npm",
          confidence: "high",
          evidence: [{ kind: "lockfile", path: "package-lock.json" }],
          alternatives: [],
        },
        workspaceTool: {
          value: "npm",
          confidence: "certain",
          evidence: [{ kind: "field", path: "package.json", detail: "workspaces" }],
          alternatives: [],
        },
        packages: [
          {
            name: "root",
            root: ".",
            private: true,
            workspaceDependencies: [],
            scripts: {},
          },
          {
            name: "api",
            root: "apps/api",
            private: true,
            workspaceDependencies: ["@acme/lib"],
            scripts: {},
          },
        ],
        targets: [],
        diagnostics: [],
      }),
    )

    expect(inventory.workspaceTool?.value).toBe("npm")
    expect(inventory.packages.map((item) => item.workspaceDependencies)).toEqual([
      [],
      ["@acme/lib"],
    ])
  })

  it("is a schema", () => {
    expect(typeof PackageInventory.make).toBe("function")
    expect(typeof TargetInventory.make).toBe("function")
    expect(typeof DetectedPackageManager.make).toBe("function")
    expect(typeof PackageGraphInventory.make).toBe("function")
    expect(typeof Schema.encodeSync(PackageGraphInventory)).toBe("function")
    expect(Result.getOrThrow(decodePackageManager("pnpm"))).toBe("pnpm")
    expect(WorkspaceTool.literals).toContain("pnpm")
    expect(Confidence.literals).toEqual(["certain", "high", "medium", "low"])
  })

  it("keeps diagnostics branded when present", () => {
    const diagnostic = Result.getOrThrow(
      decodeDiagnostic({
        code: "EG1001",
        title: "Conflicting package-manager evidence",
        detail: "packageManager is pnpm but package-lock.json is present",
        severity: "error",
      }),
    )
    const inventory = Result.getOrThrow(
      decodePackageGraphInventory({
        root: ".",
        repositoryKind: "single-package",
        packageManager: {
          confidence: "medium",
          evidence: [
            { kind: "field", path: "package.json" },
            { kind: "lockfile", path: "package-lock.json" },
          ],
          alternatives: ["pnpm", "npm"],
        },
        packages: [],
        targets: [],
        diagnostics: [diagnostic],
      }),
    )

    expect(inventory.diagnostics[0]?.code).toBe("EG1001")
    expect(inventory.packageManager.alternatives).toEqual(["pnpm", "npm"])
  })
})
