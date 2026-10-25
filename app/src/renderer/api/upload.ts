/**
 * Browser-preview file upload. Inside Electron the UI uses the native
 * `media.pickSourceFile` / `media.pickTranscriptFile` dialogs instead; this
 * module exists only for the web preview transport, where a file chosen in
 * the browser is streamed to the backend via POST /api/upload and returns the
 * server-side path used with the regular import APIs.
 */

export async function pickUpload(accept?: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    if (accept && accept.length > 0) input.accept = accept.join(',')
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      try {
        const buf = await file.arrayBuffer()
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) },
          body: buf
        })
        const json = (await res.json()) as { ok: boolean; value?: { path: string }; error?: { message: string } }
        if (!json.ok) {
          alert(json.error?.message ?? 'The file could not be uploaded. Try again.')
          return resolve(null)
        }
        resolve(json.value!.path)
      } catch {
        alert('The file could not be uploaded. The preview server may have stopped — restart it, then try again.')
        resolve(null)
      }
    }
    input.click()
  })
}
