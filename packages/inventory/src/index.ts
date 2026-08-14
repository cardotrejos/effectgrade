export {
  defaultExcludedNames,
  defaultExcludedPrefixes,
  isDefaultExcluded,
  isGitIgnored,
  parseGitignore,
} from "./ignore.js"
export { detectHono } from "./hono.js"
export type { HonoDetection, HonoDetectionInput, HonoSourceFile } from "./hono.js"
export { inspectInventory } from "./inspect.js"
export { parseJsonc } from "./jsonc.js"
export {
  lockfileManager,
  parsePackageManagerField,
  rankPackageManagerSignals,
} from "./package-manager.js"
export type { PackageManagerSignal, RankedPackageManager } from "./package-manager.js"
export { renderPackageGraph, renderPackageGraphJson } from "./render.js"
export { inspectTypeScript } from "./typescript.js"
export type { TypeScriptInspection } from "./typescript.js"
export { defaultWalkLimits, isBinary, walk, walkCacheKey } from "./walk.js"
export type { WalkEntry, WalkLimits, WalkResult } from "./walk.js"
export {
  inspectPackageGraph,
  isWorkspaceMember,
  matchWorkspaceGlob,
  parsePnpmWorkspacePackages,
} from "./workspace.js"
