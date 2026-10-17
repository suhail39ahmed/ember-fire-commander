export function youtubeId(raw: string): string | null {
  try {
    const url = new URL(raw)
    const host = url.hostname.replace(/^www\./, '')
    const id = host === 'youtu.be' ? url.pathname.slice(1) : ['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(host)
      ? url.searchParams.get('v') || url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1] : null
    return id && /^[\w-]{11}$/.test(id) ? id : null
  } catch { return null }
}

