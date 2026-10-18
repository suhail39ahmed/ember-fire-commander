import { useEffect, useRef, useState } from 'react'
import { preparePhoto } from '../photo/preparePhoto'
import { attachmentProblem, videoType, type Attachment } from './attachments'
import type { attachmentStrings } from './attachmentStrings'

export function useReportAttachments() {
  const [items, setItems] = useState<Attachment[]>([])
  const latest = useRef(items)
  latest.current = items
  const [busy, setBusy] = useState(false)
  const preparing = useRef(false)
  const [error, setError] = useState<keyof typeof attachmentStrings | null>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; latest.current.forEach((item) => URL.revokeObjectURL(item.previewUrl)) }
  }, [])

  async function add(kind: Attachment['kind'], files: File[]) {
    if (!files.length || preparing.current) return []
    const problem = attachmentProblem(kind, files, latest.current)
    if (problem) { setError(problem); return [] }
    preparing.current = true
    setBusy(true)
    setError(null)
    const next: Attachment[] = []
    try {
      for (const file of files) {
        const prepared = kind === 'photo' ? await preparePhoto(file) : { blob: file, contentType: videoType(file)! }
        next.push({ id: crypto.randomUUID(), kind, ...prepared, name: file.name, previewUrl: URL.createObjectURL(prepared.blob) })
      }
      if (mounted.current) {
        latest.current = [...latest.current, ...next]
        setItems(latest.current)
        return next
      }
      else next.forEach((item) => URL.revokeObjectURL(item.previewUrl))
    } catch {
      next.forEach((item) => URL.revokeObjectURL(item.previewUrl))
      if (mounted.current) setError(kind === 'photo' ? 'badPhoto' : 'badVideo')
    } finally {
      preparing.current = false
      if (mounted.current) setBusy(false)
    }
    return []
  }

  function remove(id: string) {
    const item = latest.current.find((entry) => entry.id === id)
    if (item) URL.revokeObjectURL(item.previewUrl)
    setItems((previous) => previous.filter((entry) => entry.id !== id))
    setError(null)
  }
  function clear() {
    latest.current.forEach((item) => URL.revokeObjectURL(item.previewUrl))
    setItems([])
    setError(null)
  }
  return { items, busy, error, add, remove, clear }
}
