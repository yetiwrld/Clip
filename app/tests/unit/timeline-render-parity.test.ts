import { describe, expect, it } from 'vitest'
import type { ClipTimeline, ProjectAsset, TimelineItem, TimelineTrack } from '../../src/shared/types'
import { buildTimelineLayerPlan } from '../../src/main/services/rendering/plan'

const fileOnDisk = __filename

function makeAsset(id: string, mediaType: ProjectAsset['mediaType'], audioChannels: number | null = null): ProjectAsset {
  return {
    id, projectId: 'project-1', name: id, originalName: id, mediaType, path: fileOnDisk,
    thumbnailPath: null, duration: 30, width: 1920, height: 1080, audioChannels,
    sizeBytes: 1, missing: false, createdAt: '2026-01-01T00:00:00.000Z'
  }
}

function makeItem(assetId: string, trackId: string, patch: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: 'item-1', assetId, trackId, startTime: 0, sourceIn: 0, sourceOut: 1,
    volume: 1, muted: false, fadeIn: 0, fadeOut: 0, speed: 1, loop: false,
    x: 0, y: 0, scale: 1, rotation: 0, opacity: 1,
    ...patch
  }
}

function makeTrack(id: string, type: TimelineTrack['type']): TimelineTrack {
  return { id, name: id, type, order: 0, muted: false, hidden: false, locked: false }
}

describe('timeline preview/export parity', () => {
  it('shifts still-image PTS into the selected output window and uses shared center geometry', () => {
    const image = makeAsset('image-1', 'image')
    const track = makeTrack('graphics', 'image')
    const item = makeItem(image.id, track.id, {
      startTime: 5, sourceOut: 1, x: 0.5, y: -0.5, scale: 0.5, opacity: 0.8
    })
    const timeline: ClipTimeline = { tracks: [track], items: [item], snapEnabled: true }
    const plan = buildTimelineLayerPlan({
      timeline, assets: [image], kept: [{ start: 0, end: 10 }],
      target: { w: 1080, h: 1920 }, firstInput: 1, outputDuration: 10
    })

    expect(plan.inputs).toContain('1.000')
    expect(plan.filters.join(';')).toContain('setpts=PTS-STARTPTS+5.000/TB')
    expect(plan.filters.join(';')).toContain('overlay=x=\'(0.75000)*W-w/2\':y=\'(0.25000)*H-h/2\'')
    expect(plan.filters.join(';')).toContain("enable='gte(t,5.000)*lt(t,6.000)'")
  })

  it('uses FFmpeg-compatible per-channel audio delay syntax', () => {
    const audio = makeAsset('audio-1', 'audio', 2)
    const track = makeTrack('music', 'audio')
    const item = makeItem(audio.id, track.id, { startTime: 2, sourceOut: 4 })
    const timeline: ClipTimeline = { tracks: [track], items: [item], snapEnabled: true }
    const plan = buildTimelineLayerPlan({
      timeline, assets: [audio], kept: [{ start: 0, end: 6 }],
      target: { w: 1920, h: 1080 }, firstInput: 1, outputDuration: 6
    })

    expect(plan.filters.join(';')).toContain('adelay=2000|2000')
    expect(plan.filters.join(';')).not.toContain('all=1')
  })
})
