import { Effect, Result } from "effect"
import {
  decodeDiagnostic,
  decodeRepoPath,
  FileSystem,
  type Diagnostic,
  type FileSystemApi,
  type RepoPath,
  type TypeScriptConfigInventory,
  type TypeScriptInventory,
} from "@effectgrade/domain"

import { parseJsonc } from "./jsonc.js"
import { walk } from "./walk.js"

export type TypeScriptInspection = {
  readonly typescript: TypeScriptInventory
  readonly diagnostics: ReadonlyArray<Diagnostic>
}

const asPath = (value: string): RepoPath => Result.getOrThrow(decodeRepoPath(value))
const packageJsonPath = asPath("package.json")

const diagnostic = (input: { code: "EG1403"; title: string; detail: string; path?: RepoPath }) =>
  Result.getOrThrow(
    decodeDiagnostic({
      code: input.code,
      title: input.title,
      detail: input.detail,
      severity: "warning",
      ...(input.path === undefined ? {} : { path: input.path }),
      remediation: [
        {
          title: "Use a JSON or JSONC tsconfig",
          detail:
            "EffectGrade reads tsconfig*.json statically and does not execute JavaScript config files.",
        },
      ],
    }),
  )

const fileNameOf = (filePath: string): string => {
  const index = filePath.lastIndexOf("/")
  return index === -1 ? filePath : filePath.slice(index + 1)
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const isTsconfigJson = (filePath: string): boolean => {
  const name = fileNameOf(filePath)
  return name === "tsconfig.json" || (name.startsWith("tsconfig.") && name.endsWith(".json"))
}

const isTsconfigScript = (filePath: string): boolean => {
  const name = fileNameOf(filePath)
  return (
    name === "tsconfig.js" ||
    name === "tsconfig.mjs" ||
    name === "tsconfig.cjs" ||
    name === "tsconfig.ts"
  )
}

const readString = (record: Record<string, unknown>, key: string): string | undefined => {
  const value = record[key]
  return typeof value === "string" ? value : undefined
}

const readBoolean = (record: Record<string, unknown>, key: string): boolean | undefined => {
  const value = record[key]
  return typeof value === "boolean" ? value : undefined
}

const readStringArray = (value: unknown): ReadonlyArray<string> =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []

const typescriptVersionFrom = (manifest: unknown): string | undefined => {
  if (!isRecord(manifest)) {
    return undefined
  }
  for (const field of ["devDependencies", "dependencies", "peerDependencies"]) {
    const deps = manifest[field]
    if (isRecord(deps) && typeof deps.typescript === "string") {
      return deps.typescript
    }
  }
  return undefined
}

const readPaths = (value: unknown): Readonly<Record<string, ReadonlyArray<string>>> | undefined => {
  if (!isRecord(value)) {
    return undefined
  }
  const paths: Record<string, ReadonlyArray<string>> = {}
  for (const [key, mapping] of Object.entries(value)) {
    if (Array.isArray(mapping) && mapping.every((item) => typeof item === "string")) {
      paths[key] = mapping
    }
  }
  return Object.keys(paths).length > 0 ? paths : undefined
}

const toConfig = (path: RepoPath, value: unknown): TypeScriptConfigInventory | undefined => {
  if (!isRecord(value)) {
    return undefined
  }
  const compilerOptions = isRecord(value.compilerOptions) ? value.compilerOptions : {}
  const plugins = Array.isArray(compilerOptions.plugins)
    ? compilerOptions.plugins.flatMap((plugin) =>
        isRecord(plugin) && typeof plugin.name === "string" ? [plugin.name] : [],
      )
    : []
  const references = Array.isArray(value.references)
    ? value.references.flatMap((reference) =>
        isRecord(reference) && typeof reference.path === "string" ? [reference.path] : [],
      )
    : []
  const paths = readPaths(compilerOptions.paths)
  const extendsSpec = readString(value, "extends")
  const module = readString(compilerOptions, "module")
  const moduleResolution = readString(compilerOptions, "moduleResolution")
  const strict = readBoolean(compilerOptions, "strict")
  const jsx = readString(compilerOptions, "jsx")
  const experimentalDecorators = readBoolean(compilerOptions, "experimentalDecorators")
  const composite = readBoolean(compilerOptions, "composite")

  return {
    path,
    ...(extendsSpec === undefined ? {} : { extends: extendsSpec }),
    ...(module === undefined ? {} : { module }),
    ...(moduleResolution === undefined ? {} : { moduleResolution }),
    ...(strict === undefined ? {} : { strict }),
    ...(jsx === undefined ? {} : { jsx }),
    ...(experimentalDecorators === undefined ? {} : { experimentalDecorators }),
    ...(paths === undefined ? {} : { paths }),
    references,
    ...(composite === undefined ? {} : { composite }),
    include: readStringArray(value.include),
    exclude: readStringArray(value.exclude),
    plugins,
    effectLanguageService: plugins.includes("@effect/language-service"),
  }
}

export const inspectTypeScript = (): Effect.Effect<TypeScriptInspection, never, FileSystemApi> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem
    const walked = yield* walk()
    const diagnostics: Array<Diagnostic> = []
    const configs: Array<TypeScriptConfigInventory> = []

    for (const entry of walked.entries) {
      if (entry.stat.kind !== "file") {
        continue
      }
      if (isTsconfigScript(entry.path)) {
        diagnostics.push(
          diagnostic({
            code: "EG1403",
            title: "JavaScript-based configuration was not executed",
            detail: `${entry.path} is a TypeScript config script and was not evaluated.`,
            path: entry.path,
          }),
        )
        continue
      }
      if (!isTsconfigJson(entry.path)) {
        continue
      }
      const text = yield* fs.readFile(entry.path).pipe(Effect.orElseSucceed(() => undefined))
      if (text === undefined) {
        continue
      }
      try {
        const config = toConfig(entry.path, parseJsonc(text))
        if (config !== undefined) {
          configs.push(config)
        }
      } catch {
        continue
      }
    }

    const rootManifestText = yield* fs
      .readFile(packageJsonPath)
      .pipe(Effect.orElseSucceed(() => undefined))
    let version: string | undefined
    if (rootManifestText !== undefined) {
      try {
        version = typescriptVersionFrom(JSON.parse(rootManifestText) as unknown)
      } catch {
        version = undefined
      }
    }

    if (version === undefined) {
      for (const entry of walked.entries) {
        if (fileNameOf(entry.path) !== "package.json") {
          continue
        }
        const text = yield* fs.readFile(entry.path).pipe(Effect.orElseSucceed(() => undefined))
        if (text === undefined) {
          continue
        }
        try {
          version = typescriptVersionFrom(JSON.parse(text) as unknown)
        } catch {
          continue
        }
        if (version !== undefined) {
          break
        }
      }
    }

    return {
      typescript: {
        ...(version === undefined ? {} : { version }),
        configs: configs.toSorted((left, right) => left.path.localeCompare(right.path)),
      },
      diagnostics,
    }
  })
