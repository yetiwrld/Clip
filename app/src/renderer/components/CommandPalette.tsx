import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Search, CornerDownLeft } from 'lucide-react'
import { useAppStore } from '../stores/app'
import { useCommandRegistry } from '../commands/registry'
import { fuzzyScore, formatShortcut } from '../commands/keys'
import { CATEGORY_ORDER, type Command, type CommandCategory } from '../commands/types'

const RECENTS_KEY = 'clipwright.palette.recents'
const MAX_RESULTS = 60

function loadRecents(): string[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const parsed = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string').slice(0, 6) : []
  } catch {
    return []
  }
}

function rememberRecent(id: string): void {
  try {
    if (typeof localStorage === 'undefined') return
    const next = [id, ...loadRecents().filter((entry) => entry !== id)].slice(0, 6)
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
  } catch {
    /* a full or blocked storage must not break the palette */
  }
}

interface Row {
  command: Command
  index: number
}

interface Group {
  label: string
  rows: Row[]
}

function shortcutOf(command: Command): string {
  if (!command.shortcut) return ''
  // A command may answer to more than one binding; show them all.
  const specs = Array.isArray(command.shortcut) ? command.shortcut : [command.shortcut]
  return specs.map((spec) => formatShortcut(spec)).join(' / ')
}

/**
 * Command palette.
 *
 * One overlay, two modes: run a command, or read the shortcut reference. It is
 * a listbox with a combobox search field, so arrow keys, Enter and Escape work
 * the way screen-reader users expect, and focus returns to whatever had it
 * before the palette opened.
 */
export function CommandPalette() {
  const open = useAppStore((state) => state.paletteOpen)
  const mode = useAppStore((state) => state.paletteMode)
  const close = useAppStore((state) => state.closePalette)
  const openPalette = useAppStore((state) => state.openPalette)
  const commands = useCommandRegistry((state) => state.commands)

  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  const available = useMemo(
    () => commands.filter((command) => (!command.enabled || command.enabled())),
    [commands, open]
  )

  // ------------------------------------------------------------ grouping --
  const groups = useMemo<Group[]>(() => {
    const trimmed = query.trim()

    if (mode === 'shortcuts') {
      const withShortcut = available.filter((command) => command.shortcut)
      const matches = trimmed
        ? withShortcut
            .map((command) => ({ command, score: fuzzyScore(trimmed, `${command.title} ${(command.keywords ?? []).join(' ')}`) }))
            .filter((entry): entry is { command: Command; score: number } => entry.score != null)
            .sort((a, b) => b.score - a.score)
            .map((entry) => entry.command)
        : [...withShortcut].sort((a, b) => a.title.localeCompare(b.title))
      return byCategory(matches)
    }

    if (!trimmed) {
      const recentIds = loadRecents()
      const byId = new Map(available.map((command) => [command.id, command]))
      const recents = recentIds.map((id) => byId.get(id)).filter((command): command is Command => Boolean(command))
      const rest = available
        .filter((command) => !command.hidden && !recents.some((recent) => recent.id === command.id))
        .filter((command) => command.id !== 'palette.open' && command.id !== 'palette.shortcuts')
      const groupsOut: Group[] = []
      if (recents.length > 0) {
        groupsOut.push({ label: 'Recent', rows: recents.map((command, index) => ({ command, index })) })
      }
      // Indices must be global across groups: arrow keys walk one flat list.
      return [...groupsOut, ...byCategory(rest, recents.length)]
    }

    const scored = available
      .filter((command) => !command.hidden)
      .map((command) => {
        const haystack = `${command.title} ${(command.keywords ?? []).join(' ')} ${command.category}`
        const score = fuzzyScore(trimmed, command.title) ?? fuzzyScore(trimmed, haystack)
        return score == null ? null : { command, score }
      })
      .filter((entry): entry is { command: Command; score: number } => entry != null)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS)
      .map((entry) => entry.command)

    return byCategory(scored)
  }, [available, mode, query])

  const flat = useMemo(() => groups.flatMap((group) => group.rows.map((row) => row.command)), [groups])

  // Reset selection whenever the result set changes shape.
  useEffect(() => {
    setActive(0)
  }, [query, mode, open])

  useEffect(() => {
    if (!open) return
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => {
      cancelAnimationFrame(frame)
      returnFocusRef.current?.focus?.()
    }
  }, [open])

  // Keep the highlighted row visible without moving the page.
  useEffect(() => {
    if (!open) return
    const id = flat[active]?.id
    if (!id) return
    document.getElementById(`palette-row-${id}`)?.scrollIntoView({ block: 'nearest' })
  }, [active, flat, open])

  if (!open) return null

  const current = flat[active]

  function run(command: Command) {
    rememberRecent(command.id)
    close()
    // Let the overlay unmount before the command moves focus or changes view.
    window.setTimeout(() => command.run(), 0)
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const mod = event.ctrlKey || event.metaKey
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => (flat.length === 0 ? 0 : (index + 1) % flat.length))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => (flat.length === 0 ? 0 : (index - 1 + flat.length) % flat.length))
    } else if (event.key === 'Home' && !event.shiftKey) {
      event.preventDefault()
      setActive(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setActive(Math.max(0, flat.length - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (current && mode === 'commands') run(current)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      close()
    } else if (event.key === 'Tab') {
      // Focus stays in the palette; the palette is the only thing that can
      // receive keys while it is open.
      event.preventDefault()
    } else if (mod && (event.key === 'k' || event.key === 'K')) {
      event.preventDefault()
      close()
    } else if (mod && event.key === '/') {
      event.preventDefault()
      openPalette(mode === 'commands' ? 'shortcuts' : 'commands')
    }
  }

  return (
    <div
      className="palette-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'commands' ? 'Command palette' : 'Keyboard shortcuts'}
      >
        <div className="palette-search">
          <Search size={14} className="palette-search-icon" aria-hidden="true" />
          <input
            ref={inputRef}
            className="palette-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={mode === 'commands' ? 'Search commands…' : 'Search shortcuts…'}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-autocomplete="list"
            aria-activedescendant={current ? `palette-row-${current.id}` : undefined}
            aria-label={mode === 'commands' ? 'Search commands' : 'Search shortcuts'}
            spellCheck={false}
            autoComplete="off"
          />
          <kbd className="kbd palette-esc">Esc</kbd>
        </div>

        <div className="palette-list" id="palette-list" role="listbox" aria-label={mode === 'commands' ? 'Commands' : 'Shortcuts'} ref={listRef}>
          {groups.map((group) => (
            <div key={group.label} className="palette-group" role="group" aria-label={group.label}>
              <div className="palette-group-title" aria-hidden="true">{group.label}</div>
              {group.rows.map((row) => {
                const shortcut = shortcutOf(row.command)
                const selected = current?.id === row.command.id
                return (
                  <div
                    key={row.command.id}
                    id={`palette-row-${row.command.id}`}
                    role="option"
                    aria-selected={selected}
                    className={`palette-item${selected ? ' active' : ''}${mode === 'shortcuts' ? ' static' : ''}`}
                    onMouseMove={() => setActive(row.index)}
                    onClick={() => {
                      if (mode === 'commands') run(row.command)
                    }}
                  >
                    <span className="palette-item-main">
                      <span className="palette-item-title">{row.command.title}</span>
                      {row.command.hint && <span className="palette-item-hint">{row.command.hint}</span>}
                    </span>
                    {shortcut && <kbd className="kbd palette-key">{shortcut}</kbd>}
                  </div>
                )
              })}
            </div>
          ))}

          {flat.length === 0 && (
            <div className="palette-empty">
              <strong>No matches</strong>
              <span>
                {mode === 'commands'
                  ? 'Try “project”, “render”, “export” or a project name.'
                  : 'Try the key you are looking for, or a command name.'}
              </span>
            </div>
          )}
        </div>

        <div className="palette-foot">
          <span className="palette-foot-hint">
            <kbd className="kbd">↑</kbd>
            <kbd className="kbd">↓</kbd> to navigate
          </span>
          <span className="palette-foot-hint">
            <kbd className="kbd"><CornerDownLeft size={12} aria-hidden="true" /></kbd> to {mode === 'commands' ? 'run' : 'search'}
          </span>
          <span className="palette-foot-hint">
            <kbd className="kbd">Esc</kbd> to close
          </span>
          <button
            type="button"
            className="palette-mode"
            onClick={() => openPalette(mode === 'commands' ? 'shortcuts' : 'commands')}
          >
            {mode === 'commands' ? 'Keyboard shortcuts' : 'Commands'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Group by category, numbering rows continuously so arrow keys walk one list. */
function byCategory(commands: Command[], startIndex = 0): Group[] {
  const buckets = new Map<CommandCategory, Command[]>()
  for (const command of commands) {
    buckets.set(command.category, [...(buckets.get(command.category) ?? []), command])
  }
  let cursor = startIndex
  return CATEGORY_ORDER.filter((category) => buckets.has(category)).map((category) => {
    const rows = (buckets.get(category) ?? []).map((command) => {
      const index = cursor
      cursor += 1
      return { command, index }
    })
    return { label: category, rows }
  })
}
