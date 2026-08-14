import { Effect, Result } from "effect"
import {
  decodeRepoPath,
  FileSystemError,
  type FileStat,
  type FileSystemApi,
  normalizeRelativePath,
  type RepoPath,
} from "@effectgrade/domain"

type Entry =
  | { readonly kind: "file"; readonly bytes: Uint8Array; readonly mode: number }
  | { readonly kind: "directory"; readonly mode: number }
  | { readonly kind: "symlink"; readonly target: string; readonly mode: number }

const decoder = new TextDecoder()
const encoder = new TextEncoder()

const asPath = (value: string): RepoPath => Result.getOrThrow(decodeRepoPath(value))

const parentOf = (value: RepoPath): RepoPath | undefined => {
  if (value === ".") {
    return undefined
  }
  const index = value.lastIndexOf("/")
  return index === -1 ? asPath(".") : asPath(value.slice(0, index))
}

const resolveSymlink = (
  from: RepoPath,
  target: string,
): Effect.Effect<RepoPath, FileSystemError> => {
  const parent = parentOf(from) ?? asPath(".")
  const combined = parent === "." ? target : `${parent}/${target}`
  const normalized = normalizeRelativePath(combined)
  if (normalized === undefined) {
    return new FileSystemError({
      reason: "symlink-outside",
      detail: `symlink ${from} points outside the repository`,
      path: from,
    })
  }
  return Effect.succeed(asPath(normalized))
}

export const makeMemoryFileSystem = (
  seed: Readonly<Record<string, string>> = {},
): FileSystemApi & {
  readonly symlink: (from: RepoPath, target: string) => Effect.Effect<void, FileSystemError>
} => {
  const tree = new Map<string, Entry>([[".", { kind: "directory", mode: 0o755 }]])

  const ensureDirectory = (directory: RepoPath): void => {
    if (tree.has(directory)) {
      return
    }
    const parent = parentOf(directory)
    if (parent !== undefined) {
      ensureDirectory(parent)
    }
    tree.set(directory, { kind: "directory", mode: 0o755 })
  }

  const get = (value: RepoPath): Effect.Effect<Entry, FileSystemError> => {
    const entry = tree.get(value)
    if (entry === undefined) {
      return new FileSystemError({
        reason: "not-found",
        detail: `${value} does not exist`,
        path: value,
      })
    }
    return Effect.succeed(entry)
  }

  const follow = (
    value: RepoPath,
    seen: ReadonlySet<string> = new Set(),
  ): Effect.Effect<RepoPath, FileSystemError> =>
    Effect.gen(function* () {
      const entry = yield* get(value)
      if (entry.kind !== "symlink") {
        return value
      }
      if (seen.has(value)) {
        return yield* new FileSystemError({
          reason: "io",
          detail: `symlink cycle at ${value}`,
          path: value,
        })
      }
      const next = yield* resolveSymlink(value, entry.target)
      return yield* follow(next, new Set([...seen, value]))
    })

  const writeFile = (value: RepoPath, contents: string): Effect.Effect<void, FileSystemError> =>
    Effect.sync(() => {
      const parent = parentOf(value)
      if (parent !== undefined) {
        ensureDirectory(parent)
      }
      tree.set(value, { kind: "file", bytes: encoder.encode(contents), mode: 0o644 })
    })

  const removeFile = (value: RepoPath): Effect.Effect<void, FileSystemError> =>
    Effect.gen(function* () {
      const entry = yield* get(value)
      if (entry.kind === "directory") {
        return yield* new FileSystemError({
          reason: "is-directory",
          detail: `${value} is a directory`,
          path: value,
        })
      }
      tree.delete(value)
    })

  const symlink = (from: RepoPath, target: string): Effect.Effect<void, FileSystemError> =>
    Effect.sync(() => {
      const parent = parentOf(from)
      if (parent !== undefined) {
        ensureDirectory(parent)
      }
      tree.set(from, { kind: "symlink", target, mode: 0o644 })
    })

  const stat = (value: RepoPath): Effect.Effect<FileStat, FileSystemError> =>
    Effect.gen(function* () {
      const entry = yield* get(value)
      if (entry.kind === "symlink") {
        return {
          path: value,
          kind: "symlink",
          size: encoder.encode(entry.target).byteLength,
          mode: entry.mode,
          symlinkTarget: entry.target,
        }
      }
      if (entry.kind === "directory") {
        return { path: value, kind: "directory", size: 0, mode: entry.mode }
      }
      return { path: value, kind: "file", size: entry.bytes.byteLength, mode: entry.mode }
    })

  const readBytes = (value: RepoPath): Effect.Effect<Uint8Array, FileSystemError> =>
    Effect.gen(function* () {
      const resolved = yield* follow(value)
      const entry = yield* get(resolved)
      if (entry.kind === "directory") {
        return yield* new FileSystemError({
          reason: "is-directory",
          detail: `${resolved} is a directory`,
          path: value,
        })
      }
      if (entry.kind === "symlink") {
        return yield* new FileSystemError({
          reason: "io",
          detail: `${resolved} is a dangling symlink`,
          path: value,
        })
      }
      return entry.bytes
    })

  const readFile = (value: RepoPath): Effect.Effect<string, FileSystemError> =>
    readBytes(value).pipe(Effect.map((bytes) => decoder.decode(bytes)))

  const list = (value: RepoPath): Effect.Effect<ReadonlyArray<RepoPath>, FileSystemError> =>
    Effect.gen(function* () {
      const resolved = yield* follow(value)
      const entry = yield* get(resolved)
      if (entry.kind !== "directory") {
        return yield* new FileSystemError({
          reason: "not-directory",
          detail: `${resolved} is not a directory`,
          path: value,
        })
      }

      const children: Array<RepoPath> = []
      for (const key of tree.keys()) {
        if (key === ".") {
          continue
        }
        if (resolved === ".") {
          if (!key.includes("/")) {
            children.push(asPath(key))
          }
          continue
        }
        const prefix = `${resolved}/`
        if (key.startsWith(prefix) && !key.slice(prefix.length).includes("/")) {
          children.push(asPath(key))
        }
      }
      return children.toSorted((left, right) => left.localeCompare(right))
    })

  for (const [seedPath, contents] of Object.entries(seed)) {
    Effect.runSync(writeFile(asPath(seedPath), contents))
  }

  return { readFile, readBytes, writeFile, removeFile, stat, list, symlink }
}
