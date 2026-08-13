import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import {
  cliBinaryName,
  configFileName,
  diagnosticPrefix,
  engineEffectVersion,
  lockFileName,
  productName,
  publicPackageName,
  stateDirectoryName,
} from "./index.js"

describe("product identity", () => {
  it("exports the locked brand constants", () => {
    expect(productName).toBe("EffectGrade")
    expect(diagnosticPrefix).toBe("EG")
    expect(engineEffectVersion).toBe("4.0.0-rc.108")
    expect(cliBinaryName).toBe("effectgrade")
    expect(publicPackageName).toBe("@aclabs/effectgrade")
    expect(stateDirectoryName).toBe(".effectgrade")
    expect(configFileName).toBe("effectgrade.config.jsonc")
    expect(lockFileName).toBe("effectgrade.lock.json")
  })

  it("loads the pinned Effect engine", () => {
    expect(Effect.runSync(Effect.succeed(engineEffectVersion))).toBe("4.0.0-rc.108")
  })
})
