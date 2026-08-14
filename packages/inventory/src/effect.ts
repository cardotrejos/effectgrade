import { Result } from "effect"
import {
  decodeDiagnostic,
  decodeRepoPath,
  type Diagnostic,
  type EffectInventory,
  type RepoPath,
} from "@effectgrade/domain"

export type EffectDetectionInput = {
  readonly packages: ReadonlyArray<{
    readonly root: RepoPath
    readonly dependencies: Readonly<Record<string, string>>
  }>
  readonly files: ReadonlyArray<{
    readonly path: RepoPath
    readonly text: string
  }>
  readonly languageService: boolean
}

export type EffectDetection = {
  readonly effect: EffectInventory
  readonly diagnostics: ReadonlyArray<Diagnostic>
}

const asPath = (value: string): RepoPath => Result.getOrThrow(decodeRepoPath(value))

const isEffectPackage = (name: string): boolean => name === "effect" || name.startsWith("@effect/")

const channelFromVersion = (version: string): "v3" | "v4" | "unknown" => {
  if (version.startsWith("3.") || version.startsWith("^3") || version.startsWith("~3")) {
    return "v3"
  }
  if (
    version.startsWith("4.") ||
    version.startsWith("^4") ||
    version.startsWith("~4") ||
    version.includes("rc.")
  ) {
    return "v4"
  }
  return "unknown"
}

const importPattern = /from\s+["'](effect(?:\/[^"']*)?|@effect\/[^"']+)["']/g

const isV3Import = (specifier: string): boolean =>
  specifier.startsWith("@effect/schema") ||
  specifier.startsWith("@effect/io") ||
  specifier.startsWith("@effect/data")

const isUnstableImport = (specifier: string): boolean => specifier.includes("/unstable/")

const hasRuntimeHint = (text: string): boolean =>
  text.includes("ManagedRuntime") || text.includes("NodeRuntime") || text.includes("Layer.launch")

const hasLayerHint = (text: string): boolean =>
  text.includes("Layer.empty") ||
  text.includes("Layer.succeed") ||
  text.includes("Layer.effect") ||
  text.includes("Layer.provide") ||
  text.includes("Layer.merge")

const serviceCount = (text: string): number => {
  const service = text.match(/Context\.Service/g)?.length ?? 0
  const generic = text.match(/Context\.GenericTag/g)?.length ?? 0
  const tag = text.match(/Context\.Tag/g)?.length ?? 0
  return service + generic + tag
}

export const detectEffect = (input: EffectDetectionInput): EffectDetection => {
  const versions = input.packages.flatMap((pkg) =>
    Object.entries(pkg.dependencies)
      .filter(([name]) => isEffectPackage(name))
      .map(([name, version]) => ({
        name,
        version,
        path: pkg.root === "." ? asPath("package.json") : asPath(`${pkg.root}/package.json`),
      })),
  )
  versions.sort(
    (left, right) => left.name.localeCompare(right.name) || left.path.localeCompare(right.path),
  )

  const versionsByName = new Map<string, Set<string>>()
  for (const item of versions) {
    const set = versionsByName.get(item.name) ?? new Set<string>()
    set.add(item.version)
    versionsByName.set(item.name, set)
  }
  const duplicateVersions = [...versionsByName.entries()]
    .filter(([, set]) => set.size > 1)
    .map(([name]) => name)
    .toSorted()

  const imports = new Set<string>()
  const unstableImports = new Set<string>()
  const runtimeCandidates: Array<RepoPath> = []
  const layerCandidates: Array<RepoPath> = []
  let serviceCandidates = 0
  let schemaUsage = false
  let configUsage = false
  let v3Imports = false

  for (const file of input.files) {
    for (const match of file.text.matchAll(importPattern)) {
      const specifier = match[1]
      if (specifier === undefined) {
        continue
      }
      imports.add(specifier)
      if (isUnstableImport(specifier)) {
        unstableImports.add(specifier)
      }
      if (isV3Import(specifier)) {
        v3Imports = true
      }
      if (specifier === "effect/Schema" || specifier.startsWith("@effect/schema")) {
        schemaUsage = true
      }
      if (specifier === "effect/Config") {
        configUsage = true
      }
    }

    if (
      file.text.includes("Schema.") ||
      (file.text.includes('from "effect"') && file.text.includes("Schema"))
    ) {
      if (file.text.includes("Schema")) {
        schemaUsage = schemaUsage || /\bSchema\b/.test(file.text)
      }
    }
    if (
      file.text.includes("Config.") ||
      (/\bConfig\b/.test(file.text) && file.text.includes('from "effect"'))
    ) {
      configUsage = true
    }
    if (
      hasRuntimeHint(file.text) ||
      file.path.endsWith("Runtime.ts") ||
      file.path.endsWith("AppRuntime.ts")
    ) {
      runtimeCandidates.push(file.path)
    }
    if (hasLayerHint(file.text)) {
      layerCandidates.push(file.path)
    }
    serviceCandidates += serviceCount(file.text)
  }

  const versionChannels = versions
    .filter((item) => item.name === "effect" || item.name.startsWith("@effect/"))
    .map((item) => channelFromVersion(item.version))
  const hasV3Version =
    versionChannels.includes("v3") || versions.some((item) => item.name === "@effect/schema")
  const hasV4Version = versionChannels.includes("v4")
  const present = versions.length > 0 || imports.size > 0

  let channel: EffectInventory["channel"] = "unknown"
  if (
    present &&
    (hasV4Version ||
      (!hasV3Version && !v3Imports && versions.some((item) => item.name === "effect")))
  ) {
    if ((hasV3Version || v3Imports) && hasV4Version) {
      channel = "mixed"
    } else if (hasV4Version) {
      channel = "v4"
    } else if (hasV3Version || v3Imports) {
      channel = "v3"
    }
  } else if (hasV3Version || v3Imports) {
    channel = hasV4Version ? "mixed" : "v3"
  }

  if ((hasV3Version || v3Imports) && hasV4Version) {
    channel = "mixed"
  }

  const diagnostics: Array<Diagnostic> = []
  if (duplicateVersions.includes("effect")) {
    const effectVersions = versions
      .filter((item) => item.name === "effect")
      .map((item) => item.version)
    diagnostics.push(
      Result.getOrThrow(
        decodeDiagnostic({
          code: "EG1202",
          title: "Multiple Effect versions resolve in one TypeScript program",
          detail: `effect is declared as ${[...new Set(effectVersions)].toSorted().join(" and ")}.`,
          severity: "error",
        }),
      ),
    )
  }

  return {
    effect: {
      present,
      channel: present ? channel : "unknown",
      versions,
      duplicateVersions,
      imports: [...imports].toSorted(),
      unstableImports: [...unstableImports].toSorted(),
      runtimeCandidates: runtimeCandidates.toSorted((left, right) => left.localeCompare(right)),
      layerCandidates: layerCandidates.toSorted((left, right) => left.localeCompare(right)),
      serviceCandidates,
      schemaUsage,
      configUsage,
      languageService: input.languageService,
    },
    diagnostics,
  }
}
