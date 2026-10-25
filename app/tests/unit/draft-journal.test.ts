import { describe, expect, it } from 'vitest'
import {
  DRAFT_PREFIX,
  browserDraftStorage,
  clearDraft,
  draftKey,
  draftIsNewer,
  readDraft,
  writeDraft,
  type DraftStorage
} from '../../src/renderer/persistence/draft-journal'

/** In-memory localStorage stand-in that can also simulate a full disk. */
function memoryStorage(options: { failWrites?: boolean } = {}): DraftStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      if (options.failWrites) throw new Error('QuotaExceededError')
      data.set(key, value)
    },
    removeItem: (key) => data.delete(key)
  }
}

const BASE = '2026-10-25T10:00:00.000Z'

describe('draft journal', () => {
  it('stores a clip patch and reads it back', () => {
    const storage = memoryStorage()
    expect(writeDraft(storage, 'clip-1', { patch: { title: 'Hello' }, baseUpdatedAt: BASE })).toBe(true)
    const draft = readDraft(storage, 'clip-1')
    expect(draft?.patch).toEqual({ title: 'Hello' })
    expect(draft?.baseUpdatedAt).toBe(BASE)
    expect(storage.data.has(draftKey('clip-1'))).toBe(true)
  })

  it('merges edits made inside the debounce window instead of queuing records', () => {
    const storage = memoryStorage()
    writeDraft(storage, 'clip-1', { patch: { title: 'A' }, baseUpdatedAt: BASE })
    writeDraft(storage, 'clip-1', { patch: { zoom: 1.4 }, baseUpdatedAt: 'ignored' })
    writeDraft(storage, 'clip-1', { patch: { title: 'ABC' }, baseUpdatedAt: BASE })
    const draft = readDraft(storage, 'clip-1')
    expect(draft?.patch).toEqual({ title: 'ABC', zoom: 1.4 })
    // The first base timestamp wins: it describes what the draft started from.
    expect(draft?.baseUpdatedAt).toBe(BASE)
    expect(storage.data.size).toBe(1)
  })

  it('keeps a timeline document alongside the patch', () => {
    const storage = memoryStorage()
    const timeline = { tracks: [], items: [], snapEnabled: true }
    writeDraft(storage, 'clip-1', { patch: { title: 'x' }, timeline, baseUpdatedAt: BASE })
    expect(readDraft(storage, 'clip-1')?.timeline).toEqual(timeline)
  })

  it('clears the entry after a successful save', () => {
    const storage = memoryStorage()
    writeDraft(storage, 'clip-1', { patch: { title: 'x' }, baseUpdatedAt: BASE })
    clearDraft(storage, 'clip-1')
    expect(readDraft(storage, 'clip-1')).toBeNull()
    expect(storage.data.size).toBe(0)
  })

  it('drops corrupt entries instead of throwing', () => {
    const storage = memoryStorage()
    storage.data.set(draftKey('clip-1'), '{not json')
    expect(readDraft(storage, 'clip-1')).toBeNull()
    expect(storage.data.has(draftKey('clip-1'))).toBe(false)
  })

  it('ignores records from another version or another clip', () => {
    const storage = memoryStorage()
    storage.data.set(draftKey('clip-1'), JSON.stringify({ version: 99, clipId: 'clip-1', patch: {}, savedAt: BASE, baseUpdatedAt: BASE }))
    expect(readDraft(storage, 'clip-1')).toBeNull()
    storage.data.set(draftKey('clip-1'), JSON.stringify({ version: 1, clipId: 'clip-2', patch: {}, savedAt: BASE, baseUpdatedAt: BASE }))
    expect(readDraft(storage, 'clip-1')).toBeNull()
  })

  it('drops the timeline before giving up on an oversized record', () => {
    const storage = memoryStorage()
    const hugeTimeline = { tracks: [], items: [], blob: 'x'.repeat(600 * 1024) }
    const kept = writeDraft(storage, 'clip-1', { patch: { title: 'still here' }, timeline: hugeTimeline, baseUpdatedAt: BASE })
    expect(kept).toBe(true)
    const draft = readDraft(storage, 'clip-1')
    expect(draft?.patch).toEqual({ title: 'still here' })
    expect(draft?.timeline).toBeUndefined()
  })

  it('reports a refused write without throwing', () => {
    const storage = memoryStorage({ failWrites: true })
    expect(writeDraft(storage, 'clip-1', { patch: { title: 'x' }, baseUpdatedAt: BASE })).toBe(false)
    expect(readDraft(storage, 'clip-1')).toBeNull()
  })

  it('only offers a draft that is newer than the saved clip', () => {
    const storage = memoryStorage()
    writeDraft(storage, 'clip-1', { patch: { title: 'x' }, baseUpdatedAt: BASE })
    const draft = readDraft(storage, 'clip-1')!
    expect(draftIsNewer(draft, '2026-10-25T09:00:00.000Z')).toBe(true)
    expect(draftIsNewer(draft, new Date(Date.now() + 60_000).toISOString())).toBe(false)
    expect(draftIsNewer(draft, null)).toBe(true)
    expect(draftIsNewer({ ...draft, savedAt: 'not a date' }, BASE)).toBe(false)
  })

  it('uses one namespaced key per clip', () => {
    expect(draftKey('abc')).toBe(`${DRAFT_PREFIX}abc`)
  })

  it('has no storage outside a browser and does not throw', () => {
    expect(browserDraftStorage()).toBeNull()
  })
})
