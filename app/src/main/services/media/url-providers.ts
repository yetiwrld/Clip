import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { spawn } from 'node:child_process'
import { AppError } from '@shared/errors'
import { whichSync } from './ffmpeg'

/**
 * VideoSourceProvider — modular URL ingestion (spec §11).
 *
 * Two implementations:
 *  - DirectHttpProvider: direct media URLs (mp4/webm/mov/…). Verifies the
 *    content type before saving, streams to a .part file, supports cancel.
 *  - YtDlpProvider: uses a *user-installed* yt-dlp binary for sites that
 *    need it. The app never installs or downloads yt-dlp itself; if it is
 *    absent the UI explains how the user can install it. Users are
 *    responsible for having the rights to download the content.
 */

export interface SourceMeta {
  title: string | null
  duration: number | null
  estimatedSize: number | null
  provider: string
}

export interface DownloadEvents {
  onProgress?: (downloaded: number, total: number | null) => void
  signal?: AbortSignal
  /** App-resolved FFmpeg binary used to merge adaptive video/audio streams. */
  ffmpegPath?: string
}

export interface VideoSourceProvider {
  id: string
  label: string
  canHandle(url: string): boolean
  fetchMeta(url: string, signal?: AbortSignal): Promise<SourceMeta | null>
  download(url: string, destPath: string, events: DownloadEvents): Promise<void>
}

export function parseUrlSafe(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new AppError('URL_INVALID', 'That does not look like a valid URL.', 'Paste a full URL starting with http:// or https://')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new AppError('URL_SCHEME_UNSUPPORTED', 'Only http and https URLs are supported.', 'For local files, use "Import file" instead.')
  }
  return url
}

const DIRECT_MEDIA_EXTENSIONS = ['.mp4', '.mov', '.mkv', '.webm', '.m4v', '.mpg', '.mpeg', '.avi', '.mp3', '.m4a', '.wav', '.ogg', '.flac']

export class DirectHttpProvider implements VideoSourceProvider {
  id = 'direct-http'
  label = 'Direct media URL'

  canHandle(url: string): boolean {
    try {
      const u = parseUrlSafe(url)
      const ext = path.extname(u.pathname).toLowerCase()
      return DIRECT_MEDIA_EXTENSIONS.includes(ext)
    } catch {
      return false
    }
  }

  async fetchMeta(url: string, signal?: AbortSignal): Promise<SourceMeta | null> {
    const u = parseUrlSafe(url)
    try {
      const res = await fetch(u, { method: 'HEAD', signal, redirect: 'follow' })
      const type = res.headers.get('content-type') ?? ''
      const len = parseInt(res.headers.get('content-length') ?? '', 10)
      return {
        title: path.basename(decodeURIComponent(u.pathname)) || null,
        duration: null,
        estimatedSize: Number.isFinite(len) ? len : null,
        provider: this.id
      }
      void type
    } catch {
      // HEAD not supported → meta unknown; the download itself will still try
      return { title: path.basename(decodeURIComponent(u.pathname)) || null, duration: null, estimatedSize: null, provider: this.id }
    }
  }

  async download(url: string, destPath: string, events: DownloadEvents): Promise<void> {
    const u = parseUrlSafe(url)
    fs.mkdirSync(path.dirname(destPath), { recursive: true })
    const partPath = `${destPath}.part`

    let res: Response
    try {
      res = await fetch(u, { signal: events.signal, redirect: 'follow' })
    } catch (err) {
      throw new AppError(
        'DOWNLOAD_FAILED',
        `The URL could not be reached (${u.host}).`,
        'Check your internet connection and the URL. If the site requires a login, download the file manually and use "Import file".',
        String(err)
      )
    }
    if (!res.ok || !res.body) {
      throw new AppError(
        'DOWNLOAD_HTTP_ERROR',
        `The server responded with HTTP ${res.status}.`,
        res.status === 404
          ? 'The file does not exist at this address. Verify the link.'
          : res.status === 403 || res.status === 401
            ? 'The server refused the download. The content may require authentication or hotlink protection.'
            : 'The server may be having problems, or the link may be wrong.',
        `HTTP ${res.status}`
      )
    }

    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    const looksLikeMedia =
      type.startsWith('video/') || type.startsWith('audio/') || type === 'application/octet-stream' || type === ''
    if (!looksLikeMedia) {
      throw new AppError(
        'URL_NOT_MEDIA',
        `That URL returns "${type || 'unknown content'}", which is not a media file.`,
        'This looks like a web page, not a direct video link. Copy the direct file URL, or install yt-dlp (Settings → Transcription/Advanced) to import from video sites.'
      )
    }

    const total = parseInt(res.headers.get('content-length') ?? '', 10)
    let downloaded = 0
    const nodeStream = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream)
    const out = fs.createWriteStream(partPath)
    let lastReport = 0
    nodeStream.on('data', (chunk: Buffer) => {
      downloaded += chunk.length
      const now = Date.now()
      if (now - lastReport > 200) {
        lastReport = now
        events.onProgress?.(downloaded, Number.isFinite(total) ? total : null)
      }
    })
    await new Promise<void>((resolve, reject) => {
      nodeStream.on('error', reject)
      out.on('error', reject)
      out.on('finish', resolve)
      nodeStream.pipe(out)
    })
    events.onProgress?.(downloaded, Number.isFinite(total) ? total : null)
    if (fs.existsSync(destPath)) fs.unlinkSync(destPath)
    fs.renameSync(partPath, destPath)
  }
}

function parseYtDlpProgress(events: DownloadEvents, stderrBuffer: { value: string }) {
  let progressBuffer = ''
  return (chunk: Buffer): void => {
    const text = chunk.toString()
    stderrBuffer.value = (stderrBuffer.value + text).slice(-12000)
    progressBuffer += text
    const lines = progressBuffer.split(/\r?\n/)
    progressBuffer = lines.pop() ?? ''
    for (const line of lines) {
      const match = /CLIPWRIGHT_PROGRESS:(\d+|NA):(\d+|NA):(\d+|NA)/.exec(line)
      if (!match) continue
      const downloaded = match[1] === 'NA' ? null : Number(match[1])
      const exactTotal = match[2] === 'NA' ? null : Number(match[2])
      const estimatedTotal = match[3] === 'NA' ? null : Number(match[3])
      const total = exactTotal ?? estimatedTotal
      if (downloaded !== null && Number.isFinite(downloaded) && downloaded >= 0) {
        events.onProgress?.(downloaded, total !== null && Number.isFinite(total) && total > 0 ? total : null)
      }
    }
  }
}

function removeYtDlpOutputFiles(dir: string, prefix: string, removeMedia: boolean): void {
  try {
    for (const name of fs.readdirSync(dir)) {
      if (!name.startsWith(prefix)) continue
      const isPartial = name.endsWith('.part') || name.endsWith('.ytdl') || name.includes('.part.')
      if (!isPartial && !(removeMedia && isMediaOutput(name))) continue
      try { fs.unlinkSync(path.join(dir, name)) } catch { /* best effort */ }
    }
  } catch { /* best effort */ }
}

async function runYtDlpCommand(
  binary: string,
  args: string[],
  events: DownloadEvents,
  outputDir: string,
  outputPrefix: string,
  removeMediaOnFailure = false
): Promise<void> {
  if (events.signal?.aborted) throw new AppError('DOWNLOAD_CANCELLED', 'The download was cancelled.')
  const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  const stopChild = (): void => {
    if (process.platform === 'win32' && child.pid) {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true })
      killer.once('error', () => child.kill())
      killer.once('close', (code) => { if (code !== 0) child.kill() })
    } else {
      child.kill('SIGTERM')
    }
  }
  events.signal?.addEventListener('abort', stopChild, { once: true })
  const stderrBuffer = { value: '' }
  const consumeOutput = parseYtDlpProgress(events, stderrBuffer)
  child.stdout.on('data', consumeOutput)
  child.stderr.on('data', consumeOutput)
  let code: number | null
  try {
    code = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject)
      child.once('close', resolve)
    })
  } finally {
    events.signal?.removeEventListener('abort', stopChild)
  }
  if (events.signal?.aborted) {
    removeYtDlpOutputFiles(outputDir, outputPrefix, removeMediaOnFailure)
    throw new AppError('DOWNLOAD_CANCELLED', 'The download was cancelled.')
  }
  if (code !== 0) {
    removeYtDlpOutputFiles(outputDir, outputPrefix, removeMediaOnFailure)
    throw new AppError(
      'YTDLP_FAILED',
      'yt-dlp could not complete the requested download.',
      'The URL may be private, region-locked, or unsupported for this format or time range. Audio-only and section modes never fall back to fetching the full video.',
      stderrBuffer.value.slice(-1500)
    )
  }
}

function isMediaOutput(name: string): boolean {
  return ['.mp4', '.mkv', '.webm', '.mov', '.m4v', '.flv', '.avi', '.ts', '.3gp', '.mp3', '.m4a', '.aac', '.ogg', '.opus', '.flac', '.wav', '.mka'].includes(path.extname(name).toLowerCase())
}

function findYtDlpOutput(dir: string, prefix: string): string | null {
  try {
    const names = fs.readdirSync(dir).filter((name) =>
      name.startsWith(prefix) && !name.endsWith('.part') && !name.endsWith('.ytdl') && isMediaOutput(name)
    )
    if (names.length === 0) return null
    // yt-dlp emits one media file for audio-only and one merged file for video.
    // Prefer an exact prefix match when it exists, otherwise use the first media
    // output from its deterministic, single-URL invocation.
    names.sort((a, b) => Number(b === prefix) - Number(a === prefix) || a.localeCompare(b))
    return path.join(dir, names[0])
  } catch {
    return null
  }
}

export function formatYtDlpTime(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000))
  const hours = Math.floor(totalMs / 3_600_000)
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000)
  const wholeSeconds = Math.floor((totalMs % 60_000) / 1000)
  const milliseconds = totalMs % 1000
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`
}

export class YtDlpProvider implements VideoSourceProvider {
  id = 'yt-dlp'
  label = 'yt-dlp'
  private binary: string | null = null

  constructor() {
    const executable = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
    const bundledCandidates = [
      // electron-builder extraResources destination in packaged builds
      process.resourcesPath ? path.join(process.resourcesPath, 'bin', executable) : null,
      // Repository resources directory while running from the project root
      path.join(process.cwd(), 'resources', 'bin', executable)
    ]
    this.binary =
      whichSync('yt-dlp') ??
      whichSync('yt-dlp.exe') ??
      bundledCandidates.find((candidate): candidate is string => Boolean(candidate && fs.existsSync(candidate))) ??
      null
  }

  isInstalled(): boolean {
    return this.binary != null
  }

  canHandle(_url: string): boolean {
    return this.isInstalled()
  }

  async fetchMeta(url: string, signal?: AbortSignal): Promise<SourceMeta | null> {
    if (!this.binary || signal?.aborted) return null
    const child = spawn(this.binary, ['-J', '--no-warnings', url], { stdio: ['ignore', 'pipe', 'ignore'] })
    let out = ''
    const stop = (): void => { child.kill() }
    const timer = setTimeout(stop, 30000)
    signal?.addEventListener('abort', stop, { once: true })
    child.stdout.on('data', (d) => (out += d.toString()))
    try {
      await new Promise<void>((resolve, reject) => {
        child.once('error', reject)
        child.once('close', () => resolve())
      })
    } catch {
      return null
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', stop)
    }
    if (signal?.aborted) return null
    try {
      const info = JSON.parse(out)
      return {
        title: typeof info.title === 'string' ? info.title : null,
        duration: typeof info.duration === 'number' ? info.duration : null,
        estimatedSize: null,
        provider: this.id
      }
    } catch {
      return null
    }
  }

  async download(url: string, destPath: string, events: DownloadEvents): Promise<void> {
    const binary = this.requireBinary()
    fs.mkdirSync(path.dirname(destPath), { recursive: true })
    const prefix = path.basename(destPath, path.extname(destPath))
    const args = [
      ...this.ffmpegArgs(events),
      '--js-runtimes', 'node',
      '-f', 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--merge-output-format', 'mp4',
      ...this.progressArgs(),
      '-o', destPath,
      '--newline',
      '--no-playlist',
      url
    ]
    await runYtDlpCommand(binary, args, events, path.dirname(destPath), prefix)
    const output = fs.existsSync(destPath) ? destPath : findYtDlpOutput(path.dirname(destPath), prefix)
    if (!output) throw new AppError('YTDLP_NO_OUTPUT', 'yt-dlp finished but produced no media file.')
    if (output !== destPath) {
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath)
      fs.renameSync(output, destPath)
    }
  }

  /** Download only a speech-friendly audio stream; never selects a video format. */
  async downloadAudio(url: string, destBasePath: string, events: DownloadEvents): Promise<string> {
    const binary = this.requireBinary()
    fs.mkdirSync(path.dirname(destBasePath), { recursive: true })
    const prefix = path.basename(destBasePath, path.extname(destBasePath))
    const outputTemplate = path.join(path.dirname(destBasePath), `${prefix}.%(ext)s`)
    const args = [
      ...this.ffmpegArgs(events),
      '--js-runtimes', 'node',
      '-f', 'bestaudio[abr<=96]/bestaudio',
      ...this.progressArgs(),
      '-o', outputTemplate,
      '--newline',
      '--no-playlist',
      url
    ]
    await runYtDlpCommand(binary, args, events, path.dirname(destBasePath), prefix, true)
    const output = findYtDlpOutput(path.dirname(destBasePath), prefix)
    if (!output) throw new AppError('YTDLP_NO_OUTPUT', 'yt-dlp finished but produced no audio-only file.')
    return output
  }

  /** Download a single requested section; deliberately has no full-video fallback. */
  async downloadSection(url: string, start: number, end: number, destBasePath: string, events: DownloadEvents): Promise<string> {
    const binary = this.requireBinary()
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
      throw new AppError('SECTION_RANGE_INVALID', 'The selected download range is invalid.', 'Choose an end time later than the start time.')
    }
    fs.mkdirSync(path.dirname(destBasePath), { recursive: true })
    const prefix = path.basename(destBasePath, path.extname(destBasePath))
    const outputTemplate = path.join(path.dirname(destBasePath), `${prefix}.%(ext)s`)
    const args = [
      ...this.ffmpegArgs(events),
      '--js-runtimes', 'node',
      '--download-sections', `*${formatYtDlpTime(start)}-${formatYtDlpTime(end)}`,
      '--force-keyframes-at-cuts',
      '-f', 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--merge-output-format', 'mp4',
      ...this.progressArgs(),
      '-o', outputTemplate,
      '--newline',
      '--no-playlist',
      url
    ]
    await runYtDlpCommand(binary, args, events, path.dirname(destBasePath), prefix, true)
    const output = findYtDlpOutput(path.dirname(destBasePath), prefix)
    if (!output) throw new AppError('YTDLP_NO_OUTPUT', 'yt-dlp finished but produced no video section.')
    return output
  }

  private requireBinary(): string {
    if (!this.binary) {
      throw new AppError('YTDLP_MISSING', 'yt-dlp is not installed on this system.', 'Install yt-dlp from its official site and make sure it is on your PATH, or import a local file directly.')
    }
    return this.binary
  }

  private ffmpegArgs(events: DownloadEvents): string[] {
    return events.ffmpegPath ? ['--ffmpeg-location', events.ffmpegPath] : []
  }

  private progressArgs(): string[] {
    return ['--progress-template', 'download:CLIPWRIGHT_PROGRESS:%(progress.downloaded_bytes)s:%(progress.total_bytes)s:%(progress.total_bytes_estimate)s']
  }
}

/**
 * Pre-flight check (no side effects): can any installed provider import
 * this URL, and if not, why? Used by media.checkUrl (UI hint) and to fail
 * media.importUrl fast, before a background task is ever created.
 */
export function checkUrlProviders(rawUrl: string): {
  ok: boolean
  provider: string | null
  label: string | null
  reason: string | null
  hint: string | null
} {
  let parsed: URL
  try {
    parsed = parseUrlSafe(rawUrl)
  } catch (err) {
    const e = err as AppError
    return { ok: false, provider: null, label: null, reason: e.message, hint: e.hint ?? null }
  }
  const providers = getSourceProviders()
  const provider = providers.find((p) => p.canHandle(rawUrl))
  if (provider) {
    return { ok: true, provider: provider.id, label: provider.label, reason: null, hint: null }
  }
  const ytdlp = providers.find((p) => p.id === 'yt-dlp') as { isInstalled(): boolean } | undefined
  const ext = path.extname(parsed.pathname).toLowerCase()
  const looksLikePage = ext === '' || ['.html', '.htm', '.php', '.asp', '.aspx'].includes(ext)
  return {
    ok: false,
    provider: null,
    label: null,
    reason: ytdlp && !ytdlp.isInstalled()
      ? 'This looks like a web page link, not a direct media file — it needs yt-dlp, which is not installed.'
      : 'No available provider can import this URL.',
    hint: ytdlp && !ytdlp.isInstalled()
      ? looksLikePage
        ? 'Paste a direct link to the video file (ends in .mp4/.webm/…), or install yt-dlp and put it on your PATH to import from video sites. Only download content you have the right to use.'
        : 'Install yt-dlp and make sure it is on your PATH, then retry.'
      : 'Use a direct link to a media file (.mp4, .webm, …).'
  }
}

export function getSourceProviders(): VideoSourceProvider[] {
  return [new YtDlpProvider(), new DirectHttpProvider()]
}

/** The low-data workflows require yt-dlp's audio-only and section features. */
export function getYtDlpProvider(): YtDlpProvider | null {
  const provider = new YtDlpProvider()
  return provider.isInstalled() ? provider : null
}

export async function fetchUrlMeta(url: string): Promise<SourceMeta | null> {
  const providers = getSourceProviders()
  for (const provider of providers) {
    if (!provider.canHandle(url)) continue
    try {
      const meta = await provider.fetchMeta(url)
      if (meta) return meta
    } catch {
      /* try next provider */
    }
  }
  return null
}
