import { Result } from "effect"
import { decodeDiagnostic, type Diagnostic } from "@effectgrade/domain"
import { parseJsonc } from "@effectgrade/inventory"

export type JsonEditResult =
  | { readonly status: "unchanged"; readonly text: string }
  | { readonly status: "changed"; readonly text: string }
  | { readonly status: "conflict"; readonly diagnostic: Diagnostic }

const dependencySections = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const equals = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

const getAt = (root: unknown, path: ReadonlyArray<string>): unknown => {
  let current = root
  for (const key of path) {
    if (!isRecord(current)) {
      return undefined
    }
    current = current[key]
  }
  return current
}

const setAt = (root: unknown, path: ReadonlyArray<string>, value: unknown): unknown => {
  if (path.length === 0) {
    return value
  }
  const [head, ...rest] = path
  if (head === undefined) {
    return value
  }
  const record = isRecord(root) ? { ...root } : {}
  record[head] = setAt(record[head], rest, value)
  return record
}

const conflict = (detail: string): JsonEditResult => ({
  status: "conflict",
  diagnostic: Result.getOrThrow(
    decodeDiagnostic({
      code: "EG3401",
      title: "JSONC edit conflict",
      detail,
      severity: "error",
    }),
  ),
})

export const upsertJsonProperty = (
  text: string,
  path: ReadonlyArray<string>,
  value: unknown,
): JsonEditResult => {
  let parsed: unknown
  try {
    parsed = parseJsonc(text)
  } catch {
    return conflict("Document is not valid JSONC.")
  }
  if (equals(getAt(parsed, path), value)) {
    return { status: "unchanged", text }
  }
  const next = setAt(parsed, path, value)
  return { status: "changed", text: `${JSON.stringify(next, null, 2)}\n` }
}

export const upsertPackageDependency = (input: {
  readonly text: string
  readonly name: string
  readonly version: string
  readonly section: (typeof dependencySections)[number]
}): JsonEditResult => {
  let parsed: unknown
  try {
    parsed = parseJsonc(input.text)
  } catch {
    return conflict("package.json is not valid JSONC.")
  }
  if (!isRecord(parsed)) {
    return conflict("package.json must be an object.")
  }

  for (const section of dependencySections) {
    const deps = parsed[section]
    if (!isRecord(deps)) {
      continue
    }
    const current = deps[input.name]
    if (current === undefined) {
      continue
    }
    if (section === input.section && current === input.version) {
      return { status: "unchanged", text: input.text }
    }
    if (section === input.section) {
      return conflict(
        `${input.name} is ${String(current)} in ${section}; refusing to replace with ${input.version}.`,
      )
    }
    return conflict(
      `${input.name} is already in ${section}; refusing to add it to ${input.section}.`,
    )
  }

  return upsertJsonProperty(input.text, [input.section, input.name], input.version)
}
