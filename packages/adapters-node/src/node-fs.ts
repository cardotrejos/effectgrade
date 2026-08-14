import { lstat, mkdir, readFile, readdir, readlink, unlink, writeFile } from "node:fs/promises"
import path from "node:path"

import { Effect, Result } from "effect"
import {
  decodeRepoPath,
  FileSystemError,
  type FileStat,
  type FileSystemApi,
  type RepoPath,
} from "@effectgrade/domain"

const toAbsolute = (root: string, rel: RepoPath): string =>
  path.resolve(root, rel === "." ? "." : rel)

const isInside = (root: string, candidate: string): boolean => {
  const relative = path.relative(root, candidate)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

const fail = (reason: FileSystemError["reason"], detail: string, repoPath: RepoPath) =>
  new FileSystemError({ reason, detail, path: repoPath })

const mapNodeError = (error: unknown, repoPath: RepoPath): FileSystemError => {
  const code =
    error !== null && typeof error === "object" && "code" in error ? String(error.code) : ""
  if (code === "ENOENT") {
    return fail("not-found", `${repoPath} does not exist`, repoPath)
  }
  if (code === "EACCES" || code === "EPERM") {
    return fail("permission", `${repoPath} is not readable`, repoPath)
  }
  if (code === "EISDIR") {
    return fail("is-directory", `${repoPath} is a directory`, repoPath)
  }
  if (code === "ENOTDIR") {
    return fail("not-directory", `${repoPath} is not a directory`, repoPath)
  }
  return fail("io", error instanceof Error ? error.message : "filesystem error", repoPath)
}

const resolveContained = (
  root: string,
  repoPath: RepoPath,
): Effect.Effect<{ absolute: string; stat: Awaited<ReturnType<typeof lstat>> }, FileSystemError> =>
  Effect.gen(function* () {
    const absolute = toAbsolute(root, repoPath)
    if (!isInside(root, absolute)) {
      return yield* fail("path-escape", `${repoPath} escapes the repository root`, repoPath)
    }

    const stat = yield* Effect.tryPromise({
      try: () => lstat(absolute),
      catch: (error) => mapNodeError(error, repoPath),
    })

    if (stat.isSymbolicLink()) {
      const target = yield* Effect.tryPromise({
        try: () => readlink(absolute),
        catch: (error) => mapNodeError(error, repoPath),
      })
      const resolved = path.resolve(path.dirname(absolute), target)
      if (!isInside(root, resolved)) {
        return yield* fail(
          "symlink-outside",
          `symlink ${repoPath} points outside the repository`,
          repoPath,
        )
      }
      return { absolute: resolved, stat }
    }

    return { absolute, stat }
  })

export const makeNodeFileSystem = (root: string): FileSystemApi => {
  const rootAbsolute = path.resolve(root)

  const stat = (repoPath: RepoPath): Effect.Effect<FileStat, FileSystemError> =>
    Effect.gen(function* () {
      const absolute = toAbsolute(rootAbsolute, repoPath)
      if (!isInside(rootAbsolute, absolute)) {
        return yield* fail("path-escape", `${repoPath} escapes the repository root`, repoPath)
      }

      const info = yield* Effect.tryPromise({
        try: () => lstat(absolute),
        catch: (error) => mapNodeError(error, repoPath),
      })

      if (info.isSymbolicLink()) {
        const target = yield* Effect.tryPromise({
          try: () => readlink(absolute),
          catch: (error) => mapNodeError(error, repoPath),
        })
        return {
          path: repoPath,
          kind: "symlink",
          size: info.size,
          mode: info.mode,
          symlinkTarget: target,
        }
      }

      return {
        path: repoPath,
        kind: info.isDirectory() ? "directory" : "file",
        size: info.size,
        mode: info.mode,
      }
    })

  const readBytes = (repoPath: RepoPath): Effect.Effect<Uint8Array, FileSystemError> =>
    Effect.gen(function* () {
      const resolved = yield* resolveContained(rootAbsolute, repoPath)
      if (resolved.stat.isDirectory()) {
        return yield* fail("is-directory", `${repoPath} is a directory`, repoPath)
      }
      return yield* Effect.tryPromise({
        try: async () => new Uint8Array(await readFile(resolved.absolute)),
        catch: (error) => mapNodeError(error, repoPath),
      })
    })

  const readFileString = (repoPath: RepoPath): Effect.Effect<string, FileSystemError> =>
    readBytes(repoPath).pipe(Effect.map((bytes) => new TextDecoder().decode(bytes)))

  const writeFileString = (
    repoPath: RepoPath,
    contents: string,
  ): Effect.Effect<void, FileSystemError> =>
    Effect.gen(function* () {
      const absolute = toAbsolute(rootAbsolute, repoPath)
      if (!isInside(rootAbsolute, absolute)) {
        return yield* fail("path-escape", `${repoPath} escapes the repository root`, repoPath)
      }
      yield* Effect.tryPromise({
        try: () => mkdir(path.dirname(absolute), { recursive: true }),
        catch: (error) => mapNodeError(error, repoPath),
      })
      yield* Effect.tryPromise({
        try: () => writeFile(absolute, contents),
        catch: (error) => mapNodeError(error, repoPath),
      })
    })

  const removeFile = (repoPath: RepoPath): Effect.Effect<void, FileSystemError> =>
    Effect.gen(function* () {
      const absolute = toAbsolute(rootAbsolute, repoPath)
      if (!isInside(rootAbsolute, absolute)) {
        return yield* fail("path-escape", `${repoPath} escapes the repository root`, repoPath)
      }
      const info = yield* Effect.tryPromise({
        try: () => lstat(absolute),
        catch: (error) => mapNodeError(error, repoPath),
      })
      if (info.isDirectory()) {
        return yield* fail("is-directory", `${repoPath} is a directory`, repoPath)
      }
      yield* Effect.tryPromise({
        try: () => unlink(absolute),
        catch: (error) => mapNodeError(error, repoPath),
      })
    })

  const list = (repoPath: RepoPath): Effect.Effect<ReadonlyArray<RepoPath>, FileSystemError> =>
    Effect.gen(function* () {
      const resolved = yield* resolveContained(rootAbsolute, repoPath)
      if (!resolved.stat.isDirectory() && !resolved.stat.isSymbolicLink()) {
        return yield* fail("not-directory", `${repoPath} is not a directory`, repoPath)
      }
      const names = yield* Effect.tryPromise({
        try: () => readdir(resolved.absolute),
        catch: (error) => mapNodeError(error, repoPath),
      })
      return names
        .map((name) =>
          Result.getOrThrow(decodeRepoPath(repoPath === "." ? name : `${repoPath}/${name}`)),
        )
        .toSorted((left, right) => left.localeCompare(right))
    })

  return {
    readFile: readFileString,
    readBytes,
    writeFile: writeFileString,
    removeFile,
    stat,
    list,
  }
}
