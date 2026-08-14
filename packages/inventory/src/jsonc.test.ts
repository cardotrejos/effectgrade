import { describe, expect, it } from "vitest"

import { parseJsonc } from "./jsonc.js"

describe("parseJsonc", () => {
  it("parses comments and trailing commas", () => {
    expect(
      parseJsonc(`
{
  // compiler
  "strict": true,
  "paths": {
    "@/*": ["./src/*"],
  },
}
`),
    ).toEqual({
      strict: true,
      paths: { "@/*": ["./src/*"] },
    })
  })

  it("does not treat comment markers inside strings as comments", () => {
    expect(parseJsonc(`{ "url": "https://example.com/path" }`)).toEqual({
      url: "https://example.com/path",
    })
    expect(parseJsonc(`{ "note": "use /* not */ here" }`)).toEqual({
      note: "use /* not */ here",
    })
  })
})
