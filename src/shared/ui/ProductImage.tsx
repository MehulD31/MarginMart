import { useState } from 'react'
import { imageUrl } from '../api/db'

// Brand-ish colours so packs without a photo still read at a glance.
const PALETTE = [
  ['#1e3a8a', '#dbeafe'], ['#166534', '#dcfce7'], ['#9a3412', '#ffedd5'], ['#6b21a8', '#f3e8ff'],
  ['#9f1239', '#ffe4e6'], ['#0f766e', '#ccfbf1'], ['#854d0e', '#fef9c3'], ['#334155', '#e2e8f0'],
]
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
const sizeOf = (name: string) => name.match(/\d+(?:\.\d+)?\s?(?:ml|l|ltr)\b/i)?.[0].replace(/\s/g, '').replace(/ltr$/i, 'L') ?? ''

/** Product photo, or a coloured label tile (pack size + first word) when there is none or it fails to load. */
export function ProductImage({ path, name, size = 72 }: { path: string | null | undefined; name: string; size?: number }) {
  const [broken, setBroken] = useState(false)
  const src = !broken ? imageUrl(path ?? null) : null
  if (src) return <span className="pimg" style={{ width: size, height: size }}><img src={src} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} /></span>
  const [fg, bg] = PALETTE[hash(name) % PALETTE.length]
  const word = name.replace(/[^\p{L} ]/gu, ' ').trim().split(/\s+/).find((w) => !/^(ml|l|ltr|pet|can|tetra|mrp)$/i.test(w)) ?? ''
  return (
    <span className="pimg pimg-tile" style={{ width: size, height: size, color: fg, background: bg }} aria-hidden="true">
      <b style={{ fontSize: size * 0.24 }}>{sizeOf(name) || word.slice(0, 2).toUpperCase()}</b>
      <small style={{ fontSize: Math.max(9, size * 0.14) }}>{word.slice(0, 10)}</small>
    </span>
  )
}
