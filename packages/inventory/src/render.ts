import { canonicalJson, type PackageGraphInventory } from "@effectgrade/domain"

const label = (name: string, value: string): string => `  ${name.padEnd(18)}${value}`

const workspaceLabel = (inventory: PackageGraphInventory): string => {
  if (inventory.repositoryKind === "single-package") {
    return "single package"
  }
  const tool = inventory.workspaceTool?.value
  const base =
    tool === "pnpm" || tool === "npm" || tool === "yarn" ? `${tool} workspace` : "workspace"
  const turbo =
    inventory.workspaceTool?.evidence.some((item) => item.path === "turbo.json") === true
  return turbo ? `${base} (turbo)` : base
}

export const renderPackageGraph = (inventory: PackageGraphInventory): string => {
  const lines = [
    "Repository",
    label("Root", inventory.root),
    label("Package manager", inventory.packageManager.value ?? "unknown"),
    label("Workspace", workspaceLabel(inventory)),
  ]

  if (inventory.typescript?.version !== undefined) {
    lines.push(label("TypeScript", inventory.typescript.version))
  }

  const primary =
    inventory.targets.find((target) => target.kind === "server") ?? inventory.targets[0]
  if (primary?.runtime.value !== undefined) {
    lines.push(label("Runtime", primary.runtime.value))
  }
  const framework = primary?.frameworks[0]
  if (framework !== undefined) {
    lines.push(label("Framework", framework.id === "hono" ? "Hono" : framework.id))
  }
  if (primary?.entrypoints[0] !== undefined) {
    lines.push(label("Entry point", primary.entrypoints[0]))
  }

  if (inventory.effect !== undefined) {
    if (!inventory.effect.present) {
      lines.push(label("Effect", "not installed"))
    } else {
      const core = inventory.effect.versions.find((item) => item.name === "effect")
      lines.push(label("Effect", core?.version ?? inventory.effect.channel))
    }
  }

  if (inventory.packages.length > 0) {
    lines.push("", "Packages")
    for (const pkg of inventory.packages) {
      lines.push(label(pkg.root, pkg.name ?? "(unnamed)"))
    }
  }

  if (inventory.targets.length > 0) {
    lines.push("", "Targets")
    for (const target of inventory.targets) {
      lines.push(`  ${target.root}`)
      lines.push(label("kind", target.kind))
      if (target.packageName !== undefined) {
        lines.push(label("package", target.packageName))
      }
    }
  }

  const errors = inventory.diagnostics.filter((item) => item.severity === "error")
  const warnings = inventory.diagnostics.filter((item) => item.severity === "warning")

  if (errors.length > 0) {
    lines.push("", "Errors")
    for (const item of errors) {
      lines.push(`  - ${item.code} ${item.title}`)
    }
  }

  if (warnings.length > 0) {
    lines.push("", "Warnings")
    for (const item of warnings) {
      lines.push(`  - ${item.code} ${item.title}`)
    }
  }

  return `${lines.join("\n")}\n`
}

export const renderPackageGraphJson = (inventory: PackageGraphInventory): string =>
  `${canonicalJson(inventory)}\n`
