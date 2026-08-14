import { Result } from "effect"
import {
  decodeDiagnostic,
  decodeRepoPath,
  type DetectedFramework,
  type DetectedRuntime,
  type Diagnostic,
  type RepoPath,
  type TargetKind,
} from "@effectgrade/domain"

export type HonoSourceFile = {
  readonly path: RepoPath
  readonly text: string
}

export type HonoDetectionInput = {
  readonly packageRoot: RepoPath
  readonly dependencies: Readonly<Record<string, string>>
  readonly files: ReadonlyArray<HonoSourceFile>
}

export type HonoDetection = {
  readonly framework?: DetectedFramework
  readonly kind: TargetKind
  readonly runtime: DetectedRuntime
  readonly entrypoints: ReadonlyArray<RepoPath>
  readonly diagnostics: ReadonlyArray<Diagnostic>
}

const asPath = (value: string): RepoPath => Result.getOrThrow(decodeRepoPath(value))

const diagnostic = (input: {
  code: "EG1104" | "EG1301"
  title: string
  detail: string
  path?: RepoPath
}) =>
  Result.getOrThrow(
    decodeDiagnostic({
      code: input.code,
      title: input.title,
      detail: input.detail,
      severity: "warning",
      ...(input.path === undefined ? {} : { path: input.path }),
    }),
  )

const constructorPattern =
  /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+Hono\s*[<(]/g
const defaultConstructorPattern = /export\s+default\s+new\s+Hono\s*[<(]/
const importHonoPattern = /from\s+["']hono(?:\/[^"']*)?["']/
const importNodeServerPattern = /from\s+["']@hono\/node-server["']/
const serveCallPattern = /\bserve\s*\(/
const serveFetchPattern = /serve\s*\(\s*\{\s*fetch\s*:\s*([A-Za-z_$][\w$]*)\.fetch/
const exportListPattern = /export\s*\{([^}]+)\}/g

const exportedNames = (text: string): ReadonlySet<string> => {
  const names = new Set<string>()
  if (defaultConstructorPattern.test(text)) {
    names.add("default")
  }
  for (const match of text.matchAll(exportListPattern)) {
    const list = match[1] ?? ""
    for (const part of list.split(",")) {
      const identifier = part
        .trim()
        .split(/\s+as\s+/)[0]
        ?.trim()
      if (identifier !== undefined && identifier.length > 0) {
        names.add(identifier)
      }
    }
  }
  return names
}

const constructors = (
  text: string,
): ReadonlyArray<{ readonly name: string; readonly exported: boolean }> => {
  const exported = exportedNames(text)
  const found: Array<{ readonly name: string; readonly exported: boolean }> = []
  if (defaultConstructorPattern.test(text)) {
    found.push({ name: "default", exported: true })
  }
  for (const match of text.matchAll(constructorPattern)) {
    const name = match[1]
    if (name === undefined) {
      continue
    }
    const statement = match[0]
    found.push({
      name,
      exported: statement.startsWith("export") || exported.has(name),
    })
  }
  return found
}

const manifestPath = (packageRoot: RepoPath): RepoPath =>
  packageRoot === "." ? asPath("package.json") : asPath(`${packageRoot}/package.json`)

export const detectHono = (input: HonoDetectionInput): HonoDetection => {
  const honoVersion = input.dependencies.hono
  const hasNodeServer = input.dependencies["@hono/node-server"] !== undefined
  const hasTypesNode = input.dependencies["@types/node"] !== undefined
  const diagnostics: Array<Diagnostic> = []
  const evidence: Array<DetectedFramework["evidence"][number]> = []

  if (honoVersion !== undefined) {
    evidence.push({
      kind: "field",
      path: manifestPath(input.packageRoot),
      detail: `dependencies.hono=${honoVersion}`,
    })
  }

  const sites: Array<{
    readonly path: RepoPath
    readonly name: string
    readonly exported: boolean
    readonly serve: boolean
    readonly imported: boolean
  }> = []

  for (const file of input.files) {
    const imported = importHonoPattern.test(file.text)
    const serve = importNodeServerPattern.test(file.text) && serveCallPattern.test(file.text)
    const found = constructors(file.text)
    if (imported) {
      evidence.push({ kind: "source", path: file.path, detail: "import hono" })
    }
    if (serve) {
      evidence.push({ kind: "source", path: file.path, detail: "serve" })
    }
    for (const ctor of found) {
      evidence.push({ kind: "source", path: file.path, detail: `new Hono ${ctor.name}` })
      sites.push({
        path: file.path,
        name: ctor.name,
        exported: ctor.exported,
        serve,
        imported,
      })
    }
    if (found.length === 0 && (imported || serve)) {
      sites.push({
        path: file.path,
        name: "",
        exported: false,
        serve,
        imported,
      })
    }
  }

  const hasCtor = sites.some((site) => site.name.length > 0)
  const hasImport = sites.some((site) => site.imported)
  if (honoVersion === undefined && !hasCtor && !hasImport) {
    return {
      kind: "unknown",
      runtime: { confidence: "low", evidence: [], alternatives: [] },
      entrypoints: [],
      diagnostics,
    }
  }

  const exported = sites.filter((site) => site.exported && site.name.length > 0)
  const serveSites = sites.filter((site) => site.serve)
  const exportedFiles = new Set(exported.map((site) => site.path))
  if (exportedFiles.size > 1 && serveSites.length !== 1) {
    diagnostics.push(
      diagnostic({
        code: "EG1104",
        title: "Target framework is ambiguous",
        detail: `Hono apps were exported from ${[...exportedFiles].join(", ")}.`,
      }),
    )
  }

  const servedName = input.files
    .map((file) => serveFetchPattern.exec(file.text)?.[1])
    .find((name) => name !== undefined)

  const chosen =
    (servedName !== undefined ? exported.find((site) => site.name === servedName) : undefined) ??
    (serveSites.length === 1
      ? exported.find((site) => site.path === serveSites[0]?.path)
      : undefined) ??
    (exported.length === 1 ? exported[0] : undefined) ??
    (sites.filter((site) => site.name.length > 0).length === 1
      ? sites.find((site) => site.name.length > 0)
      : undefined)

  const identifiers = [
    ...new Set(
      (chosen !== undefined ? [chosen.name] : exported.map((site) => site.name)).filter(
        (name) => name.length > 0,
      ),
    ),
  ].toSorted()

  if (identifiers.length === 0) {
    diagnostics.push(
      diagnostic({
        code: "EG1301",
        title: "Hono app identifier could not be determined",
        detail: "Hono is present but no app variable or default export was found.",
      }),
    )
  }

  const entrypoints = [
    ...new Set(
      (chosen !== undefined ? [chosen.path] : serveSites.map((site) => site.path)).filter(
        (path) => path.length > 0,
      ),
    ),
  ]

  let confidence: DetectedFramework["confidence"]
  if (honoVersion !== undefined && hasCtor) {
    confidence = "certain"
  } else if (honoVersion !== undefined && hasImport) {
    confidence = "high"
  } else {
    confidence = "medium"
  }

  const runtimeEvidence: Array<DetectedRuntime["evidence"][number]> = []
  if (hasNodeServer) {
    runtimeEvidence.push({
      kind: "field",
      path: manifestPath(input.packageRoot),
      detail: "dependencies.@hono/node-server",
    })
  }
  if (hasTypesNode) {
    runtimeEvidence.push({
      kind: "field",
      path: manifestPath(input.packageRoot),
      detail: "dependencies.@types/node",
    })
  }

  const framework: DetectedFramework = {
    id: "hono",
    ...(honoVersion === undefined ? {} : { version: honoVersion }),
    confidence,
    entrypoints,
    identifiers,
    evidence,
    supportedTransformations: ["hono-bridge"],
  }

  return {
    framework,
    kind: "server",
    runtime:
      hasNodeServer || serveSites.length > 0
        ? {
            value: "node",
            confidence: hasNodeServer ? "certain" : "high",
            evidence: runtimeEvidence,
            alternatives: [],
          }
        : hasTypesNode
          ? { value: "node", confidence: "high", evidence: runtimeEvidence, alternatives: [] }
          : { confidence: "low", evidence: runtimeEvidence, alternatives: [] },
    entrypoints,
    diagnostics,
  }
}
