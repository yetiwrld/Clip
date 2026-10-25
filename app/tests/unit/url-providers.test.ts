import { describe, expect, it } from 'vitest'
import { formatYtDlpTime } from '../../src/main/services/media/url-providers'

describe('low-data URL time ranges', () => {
  it('formats second offsets as stable ffmpeg/yt-dlp section timecodes', () => {
    expect(formatYtDlpTime(0)).toBe('00:00:00.000')
    expect(formatYtDlpTime(65.125)).toBe('00:01:05.125')
    expect(formatYtDlpTime(3_661.999)).toBe('01:01:01.999')
  })

  it('rounds fractional milliseconds without losing second carry', () => {
    expect(formatYtDlpTime(59.9996)).toBe('00:01:00.000')
  })
})
