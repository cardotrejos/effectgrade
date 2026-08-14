import { Effect, Result } from "effect"
import {
  decodeDiagnostic,
  decodeRepoPath,
  decodeTargetId,
  FileSystem,
  sortDiagnostics,
  type DetectedWorkspaceTool,
  type Diagnostic,
  type FileSystemApi,
  type PackageGraphInventory,
  type PackageInventory,
  type PackageManager,
  type RepoPath,
  type TargetInventory,
  type WorkspaceTool,
} from "@effectgrade/domain"

import {
  lockfileManager,
  parsePackageManagerField,
  rankPackageManagerSignals,
  type PackageManagerSignal,
} from "./package-manager.js"
import { walk } from "./walk.js"

const rootPath = Result.getOrThrow(decodeRepoPath("."))
const packageJsonPath = Result.getOrThrow(decodeRepoPath("package.json"))
const pnpmWorkspacePath = Result.getOrThrow(decodeRepoPath("pnpm-workspace.yaml"))
const turboPath = Result.getOrThrow(decodeRepoPath("turbo.json"))
const nxPath = Result.getOrThrow(decodeRepoPath("nx.json"))
const rushPath = Result.getOrThrow(decodeRepoPath("rush.json"))
const lernaPath = Result.getOrThrow(decodeRepoPath("lerna.json"))

const rootLockfileNames = [
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
] as const

const limitedWorkspaceFiles: ReadonlyArray<{
  readonly path: RepoPath
  readonly tool: WorkspaceTool
}> = [
  { path: nxPath, tool: "nx" },
  { path: rushPath, tool: "rush" },
  { path: lernaPath, tool: "lerna" },
]

const asPath = (value: string): RepoPath => Result.getOrThrow(decodeRepoPath(value))

const diagnostic = (input: {
  code: "EG1002" | "EG1003" | "EG1007" | "EG1009"
  title: string
  detail: string
  severity: "error" | "warning"
  path?: RepoPath
}) =>
  Result.getOrThrow(
    decodeDiagnostic({
      code: input.code,
      title: input.title,
      detail: input.detail,
      severity: input.severity,
      ...(input.path === undefined ? {} : { path: input.path }),
    }),
  )

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const parseJson = (text: string): unknown | undefined => {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

const unquote = (value: string): string => {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

export const parsePnpmWorkspacePackages = (text: string): ReadonlyArray<string> => {
  const packages: Array<string> = []
  let inPackages = false

  for (const raw of text.split(/\r?\n/)) {
    const trimmed = raw.trim()
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue
    }

    if (/^packages\s*:/.test(trimmed)) {
      inPackages = true
      const inline = trimmed.replace(/^packages\s*:/, "").trim()
      if (inline.startsWith("[")) {
        const parsed = parseJson(inline.replaceAll("'", '"'))
        return Array.isArray(parsed)
          ? parsed.filter((item): item is string => typeof item === "string")
          : []
      }
      continue
    }

    if (!inPackages) {
      continue
    }

    const indent = raw.length - raw.trimStart().length
    if (indent === 0 && trimmed.includes(":") && !trimmed.startsWith("-")) {
      inPackages = false
      continue
    }

    if (trimmed.startsWith("-")) {
      const item = trimmed.slice(1).trim()
      if (item.length > 0) {
        packages.push(unquote(item))
      }
    }
  }

  return packages
}

const globToRegExp = (pattern: string): RegExp => {
  let source = "^"
  let index = 0
  while (index < pattern.length) {
    if (pattern.startsWith("**", index)) {
      source += ".*"
      index += 2
      continue
    }
    const char = pattern[index] ?? ""
    if (char === "*") {
      source += "[^/]*"
    } else if ("\\^$+()[]{}|.".includes(char)) {
      source += `\\${char}`
    } else {
      source += char
    }
    index += 1
  }
  source += "$"
  return new RegExp(source)
}

export const matchWorkspaceGlob = (glob: string, directory: string): boolean =>
  globToRegExp(glob).test(directory)

export const isWorkspaceMember = (directory: string, globs: ReadonlyArray<string>): boolean => {
  let matched = false
  for (const glob of globs) {
    const negated = glob.startsWith("!")
    const pattern = negated ? glob.slice(1) : glob
    if (matchWorkspaceGlob(pattern, directory)) {
      matched = !negated
    }
  }
  return matched
}

const readString = (record: Record<string, unknown>, key: string): string | undefined => {
  const value = record[key]
  return typeof value === "string" ? value : undefined
}

const readScripts = (record: Record<string, unknown>): Readonly<Record<string, string>> => {
  const scripts = record.scripts
  if (!isRecord(scripts)) {
    return {}
  }
  const out: Record<string, string> = {}
  for (const key of Object.keys(scripts).toSorted()) {
    const value = scripts[key]
    if (typeof value === "string") {
      out[key] = value
    }
  }
  return out
}

const workspaceDependencies = (record: Record<string, unknown>): ReadonlyArray<string> => {
  const names = new Set<string>()
  for (const field of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ]) {
    const deps = record[field]
    if (!isRecord(deps)) {
      continue
    }
    for (const [name, version] of Object.entries(deps)) {
      if (typeof version === "string" && version.startsWith("workspace:")) {
        names.add(name)
      }
    }
  }
  return [...names].toSorted()
}

const npmWorkspaceGlobs = (
  manifest: Record<string, unknown>,
): ReadonlyArray<string> | undefined => {
  const workspaces = manifest.workspaces
  if (Array.isArray(workspaces) && workspaces.every((item) => typeof item === "string")) {
    return workspaces
  }
  if (isRecord(workspaces) && Array.isArray(workspaces.packages)) {
    const packages = workspaces.packages
    if (packages.every((item) => typeof item === "string")) {
      return packages
    }
  }
  return undefined
}

const exists = (fs: FileSystemApi, path: RepoPath): Effect.Effect<boolean> =>
  fs.stat(path).pipe(
    Effect.map(() => true),
    Effect.orElseSucceed(() => false),
  )

const parentOf = (filePath: string): string => {
  const index = filePath.lastIndexOf("/")
  return index === -1 ? "." : filePath.slice(0, index)
}

const fileNameOf = (filePath: string): string => {
  const index = filePath.lastIndexOf("/")
  return index === -1 ? filePath : filePath.slice(index + 1)
}

const toPackage = (root: RepoPath, manifest: Record<string, unknown>): PackageInventory => {
  const name = readString(manifest, "name")
  return {
    ...(name === undefined ? {} : { name }),
    root,
    private: manifest.private === true,
    workspaceDependencies: workspaceDependencies(manifest),
    scripts: readScripts(manifest),
  }
}

const toTarget = (pkg: PackageInventory): TargetInventory => ({
  id: Result.getOrThrow(decodeTargetId(pkg.root)),
  root: pkg.root,
  ...(pkg.name === undefined ? {} : { packageName: pkg.name }),
  kind: "unknown",
  runtime: { confidence: "low", evidence: [], alternatives: [] },
  frameworks: [],
  entrypoints: [],
  scripts: pkg.scripts,
})

export const inspectPackageGraph = (): Effect.Effect<PackageGraphInventory, never, FileSystemApi> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem
    const diagnostics: Array<Diagnostic> = []
    const walked = yield* walk()
    diagnostics.push(...walked.diagnostics)

    const packageJsonText = yield* fs
      .readFile(packageJsonPath)
      .pipe(Effect.orElseSucceed(() => undefined))
    if (packageJsonText === undefined) {
      diagnostics.push(
        diagnostic({
          code: "EG1003",
          title: "Root package.json is missing or invalid",
          detail: "No package.json was found at the repository root.",
          severity: "error",
          path: packageJsonPath,
        }),
      )
    }

    const rootManifest = packageJsonText === undefined ? undefined : parseJson(packageJsonText)
    if (packageJsonText !== undefined && !isRecord(rootManifest)) {
      diagnostics.push(
        diagnostic({
          code: "EG1003",
          title: "Root package.json is missing or invalid",
          detail: "package.json is not valid JSON.",
          severity: "error",
          path: packageJsonPath,
        }),
      )
    }

    const manifest = isRecord(rootManifest) ? rootManifest : undefined
    const signals: Array<PackageManagerSignal> = []

    if (manifest !== undefined) {
      const field = readString(manifest, "packageManager")
      const parsed = field === undefined ? undefined : parsePackageManagerField(field)
      if (parsed !== undefined && field !== undefined) {
        signals.push({
          manager: parsed,
          kind: "field",
          path: "package.json",
          detail: `packageManager=${field}`,
        })
      }
    }

    for (const name of rootLockfileNames) {
      if (yield* exists(fs, asPath(name))) {
        const manager = lockfileManager(name)
        if (manager !== undefined) {
          signals.push({ manager, kind: "lockfile", path: name })
        }
      }
    }

    const pnpmWorkspaceText = yield* fs
      .readFile(pnpmWorkspacePath)
      .pipe(Effect.orElseSucceed(() => undefined))
    const pnpmGlobs =
      pnpmWorkspaceText === undefined ? [] : parsePnpmWorkspacePackages(pnpmWorkspaceText)
    const npmGlobs = manifest === undefined ? undefined : npmWorkspaceGlobs(manifest)

    if (pnpmWorkspaceText !== undefined) {
      signals.push({ manager: "pnpm", kind: "workspace-config", path: "pnpm-workspace.yaml" })
    } else if (npmGlobs !== undefined && npmGlobs.length > 0) {
      const manager: PackageManager =
        signals.some((signal) => signal.manager === "yarn" && signal.kind === "lockfile") ||
        signals.some((signal) => signal.manager === "yarn" && signal.kind === "field")
          ? "yarn"
          : "npm"
      signals.push({
        manager,
        kind: "workspace-config",
        path: "package.json",
        detail: "workspaces",
      })
    }

    const ranked = rankPackageManagerSignals(signals)
    diagnostics.push(...ranked.diagnostics)

    for (const entry of walked.entries) {
      if (entry.stat.kind !== "file") {
        continue
      }
      const fileName = fileNameOf(entry.path)
      if (lockfileManager(fileName) !== undefined && entry.path.includes("/")) {
        diagnostics.push(
          diagnostic({
            code: "EG1002",
            title: "Nested lockfile detected",
            detail: `${entry.path} is separate from the repository package manager.`,
            severity: "warning",
            path: entry.path,
          }),
        )
      }
    }

    const globs = pnpmGlobs.length > 0 ? pnpmGlobs : (npmGlobs ?? [])
    const repositoryKind = globs.length > 0 ? "workspace" : "single-package"

    let workspaceTool: DetectedWorkspaceTool | undefined
    if (repositoryKind === "workspace") {
      const tool: WorkspaceTool =
        pnpmGlobs.length > 0 ? "pnpm" : ranked.detected.value === "yarn" ? "yarn" : "npm"
      const evidence: Array<DetectedWorkspaceTool["evidence"][number]> = [
        {
          kind: "workspace-config",
          path: pnpmGlobs.length > 0 ? pnpmWorkspacePath : packageJsonPath,
          ...(pnpmGlobs.length > 0 ? {} : { detail: "workspaces" }),
        },
      ]
      if (yield* exists(fs, turboPath)) {
        evidence.push({ kind: "file", path: turboPath, detail: "orchestration hint" })
      }
      workspaceTool = {
        value: tool,
        confidence: "certain",
        evidence,
        alternatives: evidence.some((item) => item.path === "turbo.json") ? ["turbo"] : [],
      }
      if (tool === "yarn") {
        diagnostics.push(
          diagnostic({
            code: "EG1007",
            title: "Workspace tool is detect-only",
            detail: "Yarn workspaces are inventoried but not a supported transformation target.",
            severity: "warning",
          }),
        )
      }
    }

    for (const limited of limitedWorkspaceFiles) {
      if (yield* exists(fs, limited.path)) {
        diagnostics.push(
          diagnostic({
            code: "EG1007",
            title: "Workspace tool is detect-only",
            detail: `${limited.tool} was detected and is inventoried as limited support.`,
            severity: "warning",
            path: limited.path,
          }),
        )
      }
    }

    const packages: Array<PackageInventory> = []
    if (manifest !== undefined) {
      packages.push(toPackage(rootPath, manifest))
    }

    if (repositoryKind === "workspace") {
      const memberFiles = walked.entries
        .filter((entry) => entry.stat.kind === "file" && fileNameOf(entry.path) === "package.json")
        .toSorted((left, right) => left.path.localeCompare(right.path))

      for (const entry of memberFiles) {
        const directory = parentOf(entry.path)
        if (directory === "." || !isWorkspaceMember(directory, globs)) {
          continue
        }
        const text = yield* fs.readFile(entry.path).pipe(Effect.orElseSucceed(() => undefined))
        const parsed = text === undefined ? undefined : parseJson(text)
        if (!isRecord(parsed)) {
          diagnostics.push(
            diagnostic({
              code: "EG1009",
              title: "Package manifest is unreadable",
              detail: `${entry.path} is missing or not valid JSON.`,
              severity: "warning",
              path: entry.path,
            }),
          )
          continue
        }
        packages.push(toPackage(asPath(directory), parsed))
      }
    }

    packages.sort((left, right) => left.root.localeCompare(right.root))
    const targets = packages.map(toTarget)

    return {
      root: rootPath,
      repositoryKind,
      packageManager: ranked.detected,
      ...(workspaceTool === undefined ? {} : { workspaceTool }),
      packages,
      targets,
      diagnostics: sortDiagnostics(diagnostics),
    }
  })
