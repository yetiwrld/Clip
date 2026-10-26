/**
 * Where the window was, and whether that is still somewhere you can reach.
 *
 * The saved state is a plain JSON file next to the workspace (not in it), so a
 * corrupt or hand-edited file costs a window position and nothing else. Every
 * value is validated on read and clamped in DIP against the displays that exist
 * *now*: a laptop that was docked yesterday to a 4K monitor must not open its
 * window off the edge of the built-in screen. Windows can also change scaling
 * and remove a display while the app is running, so the same function is used
 * for the live `display-*` events, not only at startup.
 *
 * Coordinates are DIP (device-independent pixels), which is what Electron's
 * BrowserWindow API uses on every platform, so 150% scaling does not leave the
 * window a third smaller than it was.
 */

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface StoredWindowState {
  bounds: WindowBounds
  maximized: boolean
}

/** The part of a display this module needs: its usable area, in DIP. */
export interface WorkArea {
  x: number
  y: number
  width: number
  height: number
}

export const DEFAULT_WINDOW_SIZE = { width: 1440, height: 900 } as const
export const MIN_WINDOW_SIZE = { width: 1024, height: 680 } as const

/** A window must show at least this much of itself to count as on-screen. */
const VISIBLE_EDGE_X = 120
const VISIBLE_TOP = 40

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function primaryOf(displays: WorkArea[]): WorkArea {
  return displays[0] ?? { x: 0, y: 0, width: DEFAULT_WINDOW_SIZE.width, height: DEFAULT_WINDOW_SIZE.height }
}

function centred(area: WorkArea, size: { width: number; height: number }): WindowBounds {
  return {
    x: Math.round(area.x + (area.width - size.width) / 2),
    y: Math.round(area.y + (area.height - size.height) / 2),
    width: size.width,
    height: size.height
  }
}

function fitsOn(bounds: WindowBounds, area: WorkArea): boolean {
  const overlapX = Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x)
  const overlapY = Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y)
  // Enough of the window to grab its title bar, not merely one pixel of it.
  return overlapX >= Math.min(VISIBLE_EDGE_X, bounds.width) && overlapY >= Math.min(VISIBLE_TOP, bounds.height)
}

/**
 * Turn whatever was on disk into a position that is definitely usable.
 * Unknown or invalid input is not an error: the window opens centred at its
 * default size, exactly like a first launch.
 */
export function normalizeWindowState(
  saved: unknown,
  displays: WorkArea[],
  minSize: { width: number; height: number } = MIN_WINDOW_SIZE
): StoredWindowState {
  const areas = displays.length > 0 ? displays : [primaryOf(displays)]
  const primary = areas[0]
  const record = isRecord(saved) ? saved : {}
  const rawBounds = isRecord(record.bounds) ? record.bounds : {}
  const width = finite(rawBounds.width)
  const height = finite(rawBounds.height)
  const x = finite(rawBounds.x)
  const y = finite(rawBounds.y)
  const maximized = record.maximized === true

  if (width === null || height === null || x === null || y === null) {
    return { bounds: centred(primary, DEFAULT_WINDOW_SIZE), maximized }
  }

  // A window smaller than the minimum is not restorable: grow it to the floor.
  const target = { x, y, width, height }
  const onScreen = areas.find((area) => fitsOn(target, area))
  if (!onScreen) {
    // Keep the user's size if it still fits somewhere, but move it to the
    // primary display instead of leaving it where they cannot reach it.
    const size = {
      width: Math.min(primary.width, Math.max(minSize.width, width)),
      height: Math.min(primary.height, Math.max(minSize.height, height))
    }
    return { bounds: centred(primary, size), maximized }
  }

  // Clamp against the display it actually lives on, so a window saved on a
  // bigger screen cannot be wider than the one it opens on.
  const width_ = Math.min(onScreen.width, Math.max(minSize.width, width))
  const height_ = Math.min(onScreen.height, Math.max(minSize.height, height))
  const x_ = Math.min(Math.max(x, onScreen.x), onScreen.x + onScreen.width - width_)
  const y_ = Math.min(Math.max(y, onScreen.y), onScreen.y + onScreen.height - height_)
  return { bounds: { x: x_, y: y_, width: width_, height: height_ }, maximized }
}

export function serializeWindowState(bounds: WindowBounds, maximized: boolean): StoredWindowState {
  return {
    bounds: {
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height)
    },
    maximized
  }
}
