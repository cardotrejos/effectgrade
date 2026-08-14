import { Effect, Result } from "effect"
import {
  configFileName,
  decodeRepoPath,
  lockFileName,
  type FileSystemApi,
  type FileSystemError,
  type RepoPath,
} from "@effectgrade/domain"
import { parseJsonc } from "@effectgrade/inventory"

export type StatusCategory = "clean" | "drifted" | "unmanaged"

export type StatusReport = {
  readonly category: StatusCategory
  readonly detail: string
  readonly profileId?: string
  readonly capabilities: ReadonlyArray<string>
}

export const projectDesiredState = (input: {
  readonly profileId: string
  readonly capabilities: ReadonlyArray<string>
}): { readonly profile: string; readonly capabilities: ReadonlyArray<string> } => ({
  profile: input.profileId,
  capabilities: input.capabilities,
})

export const projectLockState = (input: {
  readonly profileId: string
  readonly planId: string
  readonly packages: ReadonlyArray<{ readonly name: string; readonly version: string }>
}): {
  readonly profile: string
  readonly planId: string
  readonly packages: Readonly<Record<string, string>>
} => ({
  profile: input.profileId,
  planId: input.planId,
  packages: Object.fromEntries(input.packages.map((item) => [item.name, item.version])),
})

const asPath = (value: string): RepoPath => Result.getOrThrow(decodeRepoPath(value))

export const writeProjectedState = (
  dest: FileSystemApi,
  input: {
    readonly profileId: string
    readonly capabilities: ReadonlyArray<string>
    readonly planId: string
    readonly packages: ReadonlyArray<{ readonly name: string; readonly version: string }>
  },
): Effect.Effect<void, FileSystemError> =>
  Effect.gen(function* () {
    const config = projectDesiredState(input)
    const lock = projectLockState(input)
    yield* dest.writeFile(asPath(configFileName), `${JSON.stringify(config, null, 2)}\n`)
    yield* dest.writeFile(asPath(lockFileName), `${JSON.stringify(lock, null, 2)}\n`)
  })

const ownedFiles = ["src/effect/AppRuntime.ts", "src/effect/http/routes.ts"] as const

export const statusRepository = (dest: FileSystemApi): Effect.Effect<StatusReport> =>
  Effect.gen(function* () {
    const configText = yield* dest
      .readFile(asPath(configFileName))
      .pipe(Effect.orElseSucceed(() => undefined))
    if (configText === undefined) {
      return {
        category: "unmanaged" as const,
        detail: "No effectgrade.config.jsonc present.",
        capabilities: [],
      }
    }

    let profileId: string | undefined
    let capabilities: ReadonlyArray<string> = []
    try {
      const parsed = parseJsonc(configText)
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>
        profileId = typeof record.profile === "string" ? record.profile : undefined
        capabilities = Array.isArray(record.capabilities)
          ? record.capabilities.filter((item): item is string => typeof item === "string")
          : []
      }
    } catch {
      return {
        category: "drifted" as const,
        detail: "effectgrade.config.jsonc is not valid JSONC.",
        capabilities: [],
      }
    }

    for (const file of ownedFiles) {
      const text = yield* dest.readFile(asPath(file)).pipe(Effect.orElseSucceed(() => undefined))
      if (text === undefined) {
        return {
          category: "drifted" as const,
          detail: `Managed file ${file} is missing.`,
          ...(profileId === undefined ? {} : { profileId }),
          capabilities,
        }
      }
      if (file.endsWith("AppRuntime.ts") && !text.includes("ManagedRuntime")) {
        return {
          category: "drifted" as const,
          detail: `Managed file ${file} no longer matches the Effect runtime boundary.`,
          ...(profileId === undefined ? {} : { profileId }),
          capabilities,
        }
      }
    }

    return {
      category: "clean" as const,
      detail: "Desired and actual EffectGrade state match.",
      ...(profileId === undefined ? {} : { profileId }),
      capabilities,
    }
  }).pipe(Effect.orDie)
