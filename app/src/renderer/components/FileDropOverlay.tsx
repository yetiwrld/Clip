/**
 * The window-wide drop target.
 *
 * Dropping a file anywhere in the app imports it: on the Projects page it starts
 * a project, inside a project it becomes an asset. The panel-level drop targets
 * still win where they exist (the media library and the timeline handle their
 * own drops and call `preventDefault`), so this only speaks for the space in
 * between.
 *
 * The overlay itself never takes the pointer; it is a hint drawn over the
 * window while files are held above it, so the drop lands on whatever is under
 * the cursor.
 */

import { useEffect, useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { droppedFilePath, isElectron } from '../api/client'
import { uploadDroppedFile } from '../api/upload'
import { useAppStore } from '../stores/app'
import { importDroppedPaths } from '../features/import/importFiles'
import { SUPPORTED_COPY } from '@shared/platform/files'

/** True for a drag that carries files from outside the app. */
function carriesFiles(event: DragEvent): boolean {
  const types = event.dataTransfer?.types
  if (!types) return false
  for (const type of Array.from(types)) if (type === 'Files') return true
  return false
}

export function FileDropOverlay() {
  const toast = useAppStore((state) => state.toast)
  const [active, setActive] = useState(false)
  const depth = useRef(0)
  const importing = useRef(false)

  useEffect(() => {
    const onDragEnter = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      depth.current += 1
      setActive(true)
    }
    const onDragOver = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      // Without this the drop event never fires.
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    }
    const onDragLeave = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setActive(false)
    }
    const onDrop = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      depth.current = 0
      setActive(false)
      // A panel that handled the drop already called preventDefault.
      if (event.defaultPrevented) return
      event.preventDefault()
      const files = Array.from(event.dataTransfer?.files ?? [])
      if (files.length === 0 || importing.current) return

      const paths = files.map((file) => droppedFilePath(file)).filter((path): path is string => Boolean(path))
      if (paths.length > 0) {
        importing.current = true
        void importDroppedPaths(paths).finally(() => { importing.current = false })
        return
      }
      if (isElectron) {
        toast({
          level: 'warn',
          message: 'That item has no file on disk to import.',
          hint: `Drag a file from Explorer. Clipwright imports ${SUPPORTED_COPY}.`
        })
        return
      }
      // Browser preview: no OS paths, so the files are streamed to the server
      // first and then imported through the same path as a native drop.
      importing.current = true
      void (async () => {
        const uploaded: string[] = []
        for (const file of files) {
          const path = await uploadDroppedFile(file)
          if (path) uploaded.push(path)
        }
        if (uploaded.length === 0) {
          toast({ level: 'error', message: 'The dropped files could not be uploaded.', hint: 'Restart the preview server, then drop them again.' })
        } else {
          await importDroppedPaths(uploaded)
        }
      })().finally(() => { importing.current = false })
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && depth.current > 0) {
        depth.current = 0
        setActive(false)
      }
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [toast])

  if (!active) return null

  return (
    <div className="drop-overlay" aria-hidden="true">
      <div className="drop-overlay-card">
        <Upload size={28} />
        <strong>Drop to import</strong>
        <span>{SUPPORTED_COPY}</span>
        <span className="drop-overlay-note">Drop a .srt, .vtt or .json transcript while a project is open to attach it.</span>
      </div>
    </div>
  )
}
