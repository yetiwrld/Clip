import type { TaskType } from '@shared/types'

/**
 * People-facing names for backend states.
 *
 * The database stores enum values (`speaker-identification`, `preparing`,
 * `draft`). Those are identifiers — they must not be renamed, but they also
 * must not be shown. Every screen reads its labels from here so the queue, the
 * project tabs and the editor describe the same job the same way.
 */

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  download: 'Media import',
  transcribe: 'Transcription',
  analyze: 'Moment analysis',
  'speaker-identification': 'Voice grouping',
  render: 'Render',
  thumbnail: 'Thumbnail',
  proxy: 'Preview copy',
  'asset-import': 'Media import'
}

export function taskTypeLabel(type: string): string {
  return TASK_TYPE_LABELS[type as TaskType] ?? type
}

const RENDER_STAGE_LABELS: Record<string, string> = {
  preparing: 'Preparing',
  starting: 'Starting',
  encoding: 'Encoding',
  validating: 'Checking the file'
}

/** Stage labels are shown after a percentage, so they are short and capitalized. */
export function renderStageLabel(stage: string | null | undefined): string {
  if (!stage) return ''
  return RENDER_STAGE_LABELS[stage] ?? stage
}

const TASK_STATE_LABELS: Record<string, string> = {
  queued: 'Waiting',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  interrupted: 'Interrupted'
}

export function taskStateLabel(state: string): string {
  return TASK_STATE_LABELS[state] ?? state
}

const RENDER_STATUS_LABELS: Record<string, string> = {
  queued: 'Waiting',
  preparing: 'Preparing',
  rendering: 'Rendering',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled'
}

export function renderStatusLabel(status: string): string {
  return RENDER_STATUS_LABELS[status] ?? status
}

const CLIP_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  rendered: 'Rendered'
}

export function clipStatusLabel(status: string): string {
  return CLIP_STATUS_LABELS[status] ?? status
}

/**
 * Provider names appear in analysis copy and in the score breakdown. The local
 * heuristic is deliberately described as "not an AI model" — it reads
 * transcript text with fixed rules, and the app should never imply otherwise.
 */
export function providerLabel(provider: string | null | undefined): string {
  if (!provider) return 'the local heuristic analyzer (not an AI model)'
  if (provider === 'heuristic-local') return 'the local heuristic analyzer (not an AI model)'
  if (provider === 'openai-compatible') return 'your AI endpoint'
  if (provider === 'anthropic') return 'Anthropic (Claude)'
  return provider
}

/** "1 clip" / "2 clips" — every counter goes through this so none says "1 clips". */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}
