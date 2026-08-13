import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

const root = process.cwd()

const sourceExtensions = new Set([".ts", ".mts", ".js", ".mjs"])

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "dist" || entry.name === "node_modules" || entry.name === "coverage") {
        continue
      }
      files.push(...(await walk(fullPath)))
      continue
    }

    if (sourceExtensions.has(path.extname(entry.name))) {
      files.push(fullPath)
    }
  }

  return files
}

const importPattern = /from\s+["']([^"']+)["']/g

const isTestFile = (filePath) => filePath.endsWith(".test.ts")

const rules = [
  {
    name: "domain isolation",
    roots: ["packages/domain/src"],
    applies: (filePath) => !isTestFile(filePath),
    forbidden: [
      {
        test: (specifier) => specifier.startsWith("node:"),
        message: "domain cannot import Node built-ins; use an adapter port",
      },
      {
        test: (specifier) =>
          specifier === "@cardotrejos/effectgrade" ||
          specifier.startsWith("@cardotrejos/effectgrade/"),
        message: "domain cannot import the CLI package",
      },
      {
        test: (specifier) =>
          specifier.startsWith("@effectgrade/") && specifier !== "@effectgrade/domain",
        message: "domain cannot import other workspace packages",
      },
    ],
  },
  {
    name: "child_process isolation",
    roots: ["packages", "apps"],
    applies: (filePath) =>
      !isTestFile(filePath) && !filePath.includes(`${path.sep}adapters-node${path.sep}`),
    forbidden: [
      {
        test: (specifier) => specifier === "node:child_process" || specifier === "child_process",
        message: "child_process is only allowed in adapter packages",
      },
    ],
  },
  {
    name: "filesystem isolation",
    roots: [
      "packages/domain/src",
      "packages/inventory/src",
      "packages/catalog",
      "packages/capability-packs",
    ],
    applies: (filePath) => !isTestFile(filePath),
    forbidden: [
      {
        test: (specifier) =>
          specifier === "node:fs" || specifier === "node:fs/promises" || specifier === "fs",
        message: "capability and domain code cannot import the filesystem",
      },
    ],
  },
]

const violations = []

for (const rule of rules) {
  for (const relativeRoot of rule.roots) {
    const absoluteRoot = path.join(root, relativeRoot)
    let files = []
    try {
      files = await walk(absoluteRoot)
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        continue
      }
      throw error
    }

    for (const filePath of files) {
      if (!rule.applies(filePath)) {
        continue
      }

      const source = await readFile(filePath, "utf8")
      for (const match of source.matchAll(importPattern)) {
        const specifier = match[1]
        for (const forbidden of rule.forbidden) {
          if (forbidden.test(specifier)) {
            violations.push({
              rule: rule.name,
              file: path.relative(root, filePath),
              specifier,
              message: forbidden.message,
            })
          }
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error("Package boundary violations:\n")
  for (const violation of violations) {
    console.error(`- [${violation.rule}] ${violation.file}`)
    console.error(`  import "${violation.specifier}"`)
    console.error(`  ${violation.message}\n`)
  }
  process.exitCode = 1
} else {
  console.log("Package boundaries: ok")
}
