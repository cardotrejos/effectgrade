import { Effect, Result } from "effect"
import { decodeRepoPath, FileSystem } from "@effectgrade/domain"
import { makeMemoryFileSystem } from "@effectgrade/test-kit"
import { describe, expect, it } from "vitest"

import { inspectPackageGraph } from "./workspace.js"
import { isWorkspaceMember, matchWorkspaceGlob, parsePnpmWorkspacePackages } from "./workspace.js"

const run = (seed: Readonly<Record<string, string>>) =>
  Effect.runPromise(
    Effect.provideService(inspectPackageGraph(), FileSystem, makeMemoryFileSystem(seed)),
  )

describe("parsePnpmWorkspacePackages", () => {
  it("reads a packages list and ignores later keys", () => {
    expect(
      parsePnpmWorkspacePackages(`
# members
packages:
  - "apps/*"
  - packages/*
  - '!packages/skip'
catalog:
  effect: 4.0.0-rc.108
`),
    ).toEqual(["apps/*", "packages/*", "!packages/skip"])
  })
})

describe("matchWorkspaceGlob", () => {
  it("treats * as one path segment and ** as any suffix", () => {
    expect(matchWorkspaceGlob("packages/*", "packages/domain")).toBe(true)
    expect(matchWorkspaceGlob("packages/*", "packages/domain/src")).toBe(false)
    expect(matchWorkspaceGlob("apps/**", "apps/cli/src")).toBe(true)
    expect(matchWorkspaceGlob("apps/**", "packages/cli")).toBe(false)
  })
})

describe("isWorkspaceMember", () => {
  it("applies last-match negation", () => {
    const globs = ["packages/*", "!packages/skip"]
    expect(isWorkspaceMember("packages/domain", globs)).toBe(true)
    expect(isWorkspaceMember("packages/skip", globs)).toBe(false)
    expect(isWorkspaceMember("apps/cli", globs)).toBe(false)
  })
})

describe("inspectPackageGraph", () => {
  it("inventories a single pnpm package from packageManager and lockfile", async () => {
    const inventory = await run({
      "package.json": JSON.stringify({
        name: "acme-api",
        packageManager: "pnpm@11.1.1",
        scripts: { start: "node dist/index.js" },
      }),
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
    })

    expect(inventory.repositoryKind).toBe("single-package")
    expect(inventory.packageManager.value).toBe("pnpm")
    expect(inventory.packageManager.confidence).toBe("certain")
    expect(inventory.packages).toEqual([
      {
        name: "acme-api",
        root: Result.getOrThrow(decodeRepoPath(".")),
        private: false,
        workspaceDependencies: [],
        scripts: { start: "node dist/index.js" },
      },
    ])
    expect(inventory.targets.map((target) => target.root)).toEqual(["."])
    expect(inventory.diagnostics).toEqual([])
  })

  it("inventories npm workspaces and workspace protocol dependencies", async () => {
    const inventory = await run({
      "package.json": JSON.stringify({
        name: "acme",
        private: true,
        workspaces: ["apps/*", "packages/*"],
      }),
      "package-lock.json": '{"lockfileVersion": 3}',
      "apps/api/package.json": JSON.stringify({
        name: "api",
        private: true,
        dependencies: { "@acme/lib": "workspace:*", hono: "4.7.0" },
      }),
      "packages/lib/package.json": JSON.stringify({
        name: "@acme/lib",
        version: "0.0.0",
      }),
    })

    expect(inventory.repositoryKind).toBe("workspace")
    expect(inventory.packageManager.value).toBe("npm")
    expect(inventory.workspaceTool?.value).toBe("npm")
    expect(
      inventory.packages.map((item) => [item.root, item.name, item.workspaceDependencies]),
    ).toEqual([
      [".", "acme", []],
      ["apps/api", "api", ["@acme/lib"]],
      ["packages/lib", "@acme/lib", []],
    ])
    expect(inventory.targets.map((target) => target.id)).toEqual([".", "apps/api", "packages/lib"])
  })

  it("inventories a pnpm workspace from pnpm-workspace.yaml", async () => {
    const inventory = await run({
      "package.json": JSON.stringify({
        name: "root",
        private: true,
        packageManager: "pnpm@11.1.1",
      }),
      "pnpm-workspace.yaml": "packages:\n  - apps/*\n",
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
      "apps/web/package.json": JSON.stringify({ name: "web" }),
      "apps/web/src/index.ts": "export {}\n",
      "tools/orphan/package.json": JSON.stringify({ name: "orphan" }),
    })

    expect(inventory.repositoryKind).toBe("workspace")
    expect(inventory.workspaceTool?.value).toBe("pnpm")
    expect(inventory.packages.map((item) => item.root)).toEqual([".", "apps/web"])
    expect(inventory.packages.some((item) => item.name === "orphan")).toBe(false)
  })

  it("reports EG1001 when packageManager disagrees with the lockfile", async () => {
    const inventory = await run({
      "package.json": JSON.stringify({ name: "mixed", packageManager: "pnpm@11.1.1" }),
      "package-lock.json": '{"lockfileVersion": 3}',
    })

    expect(inventory.packageManager.value).toBe("pnpm")
    expect(inventory.packageManager.alternatives).toEqual(["npm"])
    expect(inventory.diagnostics.some((diagnostic) => diagnostic.code === "EG1001")).toBe(true)
  })

  it("reports EG1002 for a nested lockfile and EG1006 for detect-only managers", async () => {
    const nested = await run({
      "package.json": JSON.stringify({ name: "root", packageManager: "pnpm@11.1.1" }),
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
      "apps/legacy/package-lock.json": '{"lockfileVersion": 3}',
      "apps/legacy/package.json": JSON.stringify({ name: "legacy" }),
    })
    expect(nested.diagnostics.some((diagnostic) => diagnostic.code === "EG1002")).toBe(true)
    expect(nested.diagnostics.find((diagnostic) => diagnostic.code === "EG1002")?.path).toBe(
      "apps/legacy/package-lock.json",
    )

    const yarn = await run({
      "package.json": JSON.stringify({ name: "legacy-yarn", workspaces: ["packages/*"] }),
      "yarn.lock": "# yarn lockfile v1\n",
      "packages/lib/package.json": JSON.stringify({ name: "lib" }),
    })
    expect(yarn.packageManager.value).toBe("yarn")
    expect(yarn.diagnostics.some((diagnostic) => diagnostic.code === "EG1006")).toBe(true)
    expect(yarn.diagnostics.some((diagnostic) => diagnostic.code === "EG1007")).toBe(true)
  })

  it("reports EG1003 when the root manifest is missing or invalid", async () => {
    const missing = await run({ "README.md": "no manifest" })
    expect(missing.diagnostics.some((diagnostic) => diagnostic.code === "EG1003")).toBe(true)
    expect(missing.packages).toEqual([])

    const invalid = await run({ "package.json": "{ not json" })
    expect(invalid.diagnostics.some((diagnostic) => diagnostic.code === "EG1003")).toBe(true)
  })

  it("records turbo.json as an orchestration hint without changing the workspace tool", async () => {
    const inventory = await run({
      "package.json": JSON.stringify({
        name: "root",
        private: true,
        packageManager: "pnpm@11.1.1",
      }),
      "pnpm-workspace.yaml": "packages:\n  - apps/*\n",
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
      "turbo.json": "{}",
      "apps/api/package.json": JSON.stringify({ name: "api" }),
    })

    expect(inventory.workspaceTool?.value).toBe("pnpm")
    expect(inventory.workspaceTool?.evidence.some((item) => item.path === "turbo.json")).toBe(true)
  })
})
