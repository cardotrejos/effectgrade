import { Result } from "effect"
import { decodeDiagnostic, type Diagnostic } from "@effectgrade/domain"
import ts from "typescript"

export type SourceEditResult =
  | { readonly status: "unchanged"; readonly text: string }
  | { readonly status: "changed"; readonly text: string }
  | { readonly status: "conflict"; readonly diagnostic: Diagnostic }

const parse = (text: string): ts.SourceFile =>
  ts.createSourceFile("file.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

const newlineOf = (text: string): string => (text.includes("\r\n") ? "\r\n" : "\n")

const applyEdit = (text: string, start: number, end: number, insertion: string): string =>
  `${text.slice(0, start)}${insertion}${text.slice(end)}`

const conflict = (detail: string): SourceEditResult => ({
  status: "conflict",
  diagnostic: Result.getOrThrow(
    decodeDiagnostic({
      code: "EG3402",
      title: "TypeScript edit conflict",
      detail,
      severity: "error",
    }),
  ),
})

const namedImportsOf = (declaration: ts.ImportDeclaration): ReadonlyArray<string> => {
  const bindings = declaration.importClause?.namedBindings
  if (bindings === undefined || !ts.isNamedImports(bindings)) {
    return []
  }
  return bindings.elements.map((element) => element.name.text)
}

export const addNamedImport = (
  text: string,
  input: { readonly moduleSpecifier: string; readonly name: string },
): SourceEditResult => {
  const source = parse(text)
  const imports = source.statements.filter(ts.isImportDeclaration)
  const existing = imports.find(
    (declaration) =>
      ts.isStringLiteral(declaration.moduleSpecifier) &&
      declaration.moduleSpecifier.text === input.moduleSpecifier,
  )

  if (existing !== undefined) {
    if (namedImportsOf(existing).includes(input.name)) {
      return { status: "unchanged", text }
    }
    const bindings = existing.importClause?.namedBindings
    if (bindings !== undefined && ts.isNamedImports(bindings)) {
      const last = bindings.elements.at(-1)
      if (last !== undefined) {
        return {
          status: "changed",
          text: applyEdit(text, last.end, last.end, `, ${input.name}`),
        }
      }
    }
  }

  const statement = `import { ${input.name} } from "${input.moduleSpecifier}"`
  const lastImport = imports.at(-1)
  const nl = newlineOf(text)
  if (lastImport === undefined) {
    return { status: "changed", text: `${statement}${nl}${text}` }
  }
  return {
    status: "changed",
    text: applyEdit(text, lastImport.end, lastImport.end, `${nl}${statement}`),
  }
}

const stringLiteral = (node: ts.Node): string | undefined =>
  ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : undefined

const identifierOf = (node: ts.Node): string | undefined =>
  ts.isIdentifier(node) ? node.text : undefined

export const registerHonoRoute = (
  text: string,
  input: {
    readonly appIdentifier: string
    readonly mountPath: string
    readonly handlerIdentifier: string
  },
): SourceEditResult => {
  const source = parse(text)
  const nl = newlineOf(text)
  let existing: ts.CallExpression | undefined
  let appStatement: ts.Statement | undefined

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      identifierOf(node.expression.expression) === input.appIdentifier &&
      node.expression.name.text === "route" &&
      stringLiteral(node.arguments[0] ?? node) === input.mountPath
    ) {
      existing = node
    }
    if (
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some((declaration) => {
        const initializer = declaration.initializer
        return (
          ts.isIdentifier(declaration.name) &&
          declaration.name.text === input.appIdentifier &&
          initializer !== undefined &&
          ts.isNewExpression(initializer) &&
          identifierOf(initializer.expression) === "Hono"
        )
      })
    ) {
      appStatement = node
    }
    ts.forEachChild(node, visit)
  }
  visit(source)

  if (existing !== undefined) {
    const handler = existing.arguments[1]
    if (handler !== undefined && identifierOf(handler) === input.handlerIdentifier) {
      return { status: "unchanged", text }
    }
    return conflict(
      `${input.appIdentifier}.route(${JSON.stringify(input.mountPath)}) is already registered.`,
    )
  }

  const call = `${input.appIdentifier}.route(${JSON.stringify(input.mountPath)}, ${input.handlerIdentifier})`
  if (appStatement !== undefined) {
    return {
      status: "changed",
      text: applyEdit(text, appStatement.end, appStatement.end, `${nl}${call}`),
    }
  }

  return conflict(`Could not find ${input.appIdentifier} = new Hono().`)
}
