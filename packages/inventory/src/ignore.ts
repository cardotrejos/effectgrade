export const defaultExcludedNames: ReadonlySet<string> = new Set([
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  ".nx",
  "dist",
  "build",
  "coverage",
  ".cache",
  ".output",
  ".vercel",
  ".wrangler",
])

export const defaultExcludedPrefixes: ReadonlyArray<string> = [
  ".effectgrade/cache",
  ".effectgrade/sandboxes",
]

type GitignoreRule = {
  readonly negated: boolean
  readonly directoryOnly: boolean
  readonly anchored: boolean
  readonly pattern: string
}

const globToRegExp = (pattern: string): RegExp => {
  let source = "^"
  for (const char of pattern) {
    if (char === "*") {
      source += "[^/]*"
    } else if (char === "?") {
      source += "[^/]"
    } else if ("\\^$+()[]{}|.".includes(char)) {
      source += `\\${char}`
    } else {
      source += char
    }
  }
  source += "$"
  return new RegExp(source)
}

export const parseGitignore = (text: string): ReadonlyArray<GitignoreRule> => {
  const rules: Array<GitignoreRule> = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.length === 0 || line.startsWith("#")) {
      continue
    }

    let pattern = line
    let negated = false
    if (pattern.startsWith("!")) {
      negated = true
      pattern = pattern.slice(1)
    }

    let directoryOnly = false
    if (pattern.endsWith("/")) {
      directoryOnly = true
      pattern = pattern.slice(0, -1)
    }

    const anchored = pattern.startsWith("/") || pattern.includes("/")
    if (pattern.startsWith("/")) {
      pattern = pattern.slice(1)
    }

    rules.push({ negated, directoryOnly, anchored, pattern })
  }
  return rules
}

const matchesPattern = (relPath: string, pattern: string, anchored: boolean): boolean => {
  const matcher = globToRegExp(pattern)
  if (anchored) {
    return matcher.test(relPath)
  }
  return relPath.split("/").some((segment) => matcher.test(segment))
}

export const isGitIgnored = (
  relPath: string,
  isDirectory: boolean,
  rules: ReadonlyArray<GitignoreRule>,
): boolean => {
  let ignored = false
  for (const rule of rules) {
    if (rule.directoryOnly && !isDirectory) {
      continue
    }
    if (matchesPattern(relPath, rule.pattern, rule.anchored)) {
      ignored = !rule.negated
    }
  }
  return ignored
}

export const isDefaultExcluded = (relPath: string): boolean => {
  if (relPath === ".") {
    return false
  }
  if (
    defaultExcludedPrefixes.some((prefix) => relPath === prefix || relPath.startsWith(`${prefix}/`))
  ) {
    return true
  }
  return relPath.split("/").some((segment) => defaultExcludedNames.has(segment))
}
