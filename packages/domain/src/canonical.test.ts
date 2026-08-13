import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { canonicalJson, digestCanonical, omitVolatile, stableSort } from "./canonical.js"

describe("canonicalJson", () => {
  it("sorts object keys recursively", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}')
  })

  it("keeps array order", () => {
    expect(canonicalJson({ items: [2, 1] })).toBe('{"items":[2,1]}')
  })

  it("omits undefined object fields", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}')
  })
})

describe("stableSort", () => {
  it("sorts without mutating the input", () => {
    const input = ["c", "a", "b"]
    expect(stableSort(input, (left, right) => left.localeCompare(right))).toEqual(["a", "b", "c"])
    expect(input).toEqual(["c", "a", "b"])
  })
})

describe("omitVolatile", () => {
  it("drops timestamps and duration from nested objects", () => {
    expect(
      omitVolatile({
        ok: true,
        metadata: {
          startedAt: "2026-08-13T00:00:00.000Z",
          completedAt: "2026-08-13T00:00:01.000Z",
          durationMs: 1000,
          toolVersion: "0.0.0",
        },
      }),
    ).toEqual({
      ok: true,
      metadata: { toolVersion: "0.0.0" },
    })
  })
})

describe("digestCanonical", () => {
  it("hashes the canonical form as sha256", async () => {
    const digest = await Effect.runPromise(digestCanonical({ b: 2, a: 1 }))
    expect(digest).toBe("sha256:43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777")
  })

  it("ignores key order and volatile fields", async () => {
    const left = await Effect.runPromise(
      digestCanonical({
        b: 1,
        a: 2,
        metadata: { startedAt: "t1", durationMs: 1, toolVersion: "0.0.0" },
      }),
    )
    const right = await Effect.runPromise(
      digestCanonical({
        a: 2,
        b: 1,
        metadata: { startedAt: "t2", durationMs: 9, toolVersion: "0.0.0" },
      }),
    )
    expect(left).toBe(right)
  })
})
