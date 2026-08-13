import { mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"

const root = process.cwd()
const cliPackagePath = path.join(root, "apps/cli/package.json")
const pkg = JSON.parse(await readFile(cliPackagePath, "utf8"))

const forbiddenScripts = ["preinstall", "install", "postinstall", "preuninstall", "uninstall"]
const presentLifecycle = forbiddenScripts.filter((name) => pkg.scripts?.[name] !== undefined)

if (presentLifecycle.length > 0) {
  console.error(
    `Published package must not declare lifecycle scripts: ${presentLifecycle.join(", ")}`,
  )
  process.exitCode = 1
}

if (!Array.isArray(pkg.files) || pkg.files.length === 0) {
  console.error("Published package must declare a files allowlist.")
  process.exitCode = 1
}

if (pkg.bin?.effectgrade !== "./dist/bin.js") {
  console.error('Published package must expose bin.effectgrade = "./dist/bin.js".')
  process.exitCode = 1
}

if (process.exitCode === 1) {
  process.exit(1)
}

const staging = await mkdtemp(path.join(tmpdir(), "effectgrade-pack-"))

try {
  execFileSync(
    "pnpm",
    ["--filter", "@cardotrejos/effectgrade", "pack", "--pack-destination", staging],
    {
      cwd: root,
      stdio: "pipe",
    },
  )

  const archives = (await readdir(staging)).filter((name) => name.endsWith(".tgz"))
  const archive = archives[0]
  if (archive === undefined) {
    throw new Error("pnpm pack did not produce an archive")
  }

  execFileSync("tar", ["-xzf", archive], { cwd: staging, stdio: "pipe" })
  const packedFiles = execFileSync("tar", ["-tzf", archive], { cwd: staging, encoding: "utf8" })
    .split("\n")
    .filter(Boolean)

  const allowedPrefixes = [
    "package/package.json",
    "package/dist/",
    "package/LICENSE",
    "package/README.md",
  ]
  const unexpected = packedFiles.filter((entry) => {
    if (entry === "package" || entry === "package/") {
      return false
    }
    return !allowedPrefixes.some((prefix) => entry === prefix || entry.startsWith(prefix))
  })

  if (unexpected.length > 0) {
    console.error("Unexpected files in the published archive:")
    for (const entry of unexpected) {
      console.error(`- ${entry}`)
    }
    process.exitCode = 1
  } else {
    console.log(`Package contents: ok (${String(packedFiles.length)} entries)`)
  }
} finally {
  await rm(staging, { recursive: true, force: true })
}
