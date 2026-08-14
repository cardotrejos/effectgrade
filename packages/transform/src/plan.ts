import { Effect, Result } from "effect"
import { resolveCapabilities, type Resolution } from "@effectgrade/catalog"
import {
  decodeRepoPath,
  type Diagnostic,
  type FileSystemError,
  type PackageGraphInventory,
  type RepoPath,
} from "@effectgrade/domain"

import { upsertPackageDependency } from "./package-ops.js"
import type { OverlayTree } from "./tree.js"
import { addNamedImport, registerHonoRoute } from "./typescript-ops.js"

export type PlanOperation =
  | {
      readonly kind: "upsert-package-dependency"
      readonly path: RepoPath
      readonly name: string
      readonly version: string
      readonly section: "dependencies" | "devDependencies"
    }
  | {
      readonly kind: "write-owned-file"
      readonly path: RepoPath
      readonly contents: string
    }
  | {
      readonly kind: "add-named-import"
      readonly path: RepoPath
      readonly moduleSpecifier: string
      readonly name: string
    }
  | {
      readonly kind: "register-hono-route"
      readonly path: RepoPath
      readonly appIdentifier: string
      readonly mountPath: string
      readonly handlerIdentifier: string
    }

export type CapabilityPlan = {
  readonly resolution: Resolution
  readonly operations: ReadonlyArray<PlanOperation>
  readonly diagnostics: ReadonlyArray<Diagnostic>
}

const asPath = (value: string): RepoPath => Result.getOrThrow(decodeRepoPath(value))

const isGeneratedEffectModule = (filePath: string): boolean => /(^|\/)src\/effect\//.test(filePath)

const joinRepo = (root: string, relative: string): RepoPath =>
  asPath(root === "." ? relative : `${root}/${relative}`)

const appRuntimeSource = `import { Layer, ManagedRuntime } from "effect"

export const AppLayer = Layer.empty

export const AppRuntime = ManagedRuntime.make(AppLayer)
`

const barrelSource = `export * from "./AppRuntime.js"
export * from "./http/routes.js"
`

const healthSource = `import { Effect } from "effect"

export const health = Effect.succeed({ ok: true as const })
`

const routesSource = `import { Effect } from "effect"
import { Hono } from "hono"

import { health } from "./handlers/health.js"

export const effectRoutes = new Hono()

effectRoutes.get("/health", async (context) => {
  const body = await Effect.runPromise(health)
  return context.json(body)
})
`

export const compileHonoAdoptionPlan = (input: {
  readonly inventory: PackageGraphInventory
  readonly profileId: string
  readonly capabilities: ReadonlyArray<string>
}): Effect.Effect<CapabilityPlan> =>
  Effect.gen(function* () {
    const resolution = yield* resolveCapabilities({
      profileId: input.profileId,
      capabilities: input.capabilities,
    })

    const target =
      input.inventory.targets.find((item) => item.kind === "server") ?? input.inventory.targets[0]
    const root = target?.root ?? "."
    const manifest = joinRepo(root, "package.json")
    const effectDir = "src/effect"
    const entry =
      target?.entrypoints.find((item) => !isGeneratedEffectModule(item)) ??
      joinRepo(root, "src/index.ts")
    const appIdentifier =
      target?.frameworks[0]?.identifiers.find((name) => name !== "effectRoutes") ?? "app"
    const selected = new Set<string>(resolution.capabilities.map((capability) => capability.id))
    const operations: Array<PlanOperation> = []

    for (const pkg of resolution.packages) {
      operations.push({
        kind: "upsert-package-dependency",
        path: manifest,
        name: pkg.name,
        version: pkg.version,
        section: pkg.section,
      })
    }

    if (selected.has("core")) {
      operations.push(
        {
          kind: "write-owned-file",
          path: joinRepo(root, `${effectDir}/AppRuntime.ts`),
          contents: appRuntimeSource,
        },
        {
          kind: "write-owned-file",
          path: joinRepo(root, `${effectDir}/index.ts`),
          contents: selected.has("hono-bridge")
            ? barrelSource
            : `export * from "./AppRuntime.js"\n`,
        },
      )
    }

    if (selected.has("hono-bridge")) {
      operations.push(
        {
          kind: "write-owned-file",
          path: joinRepo(root, `${effectDir}/http/handlers/health.ts`),
          contents: healthSource,
        },
        {
          kind: "write-owned-file",
          path: joinRepo(root, `${effectDir}/http/routes.ts`),
          contents: routesSource,
        },
        {
          kind: "add-named-import",
          path: entry,
          moduleSpecifier: "./effect/http/routes",
          name: "effectRoutes",
        },
        {
          kind: "register-hono-route",
          path: entry,
          appIdentifier,
          mountPath: "/effect",
          handlerIdentifier: "effectRoutes",
        },
      )
    }

    return {
      resolution,
      operations,
      diagnostics: resolution.diagnostics,
    }
  })

export const applyOperations = (
  tree: OverlayTree,
  operations: ReadonlyArray<PlanOperation>,
): Effect.Effect<void, FileSystemError> =>
  Effect.gen(function* () {
    for (const operation of operations) {
      if (operation.kind === "write-owned-file") {
        const current = yield* tree
          .readFile(operation.path)
          .pipe(Effect.orElseSucceed(() => undefined))
        if (current !== operation.contents) {
          yield* tree.writeFile(operation.path, operation.contents)
        }
        continue
      }

      const current = yield* tree
        .readFile(operation.path)
        .pipe(Effect.orElseSucceed(() => undefined))
      if (current === undefined) {
        continue
      }

      if (operation.kind === "upsert-package-dependency") {
        const edited = upsertPackageDependency({
          text: current,
          name: operation.name,
          version: operation.version,
          section: operation.section,
        })
        if (edited.status === "changed") {
          yield* tree.writeFile(operation.path, edited.text)
        }
        continue
      }

      if (operation.kind === "add-named-import") {
        const edited = addNamedImport(current, {
          moduleSpecifier: operation.moduleSpecifier,
          name: operation.name,
        })
        if (edited.status === "changed") {
          yield* tree.writeFile(operation.path, edited.text)
        }
        continue
      }

      const edited = registerHonoRoute(current, {
        appIdentifier: operation.appIdentifier,
        mountPath: operation.mountPath,
        handlerIdentifier: operation.handlerIdentifier,
      })
      if (edited.status === "changed") {
        yield* tree.writeFile(operation.path, edited.text)
      }
    }
  })
