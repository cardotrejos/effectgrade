import { Context, type Effect, Schema } from "effect"

import { RepoPath } from "./path.js"

export const FileKind = Schema.Literals(["file", "directory", "symlink"])
export type FileKind = typeof FileKind.Type

export const FileStat = Schema.Struct({
  path: RepoPath,
  kind: FileKind,
  size: Schema.Number,
  mode: Schema.Number,
  symlinkTarget: Schema.optionalKey(Schema.String),
})
export type FileStat = typeof FileStat.Type

export const FileSystemReason = Schema.Literals([
  "not-found",
  "path-escape",
  "symlink-outside",
  "permission",
  "io",
  "is-directory",
  "not-directory",
])
export type FileSystemReason = typeof FileSystemReason.Type

export class FileSystemError extends Schema.TaggedError<FileSystemError>()("FileSystemError", {
  reason: FileSystemReason,
  detail: Schema.String,
  path: Schema.optionalKey(RepoPath),
}) {}

export interface FileSystemApi {
  readonly readFile: (path: RepoPath) => Effect.Effect<string, FileSystemError>
  readonly readBytes: (path: RepoPath) => Effect.Effect<Uint8Array, FileSystemError>
  readonly writeFile: (path: RepoPath, contents: string) => Effect.Effect<void, FileSystemError>
  readonly stat: (path: RepoPath) => Effect.Effect<FileStat, FileSystemError>
  readonly list: (path: RepoPath) => Effect.Effect<ReadonlyArray<RepoPath>, FileSystemError>
}

export const FileSystem = Context.Service<FileSystemApi>("effectgrade/FileSystem")
