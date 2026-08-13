import { Effect, Result } from "effect"
import {
  decodeDiagnostic,
  decodeRepoPath,
  FileSystem,
  normalizeRelativePath,
  type Diagnostic,
  type FileStat,
  type FileSystemApi,
  type RepoPath,
} from "@effectgrade/domain"

import { isDefaultExcluded, isGitIgnored, parseGitignore } from "./ignore.js"

export type WalkLimits = {
  readonly maxFiles: number
  readonly maxBytes: number
}

export const defaultWalkLimits: WalkLimits = {
  maxFiles: 20_000,
  maxBytes: 32 * 1024 * 1024,
}

export type WalkEntry = {
  readonly path: RepoPath
  readonly stat: FileStat
  readonly binary: boolean
}

export type WalkResult = {
  readonly entries: ReadonlyArray<WalkEntry>
  readonly diagnostics: ReadonlyArray<Diagnostic>
  readonly ignoredCount: number
  readonly fileCount: number
  readonly byteCount: number
}

const binaryExtensions = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "ico",
  "pdf",
  "zip",
  "gz",
  "tgz",
  "wasm",
  "node",
  "so",
  "dylib",
  "exe",
  "bin",
  "woff",
  "woff2",
  "ttf",
  "eot",
  "mp3",
  "mp4",
])

const rootPath = Result.getOrThrow(decodeRepoPath("."))
const gitignorePath = Result.getOrThrow(decodeRepoPath(".gitignore"))

export const isBinary = (relPath: string, bytes: Uint8Array): boolean => {
  const extension = relPath.includes(".") ? (relPath.split(".").at(-1) ?? "") : ""
  if (binaryExtensions.has(extension.toLowerCase())) {
    return true
  }
  return bytes.subarray(0, 8192).includes(0)
}

export const walkCacheKey = (stat: Pick<FileStat, "path" | "kind" | "size">): string =>
  `${stat.path}:${stat.kind}:${String(stat.size)}`

const parentPath = (current: RepoPath): string => {
  if (current === ".") {
    return "."
  }
  const index = current.lastIndexOf("/")
  return index === -1 ? "." : current.slice(0, index)
}

const diagnostic = (input: {
  code: "EG1501" | "EG1502" | "EG1503"
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

export const walk = (
  options: {
    readonly limits?: Partial<WalkLimits>
    readonly includeIgnored?: boolean
  } = {},
): Effect.Effect<WalkResult, never, FileSystemApi> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem
    const limits = { ...defaultWalkLimits, ...options.limits }
    const includeIgnored = options.includeIgnored === true
    const gitignoreText = yield* fs.readFile(gitignorePath).pipe(Effect.orElseSucceed(() => ""))
    const rules = parseGitignore(gitignoreText)

    const entries: Array<WalkEntry> = []
    const diagnostics: Array<Diagnostic> = []
    let ignoredCount = 0
    let fileCount = 0
    let byteCount = 0
    let limited = false

    const visit = (current: RepoPath): Effect.Effect<void> =>
      Effect.gen(function* () {
        if (limited) {
          return
        }

        const stat = yield* fs.stat(current)
        const excluded = current !== "." && isDefaultExcluded(current)
        const ignored = current !== "." && isGitIgnored(current, stat.kind === "directory", rules)

        if ((excluded || ignored) && !includeIgnored) {
          ignoredCount += 1
          return
        }

        if (stat.kind === "symlink") {
          const target = stat.symlinkTarget ?? ""
          const combined = `${parentPath(current)}/${target}`
          if (normalizeRelativePath(combined) === undefined) {
            diagnostics.push(
              diagnostic({
                code: "EG1501",
                title: "Symlink points outside repository and was skipped",
                detail: `${current} → ${target}`,
                path: current,
              }),
            )
            return
          }
        }

        if (stat.kind === "file") {
          if (fileCount >= limits.maxFiles) {
            limited = true
            diagnostics.push(
              diagnostic({
                code: "EG1502",
                title: "Walk file-count limit reached",
                detail: `Stopped after ${String(limits.maxFiles)} files`,
              }),
            )
            return
          }
          if (byteCount + stat.size > limits.maxBytes) {
            limited = true
            diagnostics.push(
              diagnostic({
                code: "EG1503",
                title: "Walk byte limit reached",
                detail: `Stopped after ${String(limits.maxBytes)} bytes`,
              }),
            )
            return
          }

          const bytes = yield* fs
            .readBytes(current)
            .pipe(Effect.orElseSucceed(() => new Uint8Array()))
          entries.push({ path: current, stat, binary: isBinary(current, bytes) })
          fileCount += 1
          byteCount += stat.size
          return
        }

        if (current !== ".") {
          entries.push({ path: current, stat, binary: false })
        }

        if (stat.kind === "directory") {
          const children = yield* fs.list(current)
          for (const child of children) {
            yield* visit(child)
          }
        }
      }).pipe(Effect.orElseSucceed(() => undefined))

    yield* visit(rootPath)

    return {
      entries: entries.toSorted((left, right) => left.path.localeCompare(right.path)),
      diagnostics,
      ignoredCount,
      fileCount,
      byteCount,
    }
  })
