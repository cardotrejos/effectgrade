import { Effect, Result } from "effect"
import { makeNodeFileSystem } from "@effectgrade/adapters-node"
import {
  cliBinaryName,
  decodeRepoPath,
  engineEffectVersion,
  FileSystem,
  makeCommandEnvelope,
  productName,
  publicPackageName,
  type FileSystemApi,
} from "@effectgrade/domain"
import {
  getCapability,
  getProfile,
  listCapabilities,
  listProfiles,
  renderCapability,
  renderCatalogList,
  renderProfile,
} from "@effectgrade/catalog"
import { inspectInventory, renderPackageGraph } from "@effectgrade/inventory"
import {
  applyOperations,
  applyVerifiedPlan,
  compileHonoAdoptionPlan,
  makeOverlayTree,
  planIdentity,
  renderPlanSummary,
  type PlanOperation,
} from "@effectgrade/transform"

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

const catalogCommand = async (args: ReadonlyArray<string>): Promise<CliResult> => {
  const positionals = args.filter((arg) => !arg.startsWith("-") && arg !== "catalog")
  const kind = positionals[0]
  const id = positionals[1]
  const json = hasFlag(args, "--json")

  if (kind === "capability") {
    if (id === undefined) {
      return {
        exitCode: 2,
        stdout: "",
        stderr: "Usage: effectgrade catalog capability <id>\n",
      }
    }
    const capability = getCapability(id)
    if (capability === undefined) {
      return { exitCode: 2, stdout: "", stderr: `Unknown capability: ${id}\n` }
    }
    if (json) {
      return {
        exitCode: 0,
        stdout: `${JSON.stringify({ command: "catalog", ok: true, result: capability }, null, 2)}\n`,
        stderr: "",
      }
    }
    return { exitCode: 0, stdout: renderCapability(capability), stderr: "" }
  }

  if (kind === "profile") {
    if (id === undefined) {
      return {
        exitCode: 2,
        stdout: "",
        stderr: "Usage: effectgrade catalog profile <id>\n",
      }
    }
    const profile = await Effect.runPromise(getProfile(id))
    if (profile === undefined) {
      return { exitCode: 8, stdout: "", stderr: `Unknown profile: ${id}\n` }
    }
    if (json) {
      return {
        exitCode: 0,
        stdout: `${JSON.stringify({ command: "catalog", ok: true, result: profile }, null, 2)}\n`,
        stderr: "",
      }
    }
    return { exitCode: 0, stdout: renderProfile(profile), stderr: "" }
  }

  if (kind !== undefined) {
    return {
      exitCode: 2,
      stdout: "",
      stderr: `Unknown catalog subject: ${kind}\n`,
    }
  }

  const capabilities = listCapabilities()
  const profiles = await Effect.runPromise(listProfiles())
  if (json) {
    return {
      exitCode: 0,
      stdout: `${JSON.stringify({ command: "catalog", ok: true, result: { capabilities, profiles } }, null, 2)}\n`,
      stderr: "",
    }
  }
  return { exitCode: 0, stdout: renderCatalogList(capabilities, profiles), stderr: "" }
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

const defaultProfileId = "effect-v4-rc108-node22-pnpm-hono-bridge"

const planAddCommand = async (
  args: ReadonlyArray<string>,
  options: RunCliOptions,
): Promise<CliResult> => {
  const capabilities = args.filter((arg) => !arg.startsWith("-") && arg !== "plan" && arg !== "add")
  if (capabilities.length === 0) {
    return {
      exitCode: 2,
      stdout: "",
      stderr: "Usage: effectgrade plan add <capability> [capability...]\n",
    }
  }

  const fileSystem = options.fileSystem ?? makeNodeFileSystem(process.cwd())
  const inventory = await Effect.runPromise(
    Effect.provideService(inspectInventory(), FileSystem, fileSystem),
  )
  const profileId = optionValue(args, "--profile") ?? defaultProfileId
  const plan = await Effect.runPromise(
    compileHonoAdoptionPlan({
      inventory,
      profileId,
      capabilities,
    }),
  )
  const id = await Effect.runPromise(planIdentity({ profileId, capabilities, plan }))
  const tree = makeOverlayTree(fileSystem)
  await Effect.runPromise(applyOperations(tree, plan.operations))
  const target =
    optionValue(args, "--target") ??
    inventory.targets.find((item) => item.kind === "server")?.root ??
    "."
  const summary = renderPlanSummary({
    id,
    profileId,
    target,
    files: tree.changes(),
  })

  const planPath = Result.getOrThrow(
    decodeRepoPath(`.effectgrade/plans/${id.slice("sha256:".length)}.json`),
  )
  await Effect.runPromise(
    fileSystem.writeFile(
      planPath,
      `${JSON.stringify({ id, profileId, capabilities, operations: plan.operations }, null, 2)}\n`,
    ),
  )

  if (hasFlag(args, "--json")) {
    return {
      exitCode: plan.diagnostics.some((item) => item.severity === "error") ? 4 : 0,
      stdout: `${JSON.stringify({ command: "plan", ok: true, result: { id, profileId, operations: plan.operations } }, null, 2)}\n`,
      stderr: "",
    }
  }

  return {
    exitCode: plan.diagnostics.some((item) => item.severity === "error") ? 4 : 0,
    stdout: summary,
    stderr: "",
  }
}

const loadLatestPlan = async (
  fileSystem: FileSystemApi,
): Promise<
  { readonly id: string; readonly operations: ReadonlyArray<PlanOperation> } | undefined
> => {
  const children = await Effect.runPromise(
    fileSystem
      .list(Result.getOrThrow(decodeRepoPath(".effectgrade/plans")))
      .pipe(Effect.orElseSucceed(() => [] as const)),
  )
  const latest = [...children].toSorted().at(-1)
  if (latest === undefined) {
    return undefined
  }
  const raw = await Effect.runPromise(fileSystem.readFile(latest))
  return JSON.parse(raw) as {
    readonly id: string
    readonly operations: ReadonlyArray<PlanOperation>
  }
}

const applyCommand = async (
  args: ReadonlyArray<string>,
  options: RunCliOptions,
): Promise<CliResult> => {
  const fileSystem = options.fileSystem ?? makeNodeFileSystem(process.cwd())
  const plan = await loadLatestPlan(fileSystem)
  if (plan === undefined) {
    return { exitCode: 2, stdout: "", stderr: "No saved plan. Run `effectgrade plan add` first.\n" }
  }
  const result = await Effect.runPromise(applyVerifiedPlan(fileSystem, plan.operations))
  const exitCode = result.diagnostics.length > 0 ? 6 : 0
  const summary = result.noop
    ? "Apply is a no-op; the verified plan is already present.\n"
    : result.applied
      ? `Applied ${String(result.files.length)} file(s).\n${result.files.map((file) => `  ${file.kind} ${file.path}`).join("\n")}\n`
      : `${result.diagnostics.map((item) => `${item.code} ${item.title}`).join("\n")}\n`

  if (hasFlag(args, "--json")) {
    return {
      exitCode,
      stdout: `${JSON.stringify({ command: "apply", ok: exitCode === 0, result }, null, 2)}\n`,
      stderr: "",
    }
  }
  return { exitCode, stdout: summary, stderr: "" }
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

  if (command === "plan") {
    const action = args.filter((arg) => !arg.startsWith("-") && arg !== "plan")[0]
    if (action === "add") {
      return planAddCommand(args, options)
    }
  }

  if (command === "catalog") {
    return catalogCommand(args)
  }

  if (command === "apply") {
    return applyCommand(args, options)
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
