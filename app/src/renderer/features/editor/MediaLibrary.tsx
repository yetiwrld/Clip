import React, { useMemo, useRef, useState } from 'react'
import { AudioLines, FileVideo2, Image as ImageIcon, Pencil, Play, Plus, RefreshCw, Search, Trash2, Upload, Volume2 } from 'lucide-react'
import type { ProjectAsset } from '@shared/types'
import { droppedFilePath, mediaUrl } from '../../api/client'
import { plural } from '../../copy/labels'

export function MediaLibrary(props: {
  assets: ProjectAsset[]
  importing: boolean
  onImport: () => void
  onRename: (asset: ProjectAsset) => void
  onRemove: (asset: ProjectAsset) => void
  onRelink: (asset: ProjectAsset) => void
  onDropFiles: (paths: string[]) => void
  /** One-click placement: the same result as dropping the asset on a track. */
  onAddToTimeline?: (asset: ProjectAsset) => void
  filterOverride?: 'all' | ProjectAsset['mediaType']
  sectionTitle?: string
  importLabel?: string
  waveforms?: Record<string, { peaks: number[]; duration: number }>
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | ProjectAsset['mediaType']>('all')
  const [previewId, setPreviewId] = useState<string | null>(null)
  const previewRefs = useRef(new Map<string, HTMLAudioElement>())
  const activeFilter = props.filterOverride ?? filter
  const assets = useMemo(() => props.assets.filter((asset) =>
    (activeFilter === 'all' || asset.mediaType === activeFilter) &&
    asset.name.toLowerCase().includes(query.trim().toLowerCase())
  ), [props.assets, activeFilter, query])

  function beginDrag(event: React.DragEvent, asset: ProjectAsset) {
    event.dataTransfer.setData('application/x-clipwright-asset', asset.id)
    event.dataTransfer.setData('text/plain', asset.id)
    event.dataTransfer.effectAllowed = 'copy'
  }

  return <section className="asset-library" aria-label="Project media library"
    onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' } }}
    onDrop={(event) => {
      if (!event.dataTransfer.files.length) return
      event.preventDefault()
      const paths = Array.from(event.dataTransfer.files).map(droppedFilePath).filter((value): value is string => Boolean(value))
      if (paths.length) props.onDropFiles(paths)
    }}>
    <div className="asset-library-head">
      <div><strong>{props.sectionTitle ?? 'Media library'}</strong><span className="tiny muted">{plural(props.assets.length, 'asset')} · reusable in this project</span></div>
      <button className="btn sm" onClick={props.onImport} disabled={props.importing}>
        <Upload size={12} /> {props.importing ? 'Importing…' : props.importLabel ?? 'Import media'}
      </button>
    </div>
    <div className="asset-library-tools">
      <label className="asset-search"><Search size={14} /><input aria-label="Search media assets" placeholder="Search assets" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      {!props.filterOverride && <select className="select sm" aria-label="Filter media assets" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
        <option value="all">All media</option><option value="video">Video</option><option value="audio">Audio</option><option value="image">Images</option>
      </select>}
    </div>
    {assets.length === 0 ? <div className="asset-empty">{props.assets.length ? 'No assets match this search.' : 'Import video, audio or image files, then drag an asset onto a timeline track or press + to place it at the playhead.'}</div> :
      <div className="asset-grid">{assets.map((asset) => {
        const Icon = asset.mediaType === 'audio' ? AudioLines : asset.mediaType === 'image' ? ImageIcon : FileVideo2
        return <article key={asset.id} className={`asset-card${asset.missing ? ' missing' : ''}`} draggable={!asset.missing} onDragStart={(event) => beginDrag(event, asset)} title="Drag onto a compatible timeline track, or press + to place it at the playhead">
          <div className="asset-thumb">{asset.mediaType !== 'audio' && !asset.missing && asset.thumbnailPath ? <img src={mediaUrl(asset.thumbnailPath)} alt="" draggable={false} /> : asset.mediaType === 'audio' && props.waveforms?.[asset.id] ? <MiniWaveform peaks={props.waveforms[asset.id].peaks} /> : <Icon size={20} />}</div>
          <div className="asset-copy"><strong title={asset.name}>{asset.name}</strong><span className="tiny muted">{asset.mediaType.replace(/^./, (c) => c.toUpperCase())} · {asset.duration ? `${asset.duration.toFixed(1)}s · ` : ''}{(asset.sizeBytes / 1048576).toFixed(1)} MB</span>{asset.missing && <span className="tiny danger">File missing</span>}</div>
          <div className="asset-actions">
            {asset.mediaType === 'audio' && !asset.missing && <button className="btn ghost sm icon" title={previewId === asset.id ? 'Stop audio preview' : 'Preview audio'} aria-label={`${previewId === asset.id ? 'Stop' : 'Preview'} ${asset.name}`} onClick={(event) => {
              event.stopPropagation()
              const audio = previewRefs.current.get(asset.id)
              if (!audio) return
              if (previewId === asset.id) { audio.pause(); audio.currentTime = 0; setPreviewId(null) }
              else { for (const [id, element] of previewRefs.current) { if (id !== asset.id) { element.pause(); element.currentTime = 0 } }; void audio.play(); setPreviewId(asset.id) }
            }}>{previewId === asset.id ? <Volume2 size={14} /> : <Play size={14} />}</button>}
            <button className="btn ghost sm icon" title="Add to timeline at the playhead" aria-label={`Add ${asset.name} to the timeline`} disabled={asset.missing} onClick={(event) => { event.stopPropagation(); props.onAddToTimeline?.(asset) }}><Plus size={14} /></button>
            {asset.missing && <button className="btn ghost sm icon" title="Relink missing media" aria-label={`Relink ${asset.name}`} onClick={() => props.onRelink(asset)}><RefreshCw size={14} /></button>}
            <button className="btn ghost sm icon" title="Rename asset" aria-label={`Rename ${asset.name}`} onClick={() => props.onRename(asset)}><Pencil size={14} /></button>
            <button className="btn ghost sm icon danger" title="Remove from project. The original file is kept." aria-label={`Remove ${asset.name} from project`} onClick={() => props.onRemove(asset)}><Trash2 size={14} /></button>
          </div>
          {asset.mediaType === 'audio' && !asset.missing && <audio ref={(element) => { if (element) previewRefs.current.set(asset.id, element); else previewRefs.current.delete(asset.id) }} src={mediaUrl(asset.path)} preload="metadata" onEnded={() => setPreviewId(null)} />}
        </article>
      })}</div>}
  </section>
}

function MiniWaveform(props: { peaks: number[] }) {
  const peaks = props.peaks
  const count = Math.min(48, peaks.length)
  return <svg className="asset-waveform" viewBox={`0 0 ${count} 24`} role="img" aria-label="Audio waveform">
    {Array.from({ length: count }, (_, index) => {
      const value = peaks[Math.floor(index * peaks.length / count)] ?? 0
      const height = Math.max(1, value * 21)
      return <rect key={index} x={index + 0.2} y={(24 - height) / 2} width="0.65" height={height} rx="0.25" />
    })}
  </svg>
}
