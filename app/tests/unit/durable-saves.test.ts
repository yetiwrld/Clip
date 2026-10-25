import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { ipcPayloads } from '../../src/shared/schemas'

/**
 * Data-safety guard.
 *
 * These assertions pin the behaviour that makes "Saved" true: user-data
 * methods must be declared durable, the dispatcher must flush them, and the
 * editor must not claim success before the flush resolves. A refactor that
 * drops any of that should fail here rather than in a user's lost edit.
 */

const root = process.cwd()
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8')
const backendSource = read('src/main/ipc/backend.ts')
const editorSource = read('src/renderer/features/editor/EditorPage.tsx')
const dbSource = read('src/main/services/database/db.ts')

function stringKeysOfObject(source: string, name: string): string[] {
  const file = ts.createSourceFile(`${name}.ts`, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  let found: ts.VariableDeclaration | undefined
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) found = node
    ts.forEachChild(node, visit)
  }
  visit(file)
  if (!found?.initializer || !ts.isObjectLiteralExpression(found.initializer)) return []
  return found.initializer.properties.flatMap((property) =>
    ts.isPropertyAssignment(property) && ts.isStringLiteral(property.name) ? [property.name.text] : []
  )
}

const durableMethods = stringKeysOfObject(backendSource, 'DURABLE_METHODS')
const payloadMethods = Object.keys(ipcPayloads)

describe('durable saves', () => {
  it('declares the user-data methods as durable', () => {
    for (const method of ['clips.update', 'clips.delete', 'clips.restore', 'timeline.save', 'projects.create', 'projects.rename', 'projects.delete', 'settings.update']) {
      expect(durableMethods, `${method} must flush before it resolves`).toContain(method)
    }
  })

  it('only lists methods the dispatcher actually has', () => {
    const handlerKeys = stringKeysOfObject(backendSource, 'handlers')
    expect(handlerKeys.length).toBeGreaterThan(20)
    for (const method of durableMethods) {
      expect(handlerKeys, `${method} is marked durable but has no handler`).toContain(method)
      expect(payloadMethods, `${method} is marked durable but has no schema`).toContain(method)
    }
  })

  it('flushes inside the dispatcher, after the handler', () => {
    const dispatcher = backendSource.slice(backendSource.indexOf('async function invoke'))
    const handlerIndex = dispatcher.indexOf('await handler(')
    const flushIndex = dispatcher.indexOf('flushDurability(ctx, durableAction)')
    expect(handlerIndex).toBeGreaterThan(-1)
    expect(flushIndex).toBeGreaterThan(handlerIndex)
  })

  it('keeps the write pending until the bytes are on disk', () => {
    // Set only after the rename succeeds, and restored on failure, so the next
    // flush retries instead of reporting a file that was never written.
    expect(dbSource).toContain('this.pending = true')
    expect(dbSource).toMatch(/catch \(err\) \{\s*this\.pending = true/s)
    expect(dbSource).toContain('this.persistQueue = write.catch(() => undefined)')
    expect(dbSource).toContain('recoveredFromCorrupt: this.corruptBackup !== null')
  })

  it('clears a journal entry only after a confirmed write', () => {
    const flushIndex = editorSource.indexOf('await flushStorage()')
    expect(flushIndex).toBeGreaterThan(-1)
    expect(editorSource).toContain('clearPendingDraft(targetClipId)')
    // The success state is derived, never set optimistically.
    expect(editorSource).not.toContain("setSaveState('saved')")
    expect(editorSource).toContain('function refreshSaveState')
  })

  it('offers undo for a deleted clip', () => {
    const clipsTab = read('src/renderer/features/project/ClipsTab.tsx')
    expect(clipsTab).toContain("actionLabel: 'Undo'")
    expect(clipsTab).toContain("api['clips.restore']")
    expect(editorSource).toContain('Restore changes')
  })
})
