import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp, Bot, Boxes, Camera, Check, Copy, IndianRupee, RotateCcw, ShoppingCart, SquarePen, TrendingUp, X } from 'lucide-react'
import { supabase } from '../../shared/api/supabase'

interface Msg { role: 'user' | 'ai'; text: string; img?: string; error?: boolean; at?: number }
const KEY = 'kd-assistant-chat'
const stamp = () => Date.now()

/** Phone photos are big: shrink to 1600 px JPEG before sending (well under the server's limit, still readable). */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url })
    const k = Math.min(1, 1600 / Math.max(img.width, img.height))
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.85)
  } finally { URL.revokeObjectURL(url) }
}

/** iPhone Safari does not shrink the page when the keyboard opens: lift the composer by the keyboard's height. */
function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const set = () => document.documentElement.style.setProperty('--kb', `${Math.max(0, window.innerHeight - vv.height - vv.offsetTop)}px`)
    set(); vv.addEventListener('resize', set); vv.addEventListener('scroll', set)
    return () => { vv.removeEventListener('resize', set); vv.removeEventListener('scroll', set); document.documentElement.style.removeProperty('--kb') }
  }, [])
}

/** Ask AI: a phone-first chat. Questions in plain words; photos from the Pepsi salesman are read and explained with our numbers. */
export default function AssistantPage() {
  const { t, i18n } = useTranslation()
  const [msgs, setMsgs] = useState<Msg[]>(() => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Msg[] } catch { return [] } })
  const [text, setText] = useState('')
  const [img, setImg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState(0)
  const [atEnd, setAtEnd] = useState(true)
  const [copied, setCopied] = useState<number | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  const bar = useRef<HTMLFormElement>(null)
  const end = useRef<HTMLDivElement>(null)
  useKeyboardInset()

  // keep the chat between visits (photos are not stored: too big for the phone's storage)
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(msgs.filter((m) => !m.error).slice(-40).map(({ img: i, ...m }) => (i ? { ...m, text: `📷 ${m.text}` } : m)))) }, [msgs])
  // the page leaves room for the composer, whatever its height (photo preview, several lines)
  useLayoutEffect(() => {
    const el = bar.current; if (!el) return
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--ask-bar', `${el.offsetHeight}px`))
    ro.observe(el); return () => { ro.disconnect(); document.documentElement.style.removeProperty('--ask-bar') }
  }, [])
  const toEnd = useCallback((smooth = true) => end.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' }), [])
  // open at the newest message (after the composer height is known)
  useEffect(() => {
    const go = () => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'auto' })
    const ids = [0, 150, 400].map((ms) => setTimeout(go, ms))     // fonts and the composer settle after the first paint
    return () => ids.forEach(clearTimeout)
  }, [])
  useEffect(() => { if (atEnd) toEnd() }, [msgs, busy, atEnd, toEnd])
  useEffect(() => {
    const on = () => setAtEnd(window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160)
    window.addEventListener('scroll', on, { passive: true }); return () => window.removeEventListener('scroll', on)
  }, [])
  // "thinking" text moves on, so a 20-second wait does not look stuck
  useEffect(() => { if (!busy) return; const id = setInterval(() => setStep((s) => Math.min(s + 1, 3)), 4000); return () => clearInterval(id) }, [busy])
  // the box grows with the text, up to ~5 lines
  useLayoutEffect(() => { const el = box.current; if (!el) return; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 132)}px` }, [text])

  const ask = async (history: Msg[], photo?: string) => {
    setStep(0); setBusy(true); setAtEnd(true)
    try {
      const { data } = await supabase.auth.getSession()
      const r = await fetch('/api/assistant', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body: JSON.stringify({ lang: i18n.language, messages: history.map(({ role, text: m }) => ({ role, text: m })), image: photo?.split(',')[1] }),
      })
      if (!r.ok || !r.body) {
        const j = await r.json().catch(() => ({}))
        setMsgs((s) => [...s, { role: 'ai', text: j.error ?? t('ask.failed'), error: true }]); return
      }
      // the answer streams in: show words as they arrive (one JSON object per line)
      const reader = r.body.getReader(), dec = new TextDecoder()
      let buf = '', text = '', live = false, err: string | null = null
      const show = (txt: string, final = false) => setMsgs((s) => {
        const base = live ? s.slice(0, -1) : s
        return [...base, { role: 'ai', text: txt, at: final ? stamp() : undefined }]
      })
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let n
        while ((n = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, n).trim(); buf = buf.slice(n + 1)
          if (!line) continue
          const j = JSON.parse(line) as { t?: string; done?: boolean; text?: string; error?: string }
          if (j.t) { text += j.t; show(text); live = true; setBusy(false) }
          else if (j.done) { show(j.text || text, true); live = true }
          else if (j.error) err = j.error
        }
      }
      if (!text) setMsgs((s) => [...s, { role: 'ai', text: err ?? t('ask.failed'), error: true }])
    } catch { setMsgs((s) => [...s, { role: 'ai', text: t('ask.failed'), error: true }]) } finally { setBusy(false) }
  }
  const send = (e?: FormEvent, preset?: string) => {
    e?.preventDefault()
    const q = (preset ?? text).trim()
    if ((!q && !img) || busy) return
    const mine: Msg = { role: 'user', text: q || t('ask.photoOnly'), img: img ?? undefined, at: stamp() }
    const next = [...msgs.filter((m) => !m.error), mine]
    setMsgs(next); setText(''); setImg(null)
    void ask(next, mine.img)
  }
  const retry = () => {
    const clean = msgs.filter((m) => !m.error)
    const last = clean[clean.length - 1]
    if (!last || last.role !== 'user' || busy) return
    setMsgs(clean); void ask(clean, last.img)
  }
  const pick = async (f?: File) => { if (f) { setImg(await shrink(f)); box.current?.focus() } if (file.current) file.current.value = '' }
  const copy = async (i: number, s: string) => { try { await navigator.clipboard.writeText(s); setCopied(i); setTimeout(() => setCopied(null), 1500) } catch { /* no clipboard */ } }
  const time = (n?: number) => (n ? new Date(n).toLocaleTimeString(i18n.language === 'hi' ? 'hi-IN' : 'en-IN', { hour: 'numeric', minute: '2-digit' }) : '')

  const starters = [
    { icon: Boxes, title: t('ask.s1'), q: t('ask.ex2') },
    { icon: TrendingUp, title: t('ask.s2'), q: t('ask.ex1') },
    { icon: ShoppingCart, title: t('ask.s3'), q: t('ask.ex3') },
    { icon: IndianRupee, title: t('ask.s4'), q: t('ask.ex4') },
  ]

  return (
    <section className="ask-page">
      <header className="ask-head">
        <span className="ask-avatar lg" aria-hidden="true"><Bot size={20} /></span>
        <div className="grow"><h1>{t('ask.title')}</h1><p className="cell-sub">{busy ? t('ask.typing') : t('ask.online')}</p></div>
        {msgs.length > 0 && <button type="button" className="btn-sm ghost" onClick={() => { setMsgs([]); setText(''); setImg(null) }}
          aria-label={t('ask.clear')} title={t('ask.clear')}><SquarePen size={18} aria-hidden="true" /><span className="ask-hide-sm">{t('ask.clear')}</span></button>}
      </header>

      {!msgs.length ? (
        <div className="ask-empty">
          <span className="ask-avatar xl" aria-hidden="true"><Bot size={30} /></span>
          <h2>{t('ask.hi')}</h2>
          <p className="muted">{t('ask.hello')}</p>
          <button type="button" className="ask-photo-card" onClick={() => file.current?.click()}>
            <span className="icon-tile" aria-hidden="true"><Camera size={20} /></span>
            <span className="grow"><b>{t('ask.photoCard')}</b><span className="cell-sub">{t('ask.photoCardSub')}</span></span>
          </button>
          <div className="ask-starters">
            {starters.map((s) => (
              <button key={s.q} type="button" className="ask-starter" onClick={() => send(undefined, s.q)}>
                <s.icon size={18} aria-hidden="true" /><b>{s.title}</b><span>{s.q}</span></button>))}
          </div>
        </div>
      ) : (
        <div className="ask-log" aria-live="polite">
          {msgs.map((m, i) => (
            <div key={i} className={`ask-msg ${m.role}${m.error ? ' error' : ''}`}>
              {m.role === 'ai' && <span className="ask-avatar" aria-hidden="true"><Bot size={16} /></span>}
              <div className="ask-body">
                <div className="ask-bubble">
                  {m.img && <img src={m.img} alt={t('ask.photo')} className="ask-img" />}
                  <div className="ask-text">{m.text}</div>
                </div>
                <div className="ask-meta">
                  {m.at && <span>{time(m.at)}</span>}
                  {m.role === 'ai' && !m.error && <button type="button" className="ask-tool" onClick={() => void copy(i, m.text)} aria-label={t('ask.copy')}>
                    {copied === i ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}{copied === i ? t('ask.copied') : t('ask.copy')}</button>}
                  {m.error && i === msgs.length - 1 && <button type="button" className="ask-tool" onClick={retry}><RotateCcw size={14} aria-hidden="true" />{t('ask.retry')}</button>}
                </div>
              </div>
            </div>))}
          {busy && (
            <div className="ask-msg ai">
              <span className="ask-avatar" aria-hidden="true"><Bot size={16} /></span>
              <div className="ask-body"><div className="ask-bubble ask-wait"><span className="ask-dots" aria-hidden="true"><i /><i /><i /></span>{t(`ask.wait${step}`)}</div></div>
            </div>)}
          <div ref={end} />
        </div>
      )}

      {!atEnd && msgs.length > 0 && <button type="button" className="ask-jump" onClick={() => { setAtEnd(true); toEnd() }} aria-label={t('ask.latest')}><ArrowDown size={18} /></button>}

      <form ref={bar} className="ask-bar" onSubmit={send}>
        {img && <div className="ask-preview"><img src={img} alt={t('ask.photo')} /><span className="cell-sub grow">{t('ask.photoReady')}</span>
          <button type="button" className="ask-icon" aria-label={t('ask.removePhoto')} onClick={() => setImg(null)}><X size={18} /></button></div>}
        <div className="ask-row">
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0])} />
          <button type="button" className="ask-icon" aria-label={t('ask.addPhoto')} title={t('ask.addPhoto')} onClick={() => file.current?.click()} disabled={busy}><Camera size={20} aria-hidden="true" /></button>
          <textarea ref={box} value={text} onChange={(e) => setText(e.target.value)} rows={1} placeholder={t('ask.placeholder')} aria-label={t('ask.placeholder')}
            enterKeyHint="send" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(min-width: 960px)').matches) { e.preventDefault(); send() } }}
            onPaste={(e) => { const f = [...e.clipboardData.files].find((x) => x.type.startsWith('image/')); if (f) { e.preventDefault(); void pick(f) } }} />
          <button type="submit" className="ask-send" disabled={busy || (!text.trim() && !img)} aria-label={t('ask.send')}><ArrowUp size={20} aria-hidden="true" /></button>
        </div>
        {!msgs.length && <p className="ask-note">{t('ask.note')}</p>}
      </form>
    </section>
  )
}
