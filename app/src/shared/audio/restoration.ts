import type { AudioRestorationPreset } from '@shared/types'

export const AUDIO_RESTORATION_PRESETS: Array<{
  id: AudioRestorationPreset
  label: string
  description: string
}> = [
  { id: 'off', label: 'Off', description: 'Keep the original audio unchanged.' },
  { id: 'light', label: 'Light', description: 'Reduce steady background hiss and low rumble gently.' },
  { id: 'standard', label: 'Standard', description: 'Balanced voice cleanup for common room noise.' },
  { id: 'strong', label: 'Strong', description: 'More aggressive cleanup; may soften quiet speech or ambience.' }
]

/** FFmpeg audio filters for a non-destructive voice-cleanup preset. */
export function audioRestorationFilters(preset: AudioRestorationPreset): string[] {
  switch (preset) {
    case 'light':
      return ['highpass=f=65', 'afftdn=nr=6:nf=-40:tn=1']
    case 'standard':
      return ['highpass=f=80', 'afftdn=nr=12:nf=-40:tn=1']
    case 'strong':
      return ['highpass=f=100', 'afftdn=nr=20:nf=-40:tn=1']
    case 'off':
    default:
      return []
  }
}

/** The selected restoration filters followed by optional EBU R128 loudness normalization. */
export function sourceAudioFilterChain(preset: AudioRestorationPreset, normalize: boolean): string[] {
  return [
    ...audioRestorationFilters(preset),
    ...(normalize ? ['loudnorm=I=-16:TP=-1.5:LRA=11'] : [])
  ]
}
