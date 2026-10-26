/** Frame-rate adapters for legacy records that persist numeric FPS and seconds. */
export interface RationalFrameRate { numerator: number; denominator: number }

const COMMON_RATES: Array<[number, number]> = [
  [24000, 1001], [30000, 1001], [60000, 1001], [120000, 1001]
]

/** Preserve common NTSC rates exactly while accepting existing numeric FPS values. */
export function rationalFrameRate(value: number | null | undefined): RationalFrameRate {
  const fps = value != null && Number.isFinite(value) && value >= 1 && value <= 120 ? value : 25
  for (const [numerator, denominator] of COMMON_RATES) {
    if (Math.abs(fps - numerator / denominator) < 0.002) return { numerator, denominator }
  }
  const denominator = 1_000_000
  const numerator = Math.round(fps * denominator)
  const divisor = gcd(numerator, denominator)
  return { numerator: numerator / divisor, denominator: denominator / divisor }
}

export function frameDuration(fps: number | null | undefined): number {
  const rate = rationalFrameRate(fps)
  return rate.denominator / rate.numerator
}

export function frameTime(frameIndex: number, fps: number | null | undefined): number {
  const rate = rationalFrameRate(fps)
  return frameIndex * rate.denominator / rate.numerator
}

/**
 * Round a timeline time onto the project's frame grid.
 *
 * Pointer maths produces arbitrary floats; a professional edit stores times a
 * frame can actually be cut at. Six decimals keeps 23.976 fps grids exact
 * enough for the payload schema without exposing float noise to the UI.
 */
export function snapTimeToFrame(seconds: number, fps: number | null | undefined): number {
  if (!Number.isFinite(seconds)) return 0
  const duration = frameDuration(fps)
  // A timeline time is never negative, so the clamp belongs here rather than in
  // every caller.
  const frames = Math.max(0, Math.round(seconds / duration))
  return Number((frames * duration).toFixed(6))
}

/** Whole frames between two times, rounded — used by the nudge commands. */
export function framesBetween(from: number, to: number, fps: number | null | undefined): number {
  return Math.round((to - from) / frameDuration(fps))
}

/** Tolerance for identifying a frame-timed keyframe selected on a seconds UI. */
export function frameTimeTolerance(fps: number | null | undefined): number {
  return frameDuration(fps) / 2 + 1e-6
}

function gcd(a: number, b: number): number {
  while (b !== 0) [a, b] = [b, a % b]
  return a || 1
}
