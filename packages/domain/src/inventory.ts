import { Schema } from "effect"

import { Diagnostic } from "./diagnostic.js"
import { TargetId } from "./ids.js"
import { RepoPath } from "./path.js"

export const Confidence = Schema.Literals(["certain", "high", "medium", "low"]).annotate({
  identifier: "Confidence",
})
export type Confidence = typeof Confidence.Type

export const PackageManager = Schema.Literals(["npm", "pnpm", "yarn", "bun"]).annotate({
  identifier: "PackageManager",
})
export type PackageManager = typeof PackageManager.Type

export const WorkspaceTool = Schema.Literals([
  "npm",
  "pnpm",
  "yarn",
  "turbo",
  "nx",
  "rush",
  "lerna",
]).annotate({
  identifier: "WorkspaceTool",
})
export type WorkspaceTool = typeof WorkspaceTool.Type

export const RepositoryKind = Schema.Literals(["single-package", "workspace"]).annotate({
  identifier: "RepositoryKind",
})
export type RepositoryKind = typeof RepositoryKind.Type

export const TargetKind = Schema.Literals([
  "server",
  "web",
  "library",
  "cli",
  "worker",
  "unknown",
]).annotate({
  identifier: "TargetKind",
})
export type TargetKind = typeof TargetKind.Type

export const RuntimeKind = Schema.Literals([
  "node",
  "bun",
  "cloudflare-workers",
  "deno",
  "browser",
  "react-native",
  "unknown",
]).annotate({
  identifier: "RuntimeKind",
})
export type RuntimeKind = typeof RuntimeKind.Type

export const EvidenceKind = Schema.Literals([
  "file",
  "field",
  "lockfile",
  "source",
  "workspace-config",
]).annotate({
  identifier: "EvidenceKind",
})
export type EvidenceKind = typeof EvidenceKind.Type

export const EvidenceRef = Schema.Struct({
  kind: EvidenceKind,
  path: RepoPath,
  detail: Schema.optionalKey(Schema.String),
})
export type EvidenceRef = typeof EvidenceRef.Type

export const DetectedValue = <S extends Schema.Top>(value: S) =>
  Schema.Struct({
    value: Schema.optionalKey(value),
    confidence: Confidence,
    evidence: Schema.Array(EvidenceRef),
    alternatives: Schema.Array(value),
  })

export const DetectedPackageManager = DetectedValue(PackageManager)
export type DetectedPackageManager = typeof DetectedPackageManager.Type

export const DetectedWorkspaceTool = DetectedValue(WorkspaceTool)
export type DetectedWorkspaceTool = typeof DetectedWorkspaceTool.Type

export const DetectedRuntime = DetectedValue(RuntimeKind)
export type DetectedRuntime = typeof DetectedRuntime.Type

export const DetectedFramework = Schema.Struct({
  id: Schema.String,
  version: Schema.optionalKey(Schema.String),
  confidence: Confidence,
  entrypoints: Schema.Array(RepoPath),
  identifiers: Schema.Array(Schema.String),
  evidence: Schema.Array(EvidenceRef),
  supportedTransformations: Schema.Array(Schema.String),
})
export type DetectedFramework = typeof DetectedFramework.Type

export const PackageInventory = Schema.Struct({
  name: Schema.optionalKey(Schema.String),
  root: RepoPath,
  private: Schema.Boolean,
  workspaceDependencies: Schema.Array(Schema.String),
  scripts: Schema.Record(Schema.String, Schema.String),
})
export type PackageInventory = typeof PackageInventory.Type

export const TargetInventory = Schema.Struct({
  id: TargetId,
  root: RepoPath,
  packageName: Schema.optionalKey(Schema.String),
  kind: TargetKind,
  runtime: DetectedRuntime,
  frameworks: Schema.Array(DetectedFramework),
  entrypoints: Schema.Array(RepoPath),
  scripts: Schema.Record(Schema.String, Schema.String),
  tsconfig: Schema.optionalKey(RepoPath),
})
export type TargetInventory = typeof TargetInventory.Type

export const TypeScriptConfigInventory = Schema.Struct({
  path: RepoPath,
  extends: Schema.optionalKey(Schema.String),
  module: Schema.optionalKey(Schema.String),
  moduleResolution: Schema.optionalKey(Schema.String),
  strict: Schema.optionalKey(Schema.Boolean),
  jsx: Schema.optionalKey(Schema.String),
  experimentalDecorators: Schema.optionalKey(Schema.Boolean),
  paths: Schema.optionalKey(Schema.Record(Schema.String, Schema.Array(Schema.String))),
  references: Schema.Array(Schema.String),
  composite: Schema.optionalKey(Schema.Boolean),
  include: Schema.Array(Schema.String),
  exclude: Schema.Array(Schema.String),
  plugins: Schema.Array(Schema.String),
  effectLanguageService: Schema.Boolean,
})
export type TypeScriptConfigInventory = typeof TypeScriptConfigInventory.Type

export const TypeScriptInventory = Schema.Struct({
  version: Schema.optionalKey(Schema.String),
  configs: Schema.Array(TypeScriptConfigInventory),
})
export type TypeScriptInventory = typeof TypeScriptInventory.Type

export const PackageGraphInventory = Schema.Struct({
  root: RepoPath,
  repositoryKind: RepositoryKind,
  packageManager: DetectedPackageManager,
  workspaceTool: Schema.optionalKey(DetectedWorkspaceTool),
  packages: Schema.Array(PackageInventory),
  targets: Schema.Array(TargetInventory),
  typescript: Schema.optionalKey(TypeScriptInventory),
  diagnostics: Schema.Array(Diagnostic),
})
export type PackageGraphInventory = typeof PackageGraphInventory.Type

export const decodePackageManager = Schema.decodeUnknownResult(PackageManager)
export const decodeWorkspaceTool = Schema.decodeUnknownResult(WorkspaceTool)
export const decodePackageGraphInventory = Schema.decodeUnknownResult(PackageGraphInventory)
