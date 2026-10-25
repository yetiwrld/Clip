import { describe, expect, it } from 'vitest'
import { createWhisperProgressParser } from '../../src/main/services/transcription'

describe('local transcription progress stream', () => {
  it('assembles progress records split across stderr chunks and parses multiple lines', () => {
    const records: Array<{ progress: number; message?: string }> = []
    const parser = createWhisperProgressParser((progress, message) => records.push({ progress, message }))

    parser.push('model download noise\r\n{"progress":0.')
    parser.push('24,"message":"Transcribing audio"}\n{"progress":0.5,"message":"Halfway"}\n')
    parser.flush()

    expect(records).toEqual([
      { progress: 0.24, message: 'Transcribing audio' },
      { progress: 0.5, message: 'Halfway' }
    ])
  })

  it('flushes a final record without a newline, ignores malformed records, and clamps percentages', () => {
    const records: Array<{ progress: number; message?: string }> = []
    const parser = createWhisperProgressParser((progress, message) => records.push({ progress, message }))

    parser.push('{not-json}\n{"progress":1.2,"message":"Finished audio"}')
    parser.flush()

    expect(records).toEqual([{ progress: 1, message: 'Finished audio' }])
  })
})
