import { useEffect } from 'react'
import { useAppStore } from '../stores/app'
import { pickCommand, useCommandRegistry } from './registry'

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null
  if (!element) return false
  const tag = element.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return element.isContentEditable
}

/** Any dialog other than the palette takes the keyboard. */
function isModalOpen(): boolean {
  if (typeof document === 'undefined') return false
  return Boolean(document.querySelector('.modal-backdrop, [aria-modal="true"]:not(.palette)'))
}

/**
 * The single keyboard listener for the whole renderer.
 *
 * Screens never attach their own: they register commands (see screenCommands)
 * and this dispatcher decides whether the key belongs to the user's text, a
 * dialog, the palette, or a command.
 */
export function useGlobalShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return
      const state = useAppStore.getState()
      const command = pickCommand(useCommandRegistry.getState().commands, event, {
        inEditable: isEditableTarget(event.target),
        inModal: isModalOpen(),
        paletteOpen: state.paletteOpen
      })
      if (!command) return
      event.preventDefault()
      event.stopPropagation()
      command.run()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
