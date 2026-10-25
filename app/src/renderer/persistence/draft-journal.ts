/**
 * Crash journal for editor edits that are still inside the autosave debounce.
 *
 * The editor writes clip and timeline changes to the backend on a short delay.
 * If the app is killed between the edit and the write — a crashed render, a
 * force quit, a dead battery — those edits only exist in memory. This module
 * keeps a small local copy under a versioned key so the next launch can offer
 * them back instead of losing them.
 *
 * Rules:
 *   - never throw: a full disk, a disabled localStorage or a corrupt entry
 *     must not break editing (the draft is a safety net, not the save path);
 *   - one record per clip, patches merged, so rapid edits cannot pile up;
 *   - bounded size: a record that would exceed the cap drops the timeline
 *     first, then is skipped entirely;
 *   - reads validate the shape and delete records they cannot understand.
 */

export const DRAFT_PREFIX = 'clipwright.draft.v1:'
const MAX_RECORD_BYTES = 512 * 1024

export interface DraftStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface DraftRecord {
  version: 1
  clipId: string
  patch: Record<string, unknown>
  timeline?: unknown
  /** When the draft was last touched. Compared against the clip's updatedAt. */
  savedAt: string
  /** The clip's updatedAt when this draft started, to prove what it is based on. */
  baseUpdatedAt: string
}

export function draftKey(clipId: string): string {
  return `${DRAFT_PREFIX}${clipId}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseRecord(raw: string | null, clipId: string): DraftRecord | null {
  if (!raw) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(value)) return null
  if (value.version !== 1) return null
  if (value.clipId !== clipId) return null
  if (!isRecord(value.patch)) return null
  if (typeof value.savedAt !== 'string' || Number.isNaN(Date.parse(value.savedAt))) return null
  if (typeof value.baseUpdatedAt !== 'string') return null
  return {
    version: 1,
    clipId,
    patch: value.patch,
    ...(value.timeline === undefined ? {} : { timeline: value.timeline }),
    savedAt: value.savedAt,
    baseUpdatedAt: value.baseUpdatedAt
  }
}

/** Read one clip's draft. Corrupt or foreign records are removed, never thrown. */
export function readDraft(storage: DraftStorage, clipId: string): DraftRecord | null {
  let raw: string | null = null
  try {
    raw = storage.getItem(draftKey(clipId))
  } catch {
    return null
  }
  if (!raw) return null
  const record = parseRecord(raw, clipId)
  if (!record) {
    clearDraft(storage, clipId)
    return null
  }
  return record
}

export interface DraftInput {
  patch?: Record<string, unknown>
  timeline?: unknown
  baseUpdatedAt: string
}

/**
 * Merge the supplied changes into the stored draft. Returns false when the
 * draft could not be kept (too large or storage refused it); the caller keeps
 * saving normally either way.
 */
export function writeDraft(storage: DraftStorage, clipId: string, input: DraftInput): boolean {
  const existing = readDraft(storage, clipId)
  const patch: Record<string, unknown> = { ...(existing?.patch ?? {}) }
  for (const [key, value] of Object.entries(input.patch ?? {})) {
    if (value === undefined) continue
    patch[key] = value
  }
  const timeline = input.timeline === undefined ? existing?.timeline : input.timeline
  const base: DraftRecord = {
    version: 1,
    clipId,
    patch,
    ...(timeline === undefined ? {} : { timeline }),
    savedAt: new Date().toISOString(),
    baseUpdatedAt: existing?.baseUpdatedAt ?? input.baseUpdatedAt
  }
  if (Object.keys(patch).length === 0 && !timeline) return false
  let attempt: DraftRecord = base
  if (JSON.stringify(attempt).length > MAX_RECORD_BYTES) {
    // Timeline documents grow with the edit; the clip patch is what must survive.
    const { timeline: _dropped, ...withoutTimeline } = attempt
    attempt = withoutTimeline as DraftRecord
  }
  if (JSON.stringify(attempt).length > MAX_RECORD_BYTES) return false
  try {
    storage.setItem(draftKey(clipId), JSON.stringify(attempt))
    return true
  } catch {
    return false
  }
}

export function clearDraft(storage: DraftStorage, clipId: string): void {
  try {
    storage.removeItem(draftKey(clipId))
  } catch {
    /* nothing to do: the next successful save clears it again */
  }
}

/**
 * True when the draft holds edits the saved clip does not have. A draft is
 * only offered when it is strictly newer than the stored clip, so a slow
 * background write can never resurrect old text over newer data.
 */
export function draftIsNewer(draft: DraftRecord, clipUpdatedAt: string | null | undefined): boolean {
  const saved = clipUpdatedAt ? Date.parse(clipUpdatedAt) : 0
  const drafted = Date.parse(draft.savedAt)
  if (Number.isNaN(drafted)) return false
  return drafted > (Number.isNaN(saved) ? 0 : saved)
}


let cachedStorage: DraftStorage | null | undefined

/**
 * localStorage when the browser will actually let us use it. Returns null in a
 * privacy mode or when storage is disabled — the editor then saves normally and
 * simply has no crash journal.
 */
export function browserDraftStorage(): DraftStorage | null {
  if (cachedStorage !== undefined) return cachedStorage
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      cachedStorage = null
      return null
    }
    const probe = `${DRAFT_PREFIX}probe`
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    cachedStorage = window.localStorage
  } catch {
    cachedStorage = null
  }
  return cachedStorage
}
