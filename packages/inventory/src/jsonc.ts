const stripComments = (text: string): string => {
  let output = ""
  let index = 0
  let inString = false
  let escaped = false
  let inLineComment = false
  let inBlockComment = false

  while (index < text.length) {
    const char = text[index] ?? ""
    const next = text[index + 1] ?? ""

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false
        output += char
      }
      index += 1
      continue
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false
        index += 2
        continue
      }
      index += 1
      continue
    }

    if (inString) {
      output += char
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      index += 1
      continue
    }

    if (char === '"') {
      inString = true
      output += char
      index += 1
      continue
    }

    if (char === "/" && next === "/") {
      inLineComment = true
      index += 2
      continue
    }

    if (char === "/" && next === "*") {
      inBlockComment = true
      index += 2
      continue
    }

    output += char
    index += 1
  }

  return output
}

const stripTrailingCommas = (text: string): string => {
  let output = ""
  let inString = false
  let escaped = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? ""
    if (inString) {
      output += char
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      output += char
      continue
    }

    if (char === ",") {
      let look = index + 1
      while (look < text.length && /\s/.test(text[look] ?? "")) {
        look += 1
      }
      if (text[look] === "}" || text[look] === "]") {
        continue
      }
    }

    output += char
  }

  return output
}

export const parseJsonc = (text: string): unknown =>
  JSON.parse(stripTrailingCommas(stripComments(text)))
