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

/** Tolerance for identifying a frame-timed keyframe selected on a seconds UI. */
export function frameTimeTolerance(fps: number | null | undefined): number {
  return frameDuration(fps) / 2 + 1e-6
}

function gcd(a: number, b: number): number {
  while (b !== 0) [a, b] = [b, a % b]
  return a || 1
}
