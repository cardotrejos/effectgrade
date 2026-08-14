import { Effect } from "effect"
import { FileSystemError, type FileSystemApi, type RepoPath } from "@effectgrade/domain"

export type TreeChangeKind = "create" | "modify" | "delete"

export type TreeChange = {
  readonly path: RepoPath
  readonly kind: TreeChangeKind
}

export type OverlayTree = {
  readonly readFile: (path: RepoPath) => Effect.Effect<string, FileSystemError>
  readonly writeFile: (path: RepoPath, contents: string) => Effect.Effect<void, FileSystemError>
  readonly deleteFile: (path: RepoPath) => Effect.Effect<void, FileSystemError>
  readonly changes: () => ReadonlyArray<TreeChange>
}

type OverlayEntry =
  | { readonly kind: "file"; readonly contents: string }
  | { readonly kind: "deleted" }

export const makeOverlayTree = (base: FileSystemApi): OverlayTree => {
  const overlay = new Map<string, OverlayEntry>()

  const readFile = (path: RepoPath): Effect.Effect<string, FileSystemError> =>
    Effect.gen(function* () {
      const local = overlay.get(path)
      if (local?.kind === "deleted") {
        return yield* new FileSystemError({
          reason: "not-found",
          detail: `${path} was deleted in the overlay`,
          path,
        })
      }
      if (local?.kind === "file") {
        return local.contents
      }
      return yield* base.readFile(path)
    })

  const writeFile = (path: RepoPath, contents: string): Effect.Effect<void, FileSystemError> =>
    Effect.gen(function* () {
      const stat = yield* base.stat(path).pipe(Effect.orElseSucceed(() => undefined))
      if (stat?.kind === "symlink") {
        return yield* new FileSystemError({
          reason: "io",
          detail: `refusing to write through symlink ${path}`,
          path,
        })
      }
      const current = yield* base.readFile(path).pipe(Effect.orElseSucceed(() => undefined))
      if (current === contents) {
        overlay.delete(path)
        return
      }
      overlay.set(path, { kind: "file", contents })
    })

  const deleteFile = (path: RepoPath): Effect.Effect<void, FileSystemError> =>
    Effect.gen(function* () {
      const current = yield* base.readFile(path).pipe(Effect.orElseSucceed(() => undefined))
      if (current === undefined && !overlay.has(path)) {
        return yield* new FileSystemError({
          reason: "not-found",
          detail: `${path} does not exist`,
          path,
        })
      }
      overlay.set(path, { kind: "deleted" })
    })

  const changes = (): ReadonlyArray<TreeChange> => {
    const items: Array<TreeChange> = []
    for (const [path, entry] of overlay) {
      if (entry.kind === "deleted") {
        items.push({ path: path as RepoPath, kind: "delete" })
        continue
      }
      items.push({
        path: path as RepoPath,
        kind: itemsBaseExists(path) ? "modify" : "create",
      })
    }
    return items.toSorted((left, right) => left.path.localeCompare(right.path))
  }

  const itemsBaseExists = (path: string): boolean =>
    Effect.runSync(
      base.stat(path as RepoPath).pipe(
        Effect.map(() => true),
        Effect.orElseSucceed(() => false),
      ),
    )

  return { readFile, writeFile, deleteFile, changes }
}
