/**
 * Transport rules.
 *
 * The playhead is a free cursor on the timeline, not a cursor inside the
 * selected clip. These helpers keep that distinction in one testable place.
 */

/**
 * Where playback begins when the user presses play.
 *
 * The playhead is allowed to sit anywhere on the timeline. Pressing play only
 * moves it when it already rests at (or past) the end, where starting again
 * from the clip's in-point is what "play" means. Anywhere else it starts from
 * the current frame — restarting the video because the playhead was outside the
 * selected clip is what made the timeline feel like it was jumping around.
 */
export function playFromTime(currentTime: number, mediaDuration: number, restartAt: number): number {
  const time = Number.isFinite(currentTime) ? Math.max(0, currentTime) : 0
  const end = Number.isFinite(mediaDuration) ? Math.max(0, mediaDuration) : 0
  if (end > 0 && time >= end - 0.05) return Math.max(0, Math.min(restartAt, end))
  return time
}
