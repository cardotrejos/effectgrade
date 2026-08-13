import { Effect, Schema, SchemaGetter, SchemaIssue } from "effect"

const isWindowsDrive = /^[A-Za-z]:(?:\/|$)/

export const normalizeRelativePath = (value: string): string | undefined => {
  if (value.includes("\0")) {
    return undefined
  }

  const replaced = value.replaceAll("\\", "/")
  if (replaced.startsWith("/") || isWindowsDrive.test(replaced)) {
    return undefined
  }

  const segments: Array<string> = []
  for (const segment of replaced.split("/")) {
    if (segment === "" || segment === ".") {
      continue
    }
    if (segment === "..") {
      return undefined
    }
    segments.push(segment)
  }

  return segments.length === 0 ? "." : segments.join("/")
}

export const RepoPath = Schema.String.pipe(
  Schema.decodeTo(Schema.String.pipe(Schema.brand("RepoPath")), {
    decode: SchemaGetter.transformOrFail((input) => {
      const normalized = normalizeRelativePath(input)
      if (normalized === undefined) {
        return Effect.fail(new SchemaIssue.InvalidValue({ message: "Invalid repository path" }))
      }
      return Effect.succeed(normalized)
    }),
    encode: SchemaGetter.passthrough(),
  }),
)

export type RepoPath = typeof RepoPath.Type

export const decodeRepoPath = Schema.decodeUnknownResult(RepoPath)
export const encodeRepoPath = Schema.encodeSync(RepoPath)
