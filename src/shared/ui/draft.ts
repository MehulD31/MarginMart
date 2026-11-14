// Drafts: half-typed work (a bill, a purchase, load quantities, a payment note) survives a refresh, a phone call that kills the
// browser tab, switching apps or a dropped network. Same shape as useState, plus clear() to call after a successful save or an
// explicit cancel. Kept per login on this device only (localStorage), 24 hours, never sent anywhere.
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../api/auth'

const PREFIX = 'kd-draft:'
const TTL = 24 * 3600e3

interface Stored<T> { v: T; at: number }

export function readDraft<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return undefined
    const s = JSON.parse(raw) as Stored<T>
    if (!s || typeof s.at !== 'number' || Date.now() - s.at > TTL) { localStorage.removeItem(PREFIX + key); return undefined }
    return s.v
  } catch { return undefined }
}
export function writeDraft<T>(key: string, v: T) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify({ v, at: Date.now() } satisfies Stored<T>)) } catch { /* storage full or private mode: the form still works */ }
}
export function clearDraft(key: string) { try { localStorage.removeItem(PREFIX + key) } catch { /* nothing to clear */ } }
/** Removes drafts older than a day (called once when the app starts, so old ones never pile up). */
export function sweepDrafts() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k?.startsWith(PREFIX)) readDraft(k.slice(PREFIX.length))
    }
  } catch { /* ignore */ }
}

/**
 * useState that is remembered under `key`. `restored` is true when the value came from an earlier visit (show "kept from earlier").
 * A form left exactly as it started keeps no draft; once edited it is saved after a short pause, and at once when the page is hidden.
 * Call clear() after a successful save or an explicit cancel; discard(fresh) to start again from scratch.
 */
export function useDraft<T>(key: string, initial: T | (() => T), opts: { skip?: boolean } = {}) {
  const uid = useAuth().profile?.user_id ?? 'anon'
  const full = `${uid}:${key}`
  const skip = !!opts.skip
  const [start] = useState(() => {
    const saved = skip ? undefined : readDraft<T>(full)
    return saved !== undefined ? { v: saved, restored: true } : { v: typeof initial === 'function' ? (initial as () => T)() : initial, restored: false }
  })
  const [value, setValue] = useState<T>(start.v)
  const [restored, setRestored] = useState(start.restored)
  const [base, setBase] = useState<string | undefined>(() => (start.restored ? undefined : JSON.stringify(start.v)))
  const [off, setOff] = useState(false)
  const dirty = restored || JSON.stringify(value) !== base

  useEffect(() => {
    if (skip || off) return
    if (!dirty) { clearDraft(full); return }
    const id = setTimeout(() => writeDraft(full, value), 250)
    return () => clearTimeout(id)
  }, [value, dirty, off, skip, full])

  // switching apps or closing the tab must not wait for the pause: save right away when the page is hidden
  const latest = useRef({ value, dirty, off, skip })
  useEffect(() => { latest.current = { value, dirty, off, skip } })
  useEffect(() => {
    const flush = () => {
      const l = latest.current
      if (l.skip || l.off || !l.dirty || document.visibilityState === 'visible') return
      writeDraft(full, l.value)
    }
    document.addEventListener('visibilitychange', flush); window.addEventListener('pagehide', flush)
    return () => { document.removeEventListener('visibilitychange', flush); window.removeEventListener('pagehide', flush) }
  }, [full])

  const clear = () => { setOff(true); setRestored(false); clearDraft(full) }
  const discard = (fresh: T) => { clearDraft(full); setValue(fresh); setRestored(false); setBase(JSON.stringify(fresh)); setOff(false) }
  return { value, set: setValue, restored, clear, discard }
}

/** A search box / filter that is still there after a refresh or when you come back to the page (24 h, this device). */
export function useRemembered<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const d = useDraft<T>(key, initial)
  return [d.value, d.set]
}
