import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { ipcPayloads } from '../../src/shared/schemas'

const rendererApiPath = resolve(process.cwd(), 'src/renderer/api/client.ts')
const rendererApiSource = readFileSync(rendererApiPath, 'utf8')
const sourceFile = ts.createSourceFile(rendererApiPath, rendererApiSource, ts.ScriptTarget.Latest, true)
const backendPath = resolve(process.cwd(), 'src/main/ipc/backend.ts')
const backendSource = readFileSync(backendPath, 'utf8')
const backendFile = ts.createSourceFile(backendPath, backendSource, ts.ScriptTarget.Latest, true)
const contractMethods = Object.keys(ipcPayloads).sort()

function getBackendMethodKeys(): string[] {
  let handlers: ts.VariableDeclaration | undefined
  const findHandlers = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'handlers') handlers = node
    ts.forEachChild(node, findHandlers)
  }
  findHandlers(backendFile)
  const initializer = handlers?.initializer
  if (!initializer || !ts.isObjectLiteralExpression(initializer)) return []
  return initializer.properties.flatMap((property) => {
    if (!ts.isPropertyAssignment(property)) return []
    const name = property.name
    return ts.isStringLiteral(name) || ts.isIdentifier(name) ? [name.text] : []
  })
}

function getRendererMethodMap(): Map<string, string> {
  const wireFunction = sourceFile.statements.find((statement): statement is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === 'wire'
  )
  const apiStatement = wireFunction?.body?.statements.find((statement): statement is ts.VariableStatement =>
    ts.isVariableStatement(statement) && statement.declarationList.declarations.some((declaration) =>
      ts.isIdentifier(declaration.name) && declaration.name.text === 'api'
    )
  )
  const apiDeclaration = apiStatement?.declarationList.declarations.find((declaration) =>
    ts.isIdentifier(declaration.name) && declaration.name.text === 'api'
  )
  let initializer = apiDeclaration?.initializer
  while (initializer && (ts.isAsExpression(initializer) || ts.isParenthesizedExpression(initializer))) initializer = initializer.expression
  if (!initializer || !ts.isObjectLiteralExpression(initializer)) return new Map()

  return new Map(initializer.properties.flatMap((property) => {
    if (!ts.isPropertyAssignment(property)) return []
    const name = ts.isStringLiteral(property.name) || ts.isIdentifier(property.name) ? property.name.text : null
    const value = property.initializer
    if (!name || !ts.isCallExpression(value) || !ts.isIdentifier(value.expression) || value.expression.text !== 'f') return []
    const method = value.arguments[0]
    return ts.isStringLiteral(method) ? [[name, method.text] as const] : []
  }))
}

const rendererMethodMap = getRendererMethodMap()

describe('renderer API method map', () => {
  it('backend dispatcher implements every IPC payload schema', () => {
    expect(getBackendMethodKeys().sort()).toEqual(contractMethods)
  })

  it('has one renderer entry for every IPC payload schema', () => {
    expect([...rendererMethodMap.keys()].sort()).toEqual(contractMethods)
  })

  it('forwards each entry to the same-named backend method', () => {
    expect([...rendererMethodMap.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
      .toEqual(contractMethods.map((method) => [method, method] as const))
  })
})
