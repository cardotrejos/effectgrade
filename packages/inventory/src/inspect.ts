import { Effect, Result } from "effect"
import {
  decodeRepoPath,
  FileSystem,
  sortDiagnostics,
  type FileSystemApi,
  type PackageGraphInventory,
  type RepoPath,
  type TargetInventory,
} from "@effectgrade/domain"

import { detectHono } from "./hono.js"
import { inspectTypeScript } from "./typescript.js"
import { walk } from "./walk.js"
import { inspectPackageGraph } from "./workspace.js"

const asPath = (value: string): RepoPath => Result.getOrThrow(decodeRepoPath(value))

const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"])

const isSourceFile = (filePath: string): boolean => {
  if (filePath.endsWith(".d.ts")) {
    return false
  }
  const index = filePath.lastIndexOf(".")
  if (index === -1) {
    return false
  }
  return sourceExtensions.has(filePath.slice(index))
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const collectDependencies = (manifest: unknown): Readonly<Record<string, string>> => {
  const dependencies: Record<string, string> = {}
  if (!isRecord(manifest)) {
    return dependencies
  }
  for (const field of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ]) {
    const deps = manifest[field]
    if (!isRecord(deps)) {
      continue
    }
    for (const [name, version] of Object.entries(deps)) {
      if (typeof version === "string") {
        dependencies[name] = version
      }
    }
  }
  return dependencies
}

const packageRootFor = (filePath: string, roots: ReadonlyArray<RepoPath>): RepoPath => {
  const matching = roots
    .filter((root) => root === "." || filePath === root || filePath.startsWith(`${root}/`))
    .toSorted((left, right) => right.length - left.length)
  return matching[0] ?? asPath(".")
}

const tsconfigFor = (
  targetRoot: RepoPath,
  configs: NonNullable<PackageGraphInventory["typescript"]>["configs"],
): RepoPath | undefined => {
  const exact = targetRoot === "." ? "tsconfig.json" : `${targetRoot}/tsconfig.json`
  if (configs.some((config) => config.path === exact)) {
    return asPath(exact)
  }
  const nested = configs.find(
    (config) =>
      targetRoot !== "." &&
      config.path.startsWith(`${targetRoot}/`) &&
      fileName(config.path) === "tsconfig.json",
  )
  if (nested !== undefined) {
    return nested.path
  }
  if (configs.some((config) => config.path === "tsconfig.json")) {
    return asPath("tsconfig.json")
  }
  return undefined
}

const fileName = (filePath: string): string => {
  const index = filePath.lastIndexOf("/")
  return index === -1 ? filePath : filePath.slice(index + 1)
}

export const inspectInventory = (): Effect.Effect<PackageGraphInventory, never, FileSystemApi> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem
    const graph = yield* inspectPackageGraph()
    const typescript = yield* inspectTypeScript()
    const walked = yield* walk()

    const sources: Array<{ path: RepoPath; text: string }> = []
    for (const entry of walked.entries) {
      if (entry.stat.kind !== "file" || entry.binary || !isSourceFile(entry.path)) {
        continue
      }
      const text = yield* fs.readFile(entry.path).pipe(Effect.orElseSucceed(() => undefined))
      if (text !== undefined) {
        sources.push({ path: entry.path, text })
      }
    }

    const packageRoots = graph.packages.map((pkg) => pkg.root)
    const targets: Array<TargetInventory> = []
    const diagnostics = [...graph.diagnostics, ...typescript.diagnostics]

    for (const target of graph.targets) {
      const manifestPath = target.root === "." ? "package.json" : `${target.root}/package.json`
      const manifestText = yield* fs
        .readFile(asPath(manifestPath))
        .pipe(Effect.orElseSucceed(() => undefined))
      let dependencies: Readonly<Record<string, string>> = {}
      if (manifestText !== undefined) {
        try {
          dependencies = collectDependencies(JSON.parse(manifestText) as unknown)
        } catch {
          dependencies = {}
        }
      }

      const files = sources.filter(
        (file) => packageRootFor(file.path, packageRoots) === target.root,
      )
      const hono = detectHono({
        packageRoot: target.root,
        dependencies,
        files,
      })
      diagnostics.push(...hono.diagnostics)
      const tsconfig = tsconfigFor(target.root, typescript.typescript.configs)

      targets.push({
        ...target,
        kind: hono.framework === undefined ? target.kind : hono.kind,
        runtime: hono.framework === undefined ? target.runtime : hono.runtime,
        frameworks: hono.framework === undefined ? target.frameworks : [hono.framework],
        entrypoints: hono.entrypoints,
        ...(tsconfig === undefined ? {} : { tsconfig }),
      })
    }

    return {
      ...graph,
      targets,
      typescript: typescript.typescript,
      diagnostics: sortDiagnostics(diagnostics),
    }
  })
