import { api } from '../api/client'

/**
 * Where a change is, in plain terms:
 *   dirty  — held in the editor, not sent yet (inside the debounce window)
 *   saving — sent, waiting for the backend to confirm it is on disk
 *   saved  — the backend confirmed the write reached the file
 *   error  — the write failed; the change still exists in memory and can retry
 *
 * "saved" is only ever set after `storage.flush` resolves, because a resolved
 * API call alone does not prove the database file was written.
 */
export type SaveState = 'saved' | 'saving' | 'dirty' | 'error'

export interface SaveStateCopy {
  label: string
  title: string
}

/** One place for the four save states, so every screen says the same thing. */
export function saveStateCopy(state: SaveState): SaveStateCopy {
  switch (state) {
    case 'saving':
      return { label: 'Saving…', title: 'Writing your changes to disk' }
    case 'saved':
      return { label: 'All changes saved', title: 'Everything you changed is on disk' }
    case 'error':
      return { label: 'Save failed', title: 'Your changes are still in memory and were not written to disk' }
    case 'dirty':
    default:
      return { label: 'Unsaved changes', title: 'Changes are waiting to be written' }
  }
}

/** Force a write and resolve only when the data is on disk. Rejects on failure. */
export async function flushStorage(): Promise<void> {
  await api['storage.flush']()
}
