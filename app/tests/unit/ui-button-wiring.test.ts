import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

const rendererRoot = resolve(process.cwd(), 'src/renderer')
const actionProps = new Set([
  'onClick', 'onKeyDown', 'onPointerDown', 'onPointerUp', 'onDoubleClick',
  'onContextMenu', 'onMouseDown', 'onMouseUp', 'onTouchStart', 'onDragStart'
])

type ButtonRecord = { file: string; line: number; action: boolean; formType: string }

function collectButtons(directory: string): ButtonRecord[] {
  const records: ButtonRecord[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) records.push(...collectButtons(path))
    else if (entry.isFile() && path.endsWith('.tsx')) {
      const text = readFileSync(path, 'utf8')
      const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
      const visit = (node: ts.Node) => {
        if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(source) === 'button') {
          const attributes = node.attributes.properties
          const names = attributes.flatMap((attribute) => ts.isJsxAttribute(attribute) ? [attribute.name.getText(source)] : [])
          const typeAttribute = attributes.find((attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(source) === 'type')
          const formType = typeAttribute && ts.isJsxAttribute(typeAttribute) && typeAttribute.initializer && ts.isStringLiteral(typeAttribute.initializer)
            ? typeAttribute.initializer.text
            : ''
          const action = names.some((name) => actionProps.has(name)) || attributes.some(ts.isJsxSpreadAttribute)
          records.push({
            file: relative(process.cwd(), path),
            line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
            action,
            formType
          })
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
  }
  return records
}

describe('renderer button wiring audit', () => {
  it('keeps every native JSX button connected to an action or native form behavior', () => {
    const buttons = collectButtons(rendererRoot)
    const unwired = buttons.filter((button) => !button.action && !['submit', 'reset'].includes(button.formType))

    expect(buttons.length).toBeGreaterThan(0)
    expect(unwired).toEqual([])
  })
})
