import { Effect } from "effect"
import { makeNodeFileSystem } from "@effectgrade/adapters-node"
import {
  cliBinaryName,
  engineEffectVersion,
  FileSystem,
  makeCommandEnvelope,
  productName,
  publicPackageName,
  type FileSystemApi,
} from "@effectgrade/domain"
import { inspectInventory, renderPackageGraph } from "@effectgrade/inventory"

export const cliVersion = "0.0.0"

export type CliIo = {
  readonly stdout: string
  readonly stderr: string
}

export type CliResult = CliIo & {
  readonly exitCode: number
}

const knownCommands = [
  "inspect",
  "catalog",
  "plan",
  "verify",
  "apply",
  "adopt",
  "status",
  "doctor",
  "upgrade",
  "migrate",
  "schema",
  "mcp",
  "telemetry",
  "version",
  "help",
] as const

type KnownCommand = (typeof knownCommands)[number]

const isKnownCommand = (value: string): value is KnownCommand =>
  (knownCommands as ReadonlyArray<string>).includes(value)

const helpText = `${productName} — verified Effect adoption for existing TypeScript repositories.

Usage:
  ${cliBinaryName} <command> [options]

Commands:
  inspect     Build a static repository inventory
  catalog     List bundled capabilities and profiles
  plan        Create an immutable transformation plan
  verify      Materialize and verify a plan in a sandbox
  apply       Apply a verified plan to the repository
  adopt       Plan, verify, and apply in one flow
  status      Compare desired and actual EffectGrade state
  doctor      Diagnose compatibility and drift
  upgrade     Plan and verify profile or capability upgrades
  migrate     Assess or plan framework and version migrations
  schema      Emit JSON schemas
  mcp         Expose the engine over MCP
  telemetry   View or disable local telemetry
  version     Print version and engine coordinates
  help        Show this help

Global options:
  --json          Write machine-readable output to stdout
  --help, -h      Show help
  --version, -V   Show version

This preview is not another starter template. The first supported path is
adding an Effect runtime boundary to an existing Node + Hono application.

Stability: internal preview. Local verification is not a security sandbox.
`

const versionText = `${productName} ${cliVersion}
package: ${publicPackageName}
engine effect: ${engineEffectVersion}
`

const versionJson = {
  product: productName,
  version: cliVersion,
  package: publicPackageName,
  engineEffect: engineEffectVersion,
}

const hasFlag = (args: ReadonlyArray<string>, ...flags: ReadonlyArray<string>): boolean =>
  args.some((arg) => flags.includes(arg))

const firstPositional = (args: ReadonlyArray<string>): string | undefined =>
  args.find((arg) => !arg.startsWith("-"))

export type RunCliOptions = {
  readonly fileSystem?: FileSystemApi
}

const optionValue = (args: ReadonlyArray<string>, name: string): string | undefined => {
  const index = args.indexOf(name)
  if (index === -1) {
    return undefined
  }
  const value = args[index + 1]
  return value !== undefined && !value.startsWith("-") ? value : undefined
}

const inspectCommand = async (
  args: ReadonlyArray<string>,
  options: RunCliOptions,
): Promise<CliResult> => {
  const started = new Date()
  const fileSystem = options.fileSystem ?? makeNodeFileSystem(process.cwd())
  const inventory = await Effect.runPromise(
    Effect.provideService(inspectInventory(), FileSystem, fileSystem),
  )
  const completed = new Date()
  const errors = inventory.diagnostics.filter((item) => item.severity === "error")
  const warnings = inventory.diagnostics.filter((item) => item.severity === "warning")
  const servers = inventory.targets.filter((target) => target.kind === "server")
  const target = optionValue(args, "--target")
  const ambiguous =
    inventory.diagnostics.some((item) => item.code === "EG1104" || item.code === "EG1003") ||
    (servers.length > 1 && target === undefined)
  const exitCode = errors.length > 0 || ambiguous ? 3 : 0

  if (hasFlag(args, "--json")) {
    const envelope = makeCommandEnvelope({
      command: "inspect",
      result: inventory,
      errors,
      warnings,
      toolVersion: cliVersion,
      startedAt: started.toISOString(),
      completedAt: completed.toISOString(),
      durationMs: completed.getTime() - started.getTime(),
    })
    return { exitCode, stdout: `${JSON.stringify(envelope, null, 2)}\n`, stderr: "" }
  }

  return { exitCode, stdout: renderPackageGraph(inventory), stderr: "" }
}

export const runCli = async (
  args: ReadonlyArray<string>,
  options: RunCliOptions = {},
): Promise<CliResult> => {
  const json = hasFlag(args, "--json")
  const command = firstPositional(args)

  if (hasFlag(args, "--help", "-h") || command === "help" || command === undefined) {
    return { exitCode: 0, stdout: helpText, stderr: "" }
  }

  if (hasFlag(args, "--version", "-V") || command === "version") {
    return {
      exitCode: 0,
      stdout: json ? `${JSON.stringify(versionJson, null, 2)}\n` : versionText,
      stderr: "",
    }
  }

  if (command === "inspect") {
    return inspectCommand(args, options)
  }

  if (command !== undefined && isKnownCommand(command)) {
    const message = `\`${command}\` is not implemented in this preview.\n`
    if (json) {
      return {
        exitCode: 2,
        stdout: `${JSON.stringify({ error: "not_implemented", command }, null, 2)}\n`,
        stderr: "",
      }
    }
    return { exitCode: 2, stdout: "", stderr: message }
  }

  const unknown = command ?? ""
  if (json) {
    return {
      exitCode: 2,
      stdout: `${JSON.stringify({ error: "unknown_command", command: unknown }, null, 2)}\n`,
      stderr: "",
    }
  }

  return {
    exitCode: 2,
    stdout: "",
    stderr: `Unknown command: ${unknown}\nRun \`${cliBinaryName} --help\` for usage.\n`,
  }
}
