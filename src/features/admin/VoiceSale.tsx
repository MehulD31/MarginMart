import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Mic, Square, Wand2 } from 'lucide-react'
import { supabase } from '../../shared/api/supabase'
import { Alert, type Msg } from '../../shared/ui/kit'

export interface VoiceResult {
  heard: string
  shop: { id: string; name: string; phone: string | null; locality: string | null } | null
  shopHint: string | null
  lines: { variant_id: string; qty: number; price_paise: number }[]
  mode: 'cash' | 'upi' | null
  /** Money account the speaker named ("UPI Shobhit ke account me"), else null = default. */
  account_id?: string | null
  unclear: string[]
}
const MAX_MS = 30_000

async function ask(body: Record<string, string>): Promise<VoiceResult> {
  const { data } = await supabase.auth.getSession()
  const r = await fetch('/api/voice-sale', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: JSON.stringify(body),
  })
  const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }))
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`)
  return j as VoiceResult
}
const toBase64 = (b: Blob) => new Promise<string>((ok, bad) => {
  const fr = new FileReader()
  fr.onload = () => ok(String(fr.result).split(',')[1] ?? '')
  fr.onerror = () => bad(fr.error)
  fr.readAsDataURL(b)
})

/** Mic button + typed fallback. The server hears and reads the sale; the parent only prefills its form. */
export function VoiceSale({ onResult }: { onResult: (r: VoiceResult) => void }) {
  const { t } = useTranslation()
  const [state, setState] = useState<'idle' | 'rec' | 'busy'>('idle')
  const [msg, setMsg] = useState<Msg>(null)
  const [typed, setTyped] = useState('')
  const rec = useRef<MediaRecorder | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const canRecord = typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'

  useEffect(() => () => { window.clearTimeout(timer.current); rec.current?.stream.getTracks().forEach((x) => x.stop()) }, [])

  const run = async (body: Record<string, string>) => {
    setState('busy'); setMsg({ kind: 'warn', text: t('sales.voice.working') })
    try {
      const r = await ask(body)
      onResult(r)
      const notes = r.unclear.length ? `\n• ${r.unclear.join('\n• ')}` : ''
      setMsg({ kind: r.lines.length ? 'success' : 'error', text: (r.lines.length ? t('sales.voice.heard', { text: r.heard }) : t('sales.voice.nothing', { text: r.heard })) + notes })
    } catch (e) { setMsg({ kind: 'error', text: t('sales.voice.failed', { msg: e instanceof Error ? e.message : String(e) }) }) }
    setState('idle')
  }

  const start = async () => {
    if (!canRecord) { setMsg({ kind: 'error', text: t('sales.voice.unsupported') }); return }
    let stream: MediaStream
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }) } catch { setMsg({ kind: 'error', text: t('sales.voice.noMic') }); return }
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported(m)) ?? ''
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    const chunks: Blob[] = []
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
    mr.onstop = () => {
      stream.getTracks().forEach((x) => x.stop()); window.clearTimeout(timer.current)
      const blob = new Blob(chunks, { type: mr.mimeType || mime || 'audio/webm' })
      if (!blob.size) { setState('idle'); setMsg({ kind: 'error', text: t('sales.voice.failed', { msg: 'empty recording' }) }); return }
      void toBase64(blob).then((audio) => run({ audio, mime: blob.type }))
    }
    rec.current = mr
    mr.start()
    setState('rec'); setMsg({ kind: 'warn', text: t('sales.voice.listening') })
    timer.current = window.setTimeout(() => { if (mr.state === 'recording') mr.stop() }, MAX_MS)
  }
  const stop = () => { if (rec.current?.state === 'recording') { setState('busy'); rec.current.stop() } }
  const submitTyped = (e: FormEvent) => { e.preventDefault(); if (typed.trim().length >= 3) void run({ text: typed.trim() }) }

  return (
    <div className="card stack" style={{ padding: '10px 12px' }}>
      <button type="button" className={state === 'rec' ? 'danger btn-block' : 'primary btn-block'} disabled={state === 'busy'}
        aria-pressed={state === 'rec'} onClick={() => void (state === 'rec' ? stop() : start())}>
        {state === 'rec' ? <Square size={18} aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}
        {state === 'rec' ? t('sales.voice.stop') : state === 'busy' ? t('sales.voice.working') : t('sales.voice.speak')}
      </button>
      <form className="row" style={{ gap: 6 }} onSubmit={submitTyped}>
        <label className="field grow"><span className="sr-only">{t('sales.voice.typeLabel')}</span>
          <input type="text" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t('sales.voice.typePh')} aria-label={t('sales.voice.typeLabel')} /></label>
        <button type="submit" className="btn-sm" disabled={state !== 'idle' || typed.trim().length < 3}><Wand2 size={16} aria-hidden="true" />{t('sales.voice.fill')}</button>
      </form>
      <div aria-live="polite" style={{ whiteSpace: 'pre-line' }}><Alert msg={msg} /></div>
    </div>
  )
}
