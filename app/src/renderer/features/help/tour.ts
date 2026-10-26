import type { View } from '../../stores/app'

/**
 * The guided tour: six short stops, in the order a new user needs them.
 *
 * Each stop points at a real element by its `data-tour` marker. Nothing is
 * mocked or drawn from a description — if the app moves a control, the tour
 * moves with it, and if an element is missing (another screen, a narrow window)
 * the step is skipped instead of pointing at nothing.
 *
 * Deliberately short. The tour is an orientation for the first five minutes,
 * not a manual: everything else lives in Help.
 */

export interface TourStep {
  id: string
  /** Value of the `data-tour` attribute on the element to highlight. */
  target: string
  title: string
  body: string
  /** Screens this stop makes sense on. Omitted means any screen. */
  views?: View[]
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'projects',
    target: 'projects',
    title: 'Your projects live here',
    body: 'A project is one video plus everything made from it: transcript, moments, clips and renders. Start a new one on the Projects screen, or open one from the list.',
    views: ['dashboard']
  },
  {
    id: 'create',
    target: 'create-bar',
    title: 'Start with one long video',
    body: 'Import a file or paste a link you have the right to use. Everything after this — transcript, cutting, captions — works from that source.',
    views: ['dashboard']
  },
  {
    id: 'queue',
    target: 'queue',
    title: 'Renders keep running',
    body: 'Transcribing, analysing and rendering are background jobs. Close this screen or keep editing — the queue shows progress and keeps jobs you can resume.',
    views: ['dashboard', 'project', 'queue', 'settings', 'help']
  },
  {
    id: 'help',
    target: 'help',
    title: 'Help is always one click away',
    body: 'Getting started, the shortcut list, a setup check and troubleshooting live here. You can replay this tour from Help at any time.',
    views: ['dashboard', 'project', 'queue', 'settings', 'help']
  },
  {
    id: 'shortcuts',
    target: 'shortcuts',
    title: 'Find any action',
    body: 'The command palette searches every screen and command. The same shortcut opens the full key list, and the editor has its own set.',
    views: ['dashboard', 'project', 'queue', 'settings', 'help']
  },
  {
    id: 'settings',
    target: 'settings',
    title: 'Set up once',
    body: 'Check that FFmpeg is found, choose where transcripts come from, and add an AI key if you want cloud analysis. Local features work without an account.',
    views: ['dashboard', 'project', 'queue', 'settings', 'help']
  }
]

/**
 * The stops that can be shown right now: this screen's stops, and only those
 * whose target element is actually on the page.
 */
export function availableSteps(view: View, hasTarget: (target: string) => boolean): TourStep[] {
  return TOUR_STEPS.filter((step) => {
    if (step.views && !step.views.includes(view)) return false
    return hasTarget(step.target)
  })
}
