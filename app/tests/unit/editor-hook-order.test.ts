import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/** Static regression guard for the former loading→loaded hook-count crash. */
describe('EditorPage hook order', () => {
  it('declares all component hooks before any conditional early return', () => {
    const file = path.resolve(process.cwd(), 'src/renderer/features/editor/EditorPage.tsx')
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const editorPage = source.statements.find((statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === 'EditorPage'
    )
    expect(editorPage?.body).toBeDefined()
    const hooks: Array<{ name: string; position: number }> = []
    const earlyReturns: number[] = []

    const visit = (node: ts.Node): void => {
      // Hooks in callback bodies and nested helper components have their own
      // rules; only inspect calls owned by EditorPage itself.
      if (ts.isFunctionLike(node)) return
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && /^use[A-Z]/.test(node.expression.text)) {
        hooks.push({ name: node.expression.text, position: node.getStart(source) })
      }
      if (ts.isReturnStatement(node)) {
        for (let parent = node.parent; parent && parent !== editorPage; parent = parent.parent) {
          if (ts.isIfStatement(parent)) {
            earlyReturns.push(node.getStart(source))
            break
          }
        }
      }
      ts.forEachChild(node, visit)
    }

    visit(editorPage!.body!)
    expect(hooks.some((hook) => hook.name === 'useEffect')).toBe(true)
    expect(earlyReturns.length).toBeGreaterThan(0)
    const lastEarlyReturn = Math.max(...earlyReturns)
    expect(hooks.filter((hook) => hook.position > lastEarlyReturn)).toEqual([])
  })
})
