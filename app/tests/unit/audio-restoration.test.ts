import { describe, expect, it } from 'vitest'
import {
  AUDIO_RESTORATION_PRESETS,
  audioRestorationFilters,
  sourceAudioFilterChain
} from '@shared/audio/restoration'

describe('non-destructive audio restoration presets', () => {
  it('offers an off state and three increasing cleanup levels', () => {
    expect(AUDIO_RESTORATION_PRESETS.map((preset) => preset.id)).toEqual(['off', 'light', 'standard', 'strong'])
    expect(audioRestorationFilters('off')).toEqual([])
    expect(audioRestorationFilters('light')).toEqual(['highpass=f=65', 'afftdn=nr=6:nf=-40:tn=1'])
    expect(audioRestorationFilters('standard')).toEqual(['highpass=f=80', 'afftdn=nr=12:nf=-40:tn=1'])
    expect(audioRestorationFilters('strong')).toEqual(['highpass=f=100', 'afftdn=nr=20:nf=-40:tn=1'])
  })

  it('composes cleanup and loudness normalization without touching the source file', () => {
    expect(sourceAudioFilterChain('off', false)).toEqual([])
    expect(sourceAudioFilterChain('off', true)).toEqual(['loudnorm=I=-16:TP=-1.5:LRA=11'])
    expect(sourceAudioFilterChain('standard', true)).toEqual([
      'highpass=f=80',
      'afftdn=nr=12:nf=-40:tn=1',
      'loudnorm=I=-16:TP=-1.5:LRA=11'
    ])
  })
})
