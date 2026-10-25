import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { transcriptResultSchema } from '../../src/shared/schemas'

const helperPath = fileURLToPath(new URL('../../scripts/python/transcribe_faster_whisper.py', import.meta.url))

function findPython(): { binary: string; prefix: string[] } | null {
  const configured = process.env.PYTHON?.trim()
  const candidates = [
    ...(configured ? [{ binary: configured, prefix: [] }] : []),
    { binary: 'python3', prefix: [] },
    { binary: 'python', prefix: [] },
    { binary: 'py', prefix: ['-3'] }
  ]
  for (const candidate of candidates) {
    const probe = spawnSync(candidate.binary, [...candidate.prefix, '--version'], { encoding: 'utf8' })
    if (!probe.error && probe.status === 0) return candidate
  }
  return null
}

const python = findPython()

it.skipIf(!python)('Python Whisper helper emits a transcript accepted by the shared result schema', () => {
  if (!python) return

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clipwright-whisper-contract-'))
  try {
    // Stub only the external inference library; exercise the real helper CLI,
    // argument parsing, progress channel, JSON output, and TypeScript schema.
    fs.writeFileSync(path.join(tempDir, 'faster_whisper.py'), `
from types import SimpleNamespace

class Word:
    def __init__(self, word, start, end):
        self.word, self.start, self.end = word, start, end

class Segment:
    start = 0.25
    end = 1.75
    text = " Hello world. "
    words = [Word(" Hello", 0.25, 0.7), Word(" world.", 0.72, 1.75)]

class WhisperModel:
    def __init__(self, *args, **kwargs):
        pass
    def transcribe(self, source, **kwargs):
        return [Segment()], SimpleNamespace(duration=2.0, language="en")
`)

    const mediaPath = path.join(tempDir, 'input.wav')
    const modelDir = path.join(tempDir, 'models')
    fs.writeFileSync(mediaPath, 'stub media')

    const result = spawnSync(
      python.binary,
      [
        ...python.prefix,
        '-S',
        helperPath,
        '--input', mediaPath,
        '--model', 'tiny',
        '--model-dir', modelDir,
        '--device', 'cpu',
        '--compute', 'int8',
        '--beam-size', '3',
        '--language', 'en'
      ],
      { encoding: 'utf8', env: { ...process.env, PYTHONPATH: tempDir }, timeout: 15_000 }
    )

    expect(result.error).toBeUndefined()
    expect(result.status).toBe(0)
    expect(result.stderr).toContain('"progress"')
    const parsed = transcriptResultSchema.safeParse(JSON.parse(result.stdout))
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.language).toBe('en')
      expect(parsed.data.segments).toEqual([
        {
          start: 0.25,
          end: 1.75,
          text: 'Hello world.',
          words: [
            { word: 'Hello', start: 0.25, end: 0.7 },
            { word: 'world.', start: 0.72, end: 1.75 }
          ]
        }
      ])
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
