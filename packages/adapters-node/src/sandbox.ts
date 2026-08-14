import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"

import { Effect } from "effect"
import { digestCanonical, type Digest } from "@effectgrade/domain"
import { isDefaultExcluded } from "@effectgrade/inventory"
import {
  applyOperations,
  flushOverlay,
  makeOverlayTree,
  type PlanOperation,
  type TreeChange,
} from "@effectgrade/transform"

import { makeNodeFileSystem } from "./node-fs.js"

export const sandboxMarkerRel = ".effectgrade/sandbox.json"

export type SandboxMaterialization = {
  readonly sourceDigest: Digest
  readonly sandboxRoot: string
  readonly changes: ReadonlyArray<TreeChange>
}

const toPosix = (value: string): string => value.replaceAll("\\", "/")

const collectFiles = async (
  root: string,
  relative = "",
): Promise<Array<{ readonly path: string; readonly contents: string }>> => {
  const directory = relative.length === 0 ? root : path.join(root, relative)
  const entries = await readdir(directory, { withFileTypes: true })
  const files: Array<{ readonly path: string; readonly contents: string }> = []

  for (const entry of entries.toSorted((left, right) => left.name.localeCompare(right.name))) {
    const child = relative.length === 0 ? entry.name : `${relative}/${entry.name}`
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(root, child)))
      continue
    }
    if (entry.isFile()) {
      files.push({
        path: toPosix(child),
        contents: await readFile(path.join(root, child), "utf8"),
      })
    }
  }

  return files
}

export const digestDirectory = async (root: string): Promise<Digest> => {
  const files = await collectFiles(root)
  return Effect.runPromise(digestCanonical(files))
}

export const copyRepository = async (sourceRoot: string, sandboxRoot: string): Promise<void> => {
  const source = path.resolve(sourceRoot)
  const dest = path.resolve(sandboxRoot)
  await mkdir(dest, { recursive: true })
  await cp(source, dest, {
    recursive: true,
    filter: (current) => {
      if (path.resolve(current) === source) {
        return true
      }
      const relative = toPosix(path.relative(source, current))
      return !isDefaultExcluded(relative)
    },
  })
}

const writeMarker = async (sandboxRoot: string, sourceDigest: Digest): Promise<void> => {
  const marker = path.join(sandboxRoot, sandboxMarkerRel)
  await mkdir(path.dirname(marker), { recursive: true })
  await writeFile(
    marker,
    `${JSON.stringify({ schemaVersion: "1", strategy: "copy", sourceDigest }, null, 2)}\n`,
  )
}

export const cleanupSandbox = async (sandboxRoot: string): Promise<void> => {
  const marker = path.join(sandboxRoot, sandboxMarkerRel)
  try {
    await readFile(marker, "utf8")
  } catch {
    throw new Error(`refusing to delete unmarked directory: ${sandboxRoot}`)
  }
  await rm(sandboxRoot, { recursive: true, force: true })
}

export const materializeCopySandbox = async (input: {
  readonly sourceRoot: string
  readonly sandboxRoot: string
  readonly operations: ReadonlyArray<PlanOperation>
}): Promise<SandboxMaterialization> => {
  const sourceDigest = await digestDirectory(input.sourceRoot)
  await copyRepository(input.sourceRoot, input.sandboxRoot)
  const dest = makeNodeFileSystem(input.sandboxRoot)
  const tree = makeOverlayTree(dest)
  await Effect.runPromise(applyOperations(tree, input.operations))
  await Effect.runPromise(flushOverlay(tree, dest))
  await writeMarker(input.sandboxRoot, sourceDigest)
  return {
    sourceDigest,
    sandboxRoot: input.sandboxRoot,
    changes: tree.changes(),
  }
}
