import React, { useState } from 'react'
import {
  Bot, AudioLines, Video, Captions, Package, HardDrive, Wrench, ShieldCheck,
  Download, FolderOpen, KeyRound, Trash2, TestTube2, Save
, RefreshCw } from 'lucide-react'
import { api, errMessage, isElectron } from '../../api/client'
import { useAppStore } from '../../stores/app'
import { Field, Switch, formatBytes, Spinner, ErrorBox, Modal } from '../../components/ui'
import { CAPTION_STYLES, QUALITY_PRESETS, RESOLUTION_PRESETS } from '@shared/constants'
import type { AiProviderRuntimeConfig, StorageCleanupCategoryId, StorageCleanupReport, StorageCleanupResult } from '@shared/types'

type Section = 'ai' | 'transcription' | 'video' | 'captions' | 'export' | 'storage' | 'advanced'

export function SettingsPage() {
  const app = useAppStore()
  // Section lives in the store so the command palette can jump to one.
  const section = app.settingsSection as Section
  const setSection = app.setSettingsSection
  const settings = app.settings

  if (!settings) {
    return (
      <div className="page" style={{ display: 'grid', placeItems: 'center' }}>
        <Spinner size={20} />
      </div>
    )
  }

  const sections: Array<{ id: Section; label: string; icon: React.ReactNode }> = [
    { id: 'ai', label: 'AI providers', icon: <Bot size={14} /> },
    { id: 'transcription', label: 'Transcription', icon: <AudioLines size={14} /> },
    { id: 'video', label: 'Video & rendering', icon: <Video size={14} /> },
    { id: 'captions', label: 'Captions', icon: <Captions size={14} /> },
    { id: 'export', label: 'Export', icon: <Package size={14} /> },
    { id: 'storage', label: 'Storage & privacy', icon: <HardDrive size={14} /> },
    { id: 'advanced', label: 'Advanced', icon: <Wrench size={14} /> }
  ]

  return (
    <div className="page" data-density="compact">
      <div className="page-header">
        <div className="page-heading">
          <div className="page-title">Settings</div>
          <div className="page-subtitle">App preferences. Everything here is stored on this computer.</div>
        </div>
      </div>

      <div className="settings-layout">
        <div className="settings-nav">
          {sections.map((s) => (
            <button
              key={s.id}
              className={`nav-item ${section === s.id ? 'active' : ''}`}
              style={{ width: '100%' }}
              onClick={() => setSection(s.id)}
            >
              {s.icon} {s.label}
            </button>
          ))}
        </div>

        <div className="settings-content stack">
          {section === 'ai' && <AiSection />}
          {section === 'transcription' && <TranscriptionSection />}
          {section === 'video' && <VideoSection />}
          {section === 'captions' && <CaptionsSection />}
          {section === 'export' && <ExportSection />}
          {section === 'storage' && <StorageSection />}
          {section === 'advanced' && <AdvancedSection />}
        </div>
      </div>
    </div>
  )
}

// ================================================================== AI ====

function AiSection() {
  const app = useAppStore()
  const settings = app.settings!
  const [hints, setHints] = useState<Record<string, string>>({})
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; message: string; endpoint: string; model: string; latencyMs: number | null }>>({})
  const [keyDraft, setKeyDraft] = useState<Record<string, string>>({})
  const [error, setError] = useState<unknown>(null)

  React.useEffect(() => {
    void api['settings.secretHints']().then(setHints).catch(() => undefined)
  }, [])

  async function saveProvider(providerId: 'openai' | 'anthropic', patch: Partial<AiProviderRuntimeConfig>) {
    await app.saveSettings({ ai: { [providerId]: patch } as Record<string, unknown> })
  }

  async function saveKey(secretKey: 'ai:openai-compatible' | 'ai:anthropic', value: string) {
    try {
      if (!value.trim()) {
        await api['settings.deleteSecret']({ key: secretKey })
      } else {
        await api['settings.setSecret']({ key: secretKey, value: value.trim() })
      }
      setKeyDraft((d) => ({ ...d, [secretKey]: '' }))
      const h = await api['settings.secretHints']()
      setHints(h)
      await app.bootstrap()
      app.toast({ level: 'success', message: value.trim() ? 'API key saved on this computer.' : 'API key removed.' })
    } catch (err) {
      setError(err)
    }
  }

  async function test(providerId: 'openai-compatible' | 'anthropic') {
    setTesting(providerId)
    setTestResult((r) => {
      const next = { ...r }
      delete next[providerId]
      return next
    })
    try {
      const result = await api['settings.testAiProvider']({ providerId })
      setTestResult((r) => ({ ...r, [providerId]: result }))
    } catch (err) {
      const { message } = errMessage(err)
      setTestResult((r) => ({ ...r, [providerId]: { ok: false, message, endpoint: '', model: '', latencyMs: null } }))
    } finally {
      setTesting(null)
    }
  }

  return (
    <>
      <div className="settings-section">
        <div className="section-title">Analysis provider</div>
        <div className="field">
          <select
            className="select"
            value={settings.ai.activeProvider}
            onChange={(e) => void app.saveSettings({ ai: { activeProvider: e.target.value } })}
          >
            <option value="none">None — analyze with the offline heuristic</option>
            <option value="heuristic-local">Local heuristic (offline)</option>
            <option value="openai-compatible">OpenAI-compatible endpoint</option>
            <option value="anthropic">Anthropic (Claude)</option>
          </select>
          <div className="field-hint">
            When an AI provider is active, analysis sends <strong>transcript text only</strong> — never your video files.
          </div>
        </div>
      </div>

      {error && <ErrorBox error={error} />}

      <ProviderForm
        title="OpenAI-compatible endpoint"
        providers="OpenAI, OpenRouter, Groq, Together, LM Studio, Ollama…"
        providerId="openai-compatible"
        secretKey="ai:openai-compatible"
        config={settings.ai.openai}
        hint={hints['ai:openai-compatible']}
        keyDraft={keyDraft['ai:openai-compatible'] ?? ''}
        onKeyDraft={(v) => setKeyDraft((d) => ({ ...d, 'ai:openai-compatible': v }))}
        onSave={(patch) => void saveProvider('openai', patch)}
        onSaveKey={(v) => void saveKey('ai:openai-compatible', v)}
        onTest={() => void test('openai-compatible')}
        testing={testing === 'openai-compatible'}
        testResult={testResult['openai-compatible']}
        audioOption
      />

      <ProviderForm
        title="Anthropic (Claude)"
        providers="Direct Anthropic API"
        providerId="anthropic"
        secretKey="ai:anthropic"
        config={settings.ai.anthropic}
        hint={hints['ai:anthropic']}
        keyDraft={keyDraft['ai:anthropic'] ?? ''}
        onKeyDraft={(v) => setKeyDraft((d) => ({ ...d, 'ai:anthropic': v }))}
        onSave={(patch) => void saveProvider('anthropic', patch)}
        onSaveKey={(v) => void saveKey('ai:anthropic', v)}
        onTest={() => void test('anthropic')}
        testing={testing === 'anthropic'}
        testResult={testResult['anthropic']}
      />

      <div className="settings-section">
        <div className="row">
          <ShieldCheck size={14} color="var(--success)" />
          <strong style={{ fontSize: 'var(--fs-base)' }}>Privacy — exactly what leaves this machine</strong>
        </div>
        <div className="field-hint" style={{ lineHeight: 1.7, marginTop: 'var(--space-3)' }}>
          Import, inspection, thumbnails, reframing, caption burn-in and rendering: <strong>always local</strong>.
          Local Whisper transcription: <strong>always local</strong>. Cloud transcription (only if you select it): the extracted
          audio track is sent to the endpoint you configured. AI analysis and metadata generation (only if you select a provider):
          transcript text is sent. There is no telemetry, no analytics, and no account.
        </div>
      </div>
    </>
  )
}

function ProviderForm(props: {
  title: string
  providers: string
  providerId: 'openai-compatible' | 'anthropic'
  secretKey: string
  config: AiProviderRuntimeConfig
  hint?: string
  keyDraft: string
  onKeyDraft: (v: string) => void
  onSave: (patch: Partial<AiProviderRuntimeConfig>) => void
  onSaveKey: (v: string) => void
  onTest: () => void
  testing: boolean
  testResult?: { ok: boolean; message: string; endpoint: string; model: string; latencyMs: number | null }
  audioOption?: boolean
}) {
  const app = useAppStore()
  const [local, setLocal] = useState(props.config)
  return (
    <div className="settings-section stack">
      <div className="settings-head">
        <div className="section-title">{props.title}</div>
        <span className="spacer" />
        {props.hint && <span className="chip" title="Stored API key (masked)"><KeyRound size={12} /> {props.hint}</span>}
      </div>
      <div className="tiny">{props.providers}</div>

      <div className="grid two">
        <Field
          label="Base URL"
          hint={props.providerId === 'anthropic' ? 'Leave blank to use the official Anthropic API.' : 'The chat endpoint of an OpenAI-compatible service. It usually ends with /v1; /chat/completions is added for you.'}
        >
          <input
            className="input"
            defaultValue={local.baseUrl}
            placeholder="https://api.openai.com/v1"
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (v && !/^https?:\/\//i.test(v)) {
                app.toast({ level: 'error', message: 'That base URL is not valid.', hint: `It must start with http:// or https://. You entered “${v}”.` })
                return
              }
              setLocal({ ...local, baseUrl: v })
              props.onSave({ baseUrl: v })
            }}
          />
        </Field>
        <Field label="Model" hint="Use the exact name your provider lists, such as gpt-4o-mini. The app never changes it.">
          <input className="input" defaultValue={local.model} onBlur={(e) => { setLocal({ ...local, model: e.target.value.trim() }); props.onSave({ model: e.target.value.trim() }) }} placeholder={props.providerId === 'anthropic' ? 'claude-sonnet-4-5' : 'gpt-4o-mini'} />
        </Field>
      </div>

      <Field label={`API key${props.hint ? ' (one is stored — enter a new key to replace it)' : ''}`}>
        <div className="row">
          <input
            className="input"
            type="password"
            placeholder={props.hint ? '•••• stored' : 'sk-…'}
            value={props.keyDraft}
            onChange={(e) => props.onKeyDraft(e.target.value)}
          />
          <button className="btn" onClick={() => props.onSaveKey(props.keyDraft)} disabled={!props.keyDraft.trim() && !props.hint}>
            <Save size={14} /> Save key
          </button>
          {props.hint && (
            <button className="btn ghost" title="Remove stored key" aria-label="Remove stored key" onClick={() => props.onSaveKey('')}>
              <Trash2 size={14} />
            </button>
          )}
        </div>
        <div className="field-hint">The key is kept in a protected file inside the workspace. It is never written to the database, the logs or a diagnostics report.</div>
      </Field>

      <div className="grid two">
        <Field label={`Temperature — ${local.temperature}`}>
          <input type="range" min={0} max={1} step={0.05} defaultValue={local.temperature}
            onChange={(e) => setLocal({ ...local, temperature: parseFloat(e.target.value) })}
            onMouseUp={() => props.onSave({ temperature: local.temperature })} />
        </Field>
        <Field label="Max output tokens" hint="Between 64 and 128,000. Raise it if replies stop halfway through.">
          <input className="input" type="number" min={64} max={128000} defaultValue={local.maxTokens}
            onBlur={(e) => { const raw = parseInt(e.target.value, 10); const v = Math.min(128000, Math.max(64, Number.isFinite(raw) ? raw : 4096)); setLocal({ ...local, maxTokens: v }); props.onSave({ maxTokens: v }) }} />
        </Field>
      </div>

      {props.providerId === 'openai-compatible' && (
        <Field label="API key header" hint="Bearer is the standard for OpenAI-compatible services such as OpenAI, OpenRouter, Groq and Together. Choose x-api-key only if your service requires it.">
          <select
            className="select"
            value={local.authStyle ?? 'bearer'}
            onChange={(e) => { setLocal({ ...local, authStyle: e.target.value as 'bearer' | 'x-api-key' | 'both' }); props.onSave({ authStyle: e.target.value as 'bearer' | 'x-api-key' | 'both' }) }}
          >
            <option value="bearer">Authorization: Bearer (default)</option>
            <option value="x-api-key">x-api-key</option>
            <option value="both">Send both headers</option>
          </select>
        </Field>
      )}

      <Switch label="Ask for JSON responses" hint="Some services reject the response_format field. The app retries once without it. Turn this off if errors continue." checked={local.jsonMode} onChange={(v) => { setLocal({ ...local, jsonMode: v }); props.onSave({ jsonMode: v }) }} />
      {props.audioOption && (
        <Switch
          label="This endpoint accepts audio transcription uploads"
          hint="Shows “Transcribe in cloud” in the Transcript tab. OpenAI and Groq accept uploads; many chat-only proxies do not."
          checked={local.supportsAudio}
          onChange={(v) => { setLocal({ ...local, supportsAudio: v }); props.onSave({ supportsAudio: v }) }}
        />
      )}

      <div className="row">
        <button className="btn" onClick={props.onTest} disabled={props.testing}>
          {props.testing ? <Spinner size={14} /> : <TestTube2 size={14} />} {props.testing ? 'Testing…' : 'Test connection'}
        </button>
        {props.testResult && (
          <span className={`status ${props.testResult.ok ? 'success' : 'danger'}`}>
            <span className="dot" />
            {props.testResult.ok ? 'Connected' : 'Failed'}
          </span>
        )}
      </div>
      {props.testResult && (
        <div className="field-hint" style={{ lineHeight: 1.6 }}>
          {props.testResult.message}
          <br />
          <span className="tiny">
            Endpoint <span className="mono">{props.testResult.endpoint || '—'}</span>
            {' · '}Model <span className="mono">{props.testResult.model || '—'}</span>
            {props.testResult.latencyMs != null && ` · ${(props.testResult.latencyMs / 1000).toFixed(1)}s`}
          </span>
        </div>
      )}
    </div>
  )
}

// ======================================================== transcription ==

function TranscriptionSection() {
  const app = useAppStore()
  const settings = app.settings!
  const t = settings.transcription
  const local = app.dependencies.find((d) => d.id === 'faster-whisper-local')
  const [rechecking, setRechecking] = React.useState(false)

  async function recheck() {
    setRechecking(true)
    await app.refreshDependencies()
    setRechecking(false)
    const fresh = useAppStore.getState().dependencies.find((d) => d.id === 'faster-whisper-local')
    app.toast(
      fresh?.available
        ? { level: 'success', message: 'Local Whisper is now available.' }
        : { level: 'warn', message: 'Local Whisper is still not detected.', hint: fresh?.message }
    )
  }

  return (
    <div className="settings-section stack">
      <div className="section-title">Transcription</div>
      {local && !local.available && (
        <div className="error-box">
          <div className="error-title">{local.message}</div>
          <div className="field-hint">After installing, choose Check again. No restart is needed.</div>
          <div style={{ marginTop: 'var(--space-3)' }}>
            <button className="btn sm" onClick={() => void recheck()} disabled={rechecking}>
              {rechecking ? <Spinner size={12} /> : <RefreshCw size={12} />} {rechecking ? 'Checking…' : 'Check again'}
            </button>
          </div>
        </div>
      )}
      <Field label="Default provider">
        <select className="select" value={t.providerId} onChange={(e) => void app.saveSettings({ transcription: { providerId: e.target.value } })}>
          <option value="import-file">Import a transcript file (offline)</option>
          <option value="faster-whisper-local">Local Whisper — faster-whisper (offline)</option>
          <option value="openai-compatible">OpenAI-compatible cloud endpoint</option>
        </select>
      </Field>
      <Field label="Language" hint="Auto detects the language of each video.">
        <input className="input" defaultValue={t.language} onBlur={(e) => void app.saveSettings({ transcription: { language: e.target.value } })} placeholder="auto" />
      </Field>
      <div className="grid two">
        <Field label="Local Whisper model" hint="Tiny is fastest; medium is most accurate. The model downloads once, then works offline.">
          <select className="select" value={t.whisperModel} onChange={(e) => void app.saveSettings({ transcription: { whisperModel: e.target.value } })}>
            <option value="tiny">tiny — fastest</option>
            <option value="base">base — balanced</option>
            <option value="small">small — better</option>
            <option value="medium">medium — best (slow on CPU)</option>
          </select>
        </Field>
        <Field label="Compute type">
          <select className="select" value={t.whisperCompute} onChange={(e) => void app.saveSettings({ transcription: { whisperCompute: e.target.value } })}>
            <option value="int8">int8 — best for CPU</option>
            <option value="float16">float16 — needs a GPU</option>
            <option value="auto">Auto — pick for this machine</option>
          </select>
        </Field>
      </div>
      <Field label="Decode speed" hint="Fast reads each word once. Higher settings can catch difficult speech but take longer.">
        <select className="select" value={t.whisperBeamSize} onChange={(e) => void app.saveSettings({ transcription: { whisperBeamSize: Number(e.target.value) as 1 | 3 | 5 } })}>
          <option value={1}>Fast — recommended for CPU</option>
          <option value={3}>Balanced</option>
          <option value={5}>Higher accuracy — slower</option>
        </select>
      </Field>
      <div className="dep-row">
        <span className={`status ${local?.available ? 'success' : 'warn'}`}><span className="dot" /></span>
        <span className="dep-msg">{local?.message ?? 'Checking…'}</span>
      </div>
    </div>
  )
}

// =============================================================== video ===

function VideoSection() {
  const app = useAppStore()
  const settings = app.settings!
  const v = settings.video
  return (
    <div className="settings-section stack">
      <div className="section-title">Video & rendering</div>
      <Field label="Default clip length">
        <select className="select" value={v.targetDurationPreset} onChange={(e) => void app.saveSettings({ video: { targetDurationPreset: e.target.value } })}>
          <option value="short">Short — 15–30s</option>
          <option value="medium">Medium — 30–60s</option>
          <option value="long">Long — 60–90s</option>
          <option value="mixed">Mixed — 15–90s</option>
        </select>
      </Field>
      <div className="grid two">
        <Field label="Default output resolution" hint="Applied to new clips; each clip can override it in the editor.">
          <select className="select" value={v.defaultResolution} onChange={(e) => void app.saveSettings({ video: { defaultResolution: e.target.value } })}>
            {RESOLUTION_PRESETS.map((r) => (
              <option key={r.id} value={r.id}>{r.label} — {r.hint}</option>
            ))}
          </select>
        </Field>
        <Field label="Default output quality" hint="Draft is for quick checks; Standard/high/max balance size vs fidelity.">
          <select className="select" value={v.defaultQuality} onChange={(e) => void app.saveSettings({ video: { defaultQuality: e.target.value } })}>
            {QUALITY_PRESETS.map((q) => (
              <option key={q.id} value={q.id}>{q.label} — {q.hint}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Encoder">
        <select className="select" value={v.hardwareEncoding} onChange={(e) => void app.saveSettings({ video: { hardwareEncoding: e.target.value } })}>
          <option value="auto">Auto — hardware when available, CPU fallback</option>
          <option value="cpu">CPU (libx264) — most compatible</option>
          <option value="hardware">Hardware only — fail with a clear error if unavailable</option>
        </select>
        <div className="field-hint">
          Hardware encoders: NVENC, QSV, AMF or VideoToolbox. In Auto mode, a failed hardware render is retried on the CPU.
        </div>
      </Field>
      <Switch
        label="Normalize loudness (EBU R128)"
        hint="Keeps every clip near -16 LUFS, which social platforms expect."
        checked={v.audioNormalize}
        onChange={(val) => void app.saveSettings({ video: { audioNormalize: val } })}
      />
      <div className="divider" />
      <div className="section-title">Silence detection</div>
      <Field label="Mode">
        <select className="select" value={v.silence.mode} onChange={(e) => void app.saveSettings({ video: { silence: { mode: e.target.value } } })}>
          <option value="off">Off — never suggest silence cuts</option>
          <option value="auto">Standard — balanced detection</option>
          <option value="aggressive">Aggressive — remove shorter pauses too</option>
        </select>
      </Field>
      {v.silence.mode !== 'off' && (
        <div className="grid three">
          <Field label={`Min silence — ${v.silence.minSilenceMs} ms`}>
            <input type="range" min={200} max={2000} step={50} defaultValue={v.silence.minSilenceMs}
              onMouseUp={(e) => void app.saveSettings({ video: { silence: { minSilenceMs: parseInt((e.target as HTMLInputElement).value, 10) } } })} />
          </Field>
          <Field label={`Padding — ${v.silence.paddingMs} ms`}>
            <input type="range" min={0} max={500} step={10} defaultValue={v.silence.paddingMs}
              onMouseUp={(e) => void app.saveSettings({ video: { silence: { paddingMs: parseInt((e.target as HTMLInputElement).value, 10) } } })} />
          </Field>
          <Field label={`Max single cut — ${v.silence.maxCutSec}s`}>
            <input type="range" min={1} max={20} step={1} defaultValue={v.silence.maxCutSec}
              onMouseUp={(e) => void app.saveSettings({ video: { silence: { maxCutSec: parseInt((e.target as HTMLInputElement).value, 10) } } })} />
          </Field>
        </div>
      )}
      <Field label={`Render at the same time — ${settings.advanced.renderConcurrency}`} hint="Above 1, several clips render at once. This uses more CPU.">
        <input type="range" min={1} max={4} step={1} defaultValue={settings.advanced.renderConcurrency}
          onMouseUp={(e) => void app.saveSettings({ advanced: { renderConcurrency: parseInt((e.target as HTMLInputElement).value, 10) } })} />
      </Field>
    </div>
  )
}

// ============================================================ captions ===

function CaptionsSection() {
  const app = useAppStore()
  const settings = app.settings!
  return (
    <div className="settings-section stack">
      <div className="section-title">Captions</div>
      <Field label="Default caption style for new clips">
        <select className="select" value={settings.captions.defaultStyleId} onChange={(e) => void app.saveSettings({ captions: { defaultStyleId: e.target.value } })}>
          {CAPTION_STYLES.map((s) => (
            <option key={s.id} value={s.id}>{s.label} — {s.description}</option>
          ))}
        </select>
      </Field>
      <div className="field-hint">
        Size, position, emphasis, capitals and words per cue can be changed for each clip in the editor. Captions are burned in
        at render time with the bundled Inter font, so the output looks the same on every computer.
      </div>
    </div>
  )
}

// ============================================================== export ===

function ExportSection() {
  const app = useAppStore()
  const settings = app.settings!
  return (
    <div className="settings-section stack">
      <div className="section-title">Export</div>
      <Field label="Platform preset" hint="Controls metadata generation targets and export defaults.">
        <select className="select" value={settings.export.preset} onChange={(e) => void app.saveSettings({ export: { preset: e.target.value } })}>
          <option value="generic">Generic Vertical</option>
          <option value="tiktok">TikTok</option>
          <option value="reels">Instagram Reels</option>
          <option value="shorts">YouTube Shorts</option>
        </select>
      </Field>
      <Field label="Filename template" hint="Placeholders: {index} {slug} {title} {date}. Characters Windows does not allow are replaced automatically.">
        <input className="input" defaultValue={settings.export.filenameTemplate} onBlur={(e) => void app.saveSettings({ export: { filenameTemplate: e.target.value } })} />
      </Field>
      <Switch label="Write metadata files (.txt + .json) next to exported clips" checked={settings.export.includeMetadataFiles} onChange={(v) => void app.saveSettings({ export: { includeMetadataFiles: v } })} />
    </div>
  )
}

// ============================================================== storage ==

function StorageSection() {
  const app = useAppStore()
  const [diag, setDiag] = useState<import('@shared/types').DiagnosticsReport | null>(null)
  const [exported, setExported] = useState<string | null>(null)
  const [cleanupReport, setCleanupReport] = useState<StorageCleanupReport | null>(null)
  const [selectedCategories, setSelectedCategories] = useState<Set<StorageCleanupCategoryId>>(new Set())
  const [cleanupResult, setCleanupResult] = useState<StorageCleanupResult | null>(null)
  const [cleanupError, setCleanupError] = useState<unknown>(null)
  const [scanning, setScanning] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [confirmCleanup, setConfirmCleanup] = useState(false)

  const refreshCleanupScan = React.useCallback(async () => {
    setScanning(true)
    setCleanupError(null)
    try {
      const report = await api['storage.cleanup.scan']()
      setCleanupReport(report)
      setSelectedCategories((selected) => new Set([...selected].filter((id) =>
        report.categories.some((category) => category.id === id && category.fileCount > 0)
      )))
    } catch (error) {
      setCleanupError(error)
    } finally {
      setScanning(false)
    }
  }, [])

  React.useEffect(() => {
    void api['app.diagnostics']().then(setDiag).catch(() => undefined)
    void refreshCleanupScan()
  }, [refreshCleanupScan])

  const selectedSummary = cleanupReport?.categories.filter((category) => selectedCategories.has(category.id)) ?? []
  const selectedBytes = selectedSummary.reduce((sum, category) => sum + category.bytes, 0)
  const selectedFiles = selectedSummary.reduce((sum, category) => sum + category.fileCount, 0)

  async function removeSelectedCaches() {
    if (!cleanupReport || selectedCategories.size === 0) return
    setCleaning(true)
    setCleanupError(null)
    try {
      const result = await api['storage.cleanup.run']({
        categories: [...selectedCategories],
        scanToken: cleanupReport.scanToken
      })
      setCleanupResult(result)
      setCleanupReport(result.report)
      setSelectedCategories(new Set())
      setConfirmCleanup(false)
      if (result.removedFiles > 0) {
        app.toast({ level: 'success', message: `Removed ${formatBytes(result.removedBytes)} of cached files.`, hint: 'They are rebuilt when the app needs them again.' })
      } else {
        app.toast({ level: 'info', message: 'Nothing was removed.', hint: 'The files may have changed, or they belong to a project with active jobs.' })
      }
    } catch (error) {
      setCleanupError(error)
    } finally {
      setCleaning(false)
    }
  }

  return (
    <>
      <div className="settings-section stack">
        <div className="section-title">Storage & privacy</div>
        <div className="tiny">Workspace root</div>
        <div className="mono" style={{ wordBreak: 'break-all' }}>{app.appInfo?.workspaceRoot}</div>
        {diag?.disk && (
          <table className="table">
            <tbody>
              <tr><td style={{ color: 'var(--text-3)' }}>Free disk space</td><td>{formatBytes(diag.disk.freeBytes)}</td></tr>
            </tbody>
          </table>
        )}
        <div className="field-hint">
          Each project folder holds its imported media, transcripts, edits, renders, thumbnails and caches. Deleting a project has
          its own confirmation. Exported files are kept.
        </div>
        {isElectron ? (
          <button className="btn" onClick={() => void api['system.openLogsFolder']().catch((e) => app.toast({ level: 'warn', ...errMessage(e) }))}>
            <FolderOpen size={14} /> Open workspace logs
          </button>
        ) : (
          <div className="tiny">Folders can only be opened from the desktop app.</div>
        )}
      </div>

      <div className="settings-section stack">
        <div className="settings-head">
          <div className="section-title">Storage cleanup</div>
          <span className="spacer" />
          <button className="btn sm" onClick={() => void refreshCleanupScan()} disabled={scanning || cleaning}>
            {scanning ? <Spinner size={12} /> : <RefreshCw size={12} />} Scan again
          </button>
        </div>
        <div className="field-hint">
          Only files the app can rebuild are listed. Your videos, imported assets, edits, transcripts, finished renders and exports
          are <strong>never included</strong>.
        </div>
        {cleanupReport && (
          <>
            <div className="row between">
              <span className="tiny">Available to reclaim</span>
              <strong>{formatBytes(cleanupReport.reclaimableBytes)}</strong>
            </div>
            <div className="stack" style={{ gap: 'var(--space-3)' }}>
              {cleanupReport.categories.map((category) => {
                const checked = selectedCategories.has(category.id)
                return (
                  <label
                    key={category.id}
                    className="row"
                    style={{
                      alignItems: 'flex-start', gap: 'var(--space-4)', padding: 'var(--space-4)',
                      border: '1px solid var(--border)', borderRadius: 8,
                      opacity: category.fileCount === 0 ? 0.55 : 1,
                      cursor: category.fileCount === 0 ? 'default' : 'pointer'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={category.fileCount === 0 || scanning || cleaning}
                      onChange={(event) => setSelectedCategories((previous) => {
                        const next = new Set(previous)
                        if (event.target.checked) next.add(category.id)
                        else next.delete(category.id)
                        return next
                      })}
                      style={{ marginTop: 'var(--space-2)' }}
                    />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="row" style={{ justifyContent: 'space-between', gap: 'var(--space-4)' }}>
                        <strong style={{ fontSize: 'var(--fs-sm)' }}>{category.label}</strong>
                        <span className="chip">{category.fileCount === 1 ? '1 file' : `${category.fileCount} files`} · {formatBytes(category.bytes)}</span>
                      </span>
                      <span className="tiny" style={{ display: 'block', marginTop: 'var(--space-2)' }}>{category.description}</span>
                    </span>
                  </label>
                )
              })}
            </div>
            {cleanupReport.skippedActiveProjects > 0 && (
              <div className="tiny">Caches in {cleanupReport.skippedActiveProjects === 1 ? '1 project' : `${cleanupReport.skippedActiveProjects} projects`} with active jobs are kept for now.</div>
            )}
            {cleanupReport.reclaimableBytes === 0 && !scanning && (
              <div className="tiny">No old caches or logs were found.</div>
            )}
          </>
        )}
        {!cleanupReport && scanning && <div className="row"><Spinner size={14} /><span className="tiny">Scanning for files that can be removed…</span></div>}
        {Boolean(cleanupError) && <ErrorBox error={cleanupError} onRetry={() => void refreshCleanupScan()} retryLabel="Scan again" />}
        {cleanupResult && (
          <div className="field-hint">
            Last cleanup: {cleanupResult.removedFiles === 1 ? '1 file' : `${cleanupResult.removedFiles} files`}, {formatBytes(cleanupResult.removedBytes)} removed.
            {cleanupResult.skippedFiles > 0 && ` ${cleanupResult.skippedFiles === 1 ? '1 file had' : `${cleanupResult.skippedFiles} files had`} changed, were in use, or could not be removed.`}
            {cleanupResult.skippedActiveProjects > 0 && ` ${cleanupResult.skippedActiveProjects === 1 ? '1 active project was' : `${cleanupResult.skippedActiveProjects} active projects were`} left untouched.`}
          </div>
        )}
        <div className="row end">
          <button
            className="btn danger"
            disabled={selectedCategories.size === 0 || selectedFiles === 0 || cleaning || scanning}
            onClick={() => setConfirmCleanup(true)}
          >
            {cleaning ? <Spinner size={14} /> : <Trash2 size={14} />} Review removal{selectedBytes > 0 ? ` · ${formatBytes(selectedBytes)}` : ''}
          </button>
        </div>
      </div>

      {confirmCleanup && (
        <Modal
          title="Remove these files?"
          onClose={cleaning ? undefined : () => setConfirmCleanup(false)}
          footer={(
            <>
              <button className="btn" onClick={() => setConfirmCleanup(false)} disabled={cleaning}>Keep files</button>
              <button className="btn danger" onClick={() => void removeSelectedCaches()} disabled={cleaning || selectedCategories.size === 0}>
                {cleaning ? <Spinner size={14} /> : <Trash2 size={14} />} Remove {selectedFiles === 1 ? '1 file' : `${selectedFiles} files`}
              </button>
            </>
          )}
        >
          <p>This removes up to <strong>{formatBytes(selectedBytes)}</strong> across {selectedFiles === 1 ? '1 file' : `${selectedFiles} files`}.</p>
          <ul className="doc-list">
            {selectedSummary.map((category) => (
              <li key={category.id} style={{ marginBottom: 'var(--space-3)' }}>
                {category.label}: {category.fileCount === 1 ? '1 file' : `${category.fileCount} files`}, {formatBytes(category.bytes)}
                {category.examples.length > 0 && (
                  <details style={{ marginTop: 'var(--space-2)' }}>
                    <summary className="tiny" style={{ cursor: 'pointer' }}>Show file locations</summary>
                    <ul className="mono tiny doc-sublist">
                      {category.examples.map((example) => <li key={example}>{example}</li>)}
                      {category.additionalFileCount > 0 && <li>and {category.additionalFileCount === 1 ? '1 more file' : `${category.additionalFileCount} more files`}</li>}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
          <div className="field-hint" style={{ marginTop: 'var(--space-4)' }}>
            The app checks the files again before deleting and stops if they changed. Files used by active jobs, original media,
            finished renders and exports are never removed.
          </div>
        </Modal>
      )}

      <div className="settings-section stack">
        <div className="section-title">Diagnostics export</div>
        <div className="field-hint">
          A JSON report with the app version, OS, enabled providers, FFmpeg version, database version, recent error codes and
          settings that hold no secrets. <strong>It never includes API keys.</strong>
        </div>
        <div className="row">
          <button
            className="btn"
            onClick={async () => {
              try {
                const result = await api['system.exportDiagnostics']()
                setExported(result.path)
                app.toast({ level: 'success', message: 'Diagnostics report saved.', actionLabel: isElectron ? 'Show in folder' : undefined, action: isElectron ? () => void api['system.revealPath']({ path: result.path }) : undefined })
              } catch (err) {
                app.toast({ level: 'error', ...errMessage(err) })
              }
            }}
          >
            <Download size={14} /> Export diagnostics report
          </button>
          {exported && <span className="tiny mono">{exported}</span>}
        </div>
      </div>
    </>
  )
}

// ============================================================= advanced ==

function AdvancedSection() {
  const app = useAppStore()
  const settings = app.settings!
  const deps = app.dependencies
  const ffmpeg = deps.find((d) => d.id === 'ffmpeg')
  const ffprobe = deps.find((d) => d.id === 'ffprobe')

  return (
    <div className="settings-section stack">
      <div className="section-title">Advanced</div>
      <Field label="FFmpeg path override" hint="Leave blank to detect it: system PATH first, then the bundled copy.">
        <input className="input mono" defaultValue={settings.advanced.ffmpegPath} placeholder={ffmpeg?.available ? `auto: ${ffmpeg.message}` : 'not detected'} onBlur={(e) => void app.saveSettings({ advanced: { ffmpegPath: e.target.value } })} />
      </Field>
      <Field label="FFprobe path override">
        <input className="input mono" defaultValue={settings.advanced.ffprobePath} placeholder={ffprobe?.available ? 'auto-detected' : 'not detected'} onBlur={(e) => void app.saveSettings({ advanced: { ffprobePath: e.target.value } })} />
      </Field>
      <Field label="Log level">
        <select className="select" value={settings.advanced.logLevel} onChange={(e) => void app.saveSettings({ advanced: { logLevel: e.target.value } })}>
          <option value="debug">debug — everything, for support</option>
          <option value="info">info — normal messages</option>
          <option value="warn">warn — warnings and errors</option>
          <option value="error">error — errors only</option>
        </select>
      </Field>
      <div className="divider" />
      <div className="section-title">Dependency status</div>
      {deps.map((d) => (
        <div className="dep-row" key={d.id}>
          <span className={`status ${d.available ? 'success' : 'danger'}`}><span className="dot" /></span>
          <span className="dep-name">{d.label}</span>
          <span className="dep-msg">{d.message}{d.version ? ` (v${d.version})` : ''}</span>
          {!d.available && d.fixHint && <span className="chip warn">{d.fixHint}</span>}
        </div>
      ))}
    </div>
  )
}
