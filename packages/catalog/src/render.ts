import type { CapabilityMetadata, CompatibilityProfile } from "@effectgrade/domain"

const label = (name: string, value: string): string => `  ${name.padEnd(18)}${value}`

export const renderCatalogList = (
  capabilities: ReadonlyArray<CapabilityMetadata>,
  profiles: ReadonlyArray<CompatibilityProfile>,
): string => {
  const lines = ["Capabilities"]
  for (const capability of capabilities) {
    lines.push(
      `  ${capability.id.padEnd(16)}${capability.version.padEnd(8)}${capability.stability.padEnd(12)}${capability.category}`,
    )
  }
  lines.push("", "Profiles")
  for (const profile of profiles) {
    lines.push(
      `  ${profile.id}  ${profile.channel}  ${profile.lifecycle}  ${profile.effect.version}`,
    )
  }
  return `${lines.join("\n")}\n`
}

export const renderCapability = (capability: CapabilityMetadata): string =>
  [
    `${capability.id} ${capability.version}`,
    label("Title", capability.title),
    label("Category", capability.category),
    label("Stability", capability.stability),
    label("Requires", capability.requires.length === 0 ? "none" : capability.requires.join(", ")),
    label("Targets", capability.supportedTargets.join(", ")),
    label("Packages", capability.packageRequirements.join(", ")),
    "",
    capability.description,
    "",
  ].join("\n")

export const renderProfile = (profile: CompatibilityProfile): string => {
  const packages = Object.entries(profile.packageVersions)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([name, rule]) => {
      if ("prefer" in rule) {
        return `${name}@${rule.prefer}`
      }
      if ("version" in rule) {
        return `${name}@${rule.version}`
      }
      return `${name} forbidden`
    })

  return [
    profile.id,
    label("Version", profile.version),
    label("Digest", profile.digest),
    label("Lifecycle", profile.lifecycle),
    label("Effect", profile.effect.version),
    label("Runtime", profile.runtime),
    label("Package manager", profile.packageManager),
    label("TypeScript", profile.typescript.tested),
    label("Capabilities", Object.keys(profile.capabilityVersions).join(", ") || "none"),
    label("Packages", packages.join(", ")),
    ...(profile.notes === undefined ? [] : ["", profile.notes]),
    "",
  ].join("\n")
}
