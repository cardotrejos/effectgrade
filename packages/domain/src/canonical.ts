import { Effect, Schema } from "effect"

export const Digest = Schema.String.check(Schema.isPattern(/^sha256:[0-9a-f]{64}$/)).pipe(
  Schema.brand("Digest"),
)
export type Digest = typeof Digest.Type

export const volatileKeys: ReadonlySet<string> = new Set([
  "startedAt",
  "completedAt",
  "durationMs",
  "pid",
  "tmpDir",
  "timestamp",
])

export const stableSort = <A>(
  items: ReadonlyArray<A>,
  compare: (left: A, right: A) => number,
): ReadonlyArray<A> => items.toSorted(compare)

const canonicalize = (value: unknown): unknown => {
  if (value === null || typeof value !== "object") {
    return value
  }

  if (Array.isArray(value)) {
    return value.map(canonicalize)
  }

  const record = value as Record<string, unknown>
  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(record).toSorted()) {
    const field = record[key]
    if (field !== undefined) {
      sorted[key] = canonicalize(field)
    }
  }
  return sorted
}

export const canonicalJson = (value: unknown): string => JSON.stringify(canonicalize(value))

export const omitVolatile = (value: unknown, keys: ReadonlySet<string> = volatileKeys): unknown => {
  if (value === null || typeof value !== "object") {
    return value
  }

  if (Array.isArray(value)) {
    return value.map((item) => omitVolatile(item, keys))
  }

  const record = value as Record<string, unknown>
  const next: Record<string, unknown> = {}
  for (const key of Object.keys(record)) {
    if (keys.has(key)) {
      continue
    }
    next[key] = omitVolatile(record[key], keys)
  }
  return next
}

const toHex = (bytes: Uint8Array): string =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")

export class DigestError extends Schema.TaggedError<DigestError>()("DigestError", {
  cause: Schema.Unknown,
}) {}

export const digestCanonical = (value: unknown): Effect.Effect<Digest, DigestError> =>
  Effect.tryPromise({
    try: async () => {
      const hash = await globalThis.crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(canonicalJson(omitVolatile(value))),
      )
      return Schema.decodeUnknownSync(Digest)(`sha256:${toHex(new Uint8Array(hash))}`)
    },
    catch: (cause) => new DigestError({ cause }),
  })
