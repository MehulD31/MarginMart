import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, ImagePlus, Send, Trash2, X } from 'lucide-react'
import { supabase } from '../../shared/api/supabase'
import { PageHeader } from '../../shared/ui/kit'

interface Msg { role: 'user' | 'ai'; text: string; img?: string; error?: boolean }
const KEY = 'kd-assistant-chat'

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

/** Ask chat: questions in plain words about stock, prices, TS, sales and dues; photos from the Pepsi salesman are read too. */
export default function AssistantPage() {
  const { t, i18n } = useTranslation()
  const [msgs, setMsgs] = useState<Msg[]>(() => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Msg[] } catch { return [] } })
  const [text, setText] = useState('')
  const [img, setImg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const end = useRef<HTMLDivElement>(null)

  // keep the chat between visits (photos are not stored: too big for the phone's storage)
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(msgs.slice(-40).map(({ img: _i, ...m }) => ({ ...m, ...(_i ? { text: `📷 ${m.text}` } : {}) })))) }, [msgs])
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [msgs, busy])

  const send = async (e?: FormEvent, preset?: string) => {
    e?.preventDefault()
    const q = (preset ?? text).trim()
    if ((!q && !img) || busy) return
    const mine: Msg = { role: 'user', text: q || t('ask.photoOnly'), img: img ?? undefined }
    const next = [...msgs.filter((m) => !m.error), mine]
    setMsgs(next); setText(''); setImg(null); setBusy(true)
    try {
      const { data } = await supabase.auth.getSession()
      const r = await fetch('/api/assistant', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body: JSON.stringify({ lang: i18n.language, messages: next.map(({ role, text: m }) => ({ role, text: m })), image: mine.img?.split(',')[1] }),
      })
      const j = await r.json().catch(() => ({}))
      setMsgs((s) => [...s, r.ok && j.text ? { role: 'ai', text: j.text } : { role: 'ai', text: j.error ?? t('ask.failed'), error: true }])
    } catch { setMsgs((s) => [...s, { role: 'ai', text: t('ask.failed'), error: true }]) } finally { setBusy(false) }
  }

  const pick = async (f?: File) => { if (f) setImg(await shrink(f)); if (file.current) file.current.value = '' }
  const examples = [t('ask.ex1'), t('ask.ex2'), t('ask.ex3'), t('ask.ex4')]

  return (
    <section className="stack-lg ask-page">
      <PageHeader title={t('ask.title')} sub={t('ask.sub')}
        actions={msgs.length > 0 && <button type="button" className="btn-sm" onClick={() => setMsgs([])}><Trash2 size={16} aria-hidden="true" />{t('ask.clear')}</button>} />
      <div className="card ask-log" aria-live="polite">
        {!msgs.length && (
          <div className="stack" style={{ gap: 10 }}>
            <p className="muted">{t('ask.hello')}</p>
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              {examples.map((x) => <button key={x} type="button" className="btn-sm" onClick={() => void send(undefined, x)}>{x}</button>)}
            </div>
          </div>)}
        {msgs.map((m, i) => (
          <div key={i} className={`ask-msg ${m.role}${m.error ? ' error' : ''}`}>
            {m.role === 'ai' && <span className="ask-avatar" aria-hidden="true"><Bot size={16} /></span>}
            <div className="ask-bubble">
              {m.img && <img src={m.img} alt={t('ask.photo')} className="ask-img" />}
              <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
            </div>
          </div>))}
        {busy && <div className="ask-msg ai"><span className="ask-avatar" aria-hidden="true"><Bot size={16} /></span><div className="ask-bubble muted">{t('ask.thinking')}</div></div>}
        <div ref={end} />
      </div>
      <form className="ask-bar" onSubmit={(e) => void send(e)}>
        {img && <div className="ask-preview"><img src={img} alt={t('ask.photo')} />
          <button type="button" className="btn-sm ghost" aria-label={t('ask.removePhoto')} onClick={() => setImg(null)}><X size={16} /></button></div>}
        <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0])} />
          <button type="button" aria-label={t('ask.addPhoto')} title={t('ask.addPhoto')} onClick={() => file.current?.click()} disabled={busy}><ImagePlus size={20} aria-hidden="true" /></button>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} placeholder={t('ask.placeholder')} aria-label={t('ask.placeholder')}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
            onPaste={(e) => { const f = [...e.clipboardData.files].find((x) => x.type.startsWith('image/')); if (f) { e.preventDefault(); void pick(f) } }}
            style={{ minHeight: 46, flex: 1 }} />
          <button type="submit" className="primary" disabled={busy || (!text.trim() && !img)} aria-label={t('ask.send')}><Send size={18} aria-hidden="true" /></button>
        </div>
      </form>
    </section>
  )
}
