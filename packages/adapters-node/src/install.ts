import { readFile } from "node:fs/promises"
import path from "node:path"

import { runProcess, type ProcessRequest, type ProcessResult } from "./process.js"

export type PackageManagerKind = "pnpm" | "npm"

export type InstallMode = "update" | "frozen"

export type InstallResult = {
  readonly command: ReadonlyArray<string>
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
  readonly lockfile?: {
    readonly path: string
    readonly contents: string
    readonly changed: boolean
  }
}

const lockfileName = (manager: PackageManagerKind): string =>
  manager === "pnpm" ? "pnpm-lock.yaml" : "package-lock.json"

export const installCommand = (
  manager: PackageManagerKind,
  mode: InstallMode,
): ReadonlyArray<string> => {
  if (manager === "pnpm") {
    return mode === "frozen"
      ? ["pnpm", "install", "--ignore-scripts", "--frozen-lockfile"]
      : ["pnpm", "install", "--ignore-scripts"]
  }
  return mode === "frozen"
    ? ["npm", "ci", "--ignore-scripts"]
    : ["npm", "install", "--ignore-scripts"]
}

const readLockfile = async (root: string, name: string): Promise<string | undefined> => {
  try {
    return await readFile(path.join(root, name), "utf8")
  } catch {
    return undefined
  }
}

export const installSandboxDependencies = async (input: {
  readonly sandboxRoot: string
  readonly packageManager: PackageManagerKind
  readonly mode: InstallMode
  readonly run?: (request: ProcessRequest) => Promise<ProcessResult>
}): Promise<InstallResult> => {
  const command = installCommand(input.packageManager, input.mode)
  const [binary, ...args] = command
  if (binary === undefined) {
    return { command, exitCode: 1, stdout: "", stderr: "missing package manager" }
  }

  const lockName = lockfileName(input.packageManager)
  const before = await readLockfile(input.sandboxRoot, lockName)
  const run = input.run ?? runProcess
  const result = await run({
    cwd: input.sandboxRoot,
    command: binary,
    args,
  })
  const after = await readLockfile(input.sandboxRoot, lockName)

  return {
    command,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    ...(after === undefined
      ? {}
      : {
          lockfile: {
            path: lockName,
            contents: after,
            changed: after !== before,
          },
        }),
  }
}
