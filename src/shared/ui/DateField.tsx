import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { addDaysISO, clampISO, isISO, monthGrid, todayISO } from './dates'

/**
 * Themed date picker used everywhere instead of <input type="date"> (whose calendar popup the browser draws in its own
 * blue style and CSS can't change). Value is 'YYYY-MM-DD' (IST day) or '' when empty, exactly like the native input,
 * so pages keep their existing state and checks.
 *  - Shows "9 Nov 2026" (no 11/09 vs 09/11 confusion), in Hindi when the app is in Hindi.
 *  - Calendar opens inside an open <dialog> (sheets are in the top layer) or on <body>, so no card or sheet can clip it.
 *  - Keyboard: arrows move a day/week, PageUp/PageDown a month, Home/End the week, Enter picks, Esc closes (not the sheet).
 */
export function DateField({ value, onChange, min, max, id, label, invalid, disabled, clearable, style, testId }: {
  value: string; onChange: (v: string) => void; min?: string; max?: string; id?: string
  /** Accessible name when the field is not inside a <label> (e.g. a toolbar). */
  label?: string; invalid?: boolean; disabled?: boolean; clearable?: boolean; style?: CSSProperties; testId?: string
}) {
  const { t, i18n } = useTranslation()
  const loc = i18n.language === 'hi' ? 'hi-IN' : 'en-IN'
  const valId = useId()
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'days' | 'months'>('days')
  const today = todayISO()
  const start = isISO(value) ? value : clampISO(today, min, max)
  const [focus, setFocus] = useState(start)
  const [pos, setPos] = useState<CSSProperties>({})
  const [host, setHost] = useState<HTMLElement | null>(null)

  const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(`${iso}T00:00:00`).toLocaleDateString(loc, o)
  const allowed = (iso: string) => (!min || iso >= min) && (!max || iso <= max)

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect()
    if (!r) return
    const vw = window.innerWidth, vh = window.innerHeight, gap = 6, edge = 8
    const w = Math.min(304, vw - 2 * edge), h = pop.current?.offsetHeight || 340   // real height once shown
    const left = Math.max(edge, Math.min(r.left, vw - w - edge))
    // below the field if it fits, else above, else as close as possible while staying fully on screen
    const top = r.bottom + gap + h <= vh - edge ? r.bottom + gap
      : r.top - gap - h >= edge ? r.top - gap - h
      : Math.max(edge, Math.min(r.bottom + gap, vh - h - edge))
    setPos({ left, top })
  }, [])

  const show = () => {
    if (disabled) return
    setFocus(start); setMode('days')
    setHost((btn.current?.closest('dialog') as HTMLElement | null) ?? document.body)
    place(); setOpen(true)
  }
  const close = (refocus = true) => { setOpen(false); if (refocus) btn.current?.focus() }
  const pick = (iso: string) => { if (!allowed(iso)) return; onChange(iso); close() }

  // keep the calendar next to the field while the page or sheet scrolls; close on a tap outside
  useEffect(() => {
    if (!open) return
    const onMove = () => place()
    const onDown = (e: PointerEvent) => {
      const n = e.target as Node
      if (!pop.current?.contains(n) && !btn.current?.contains(n)) close(false)
    }
    window.addEventListener('resize', onMove); window.addEventListener('scroll', onMove, true)
    document.addEventListener('pointerdown', onDown, true)
    // A sheet that is still sliding in has a transform, which makes it (not the screen) the box a fixed calendar is placed
    // in. Re-place when its animation ends, so a quick tap right after the sheet opens still shows the calendar in the right spot.
    const sheet = host && host !== document.body ? host : null
    sheet?.addEventListener('animationend', onMove)
    return () => {
      window.removeEventListener('resize', onMove); window.removeEventListener('scroll', onMove, true); document.removeEventListener('pointerdown', onDown, true)
      sheet?.removeEventListener('animationend', onMove)
    }
  }, [open, place, host])

  // place again once the calendar is drawn and its real height is known (and when switching days/months view)
  useLayoutEffect(() => { if (open) place() }, [open, mode, place])

  // move keyboard focus to the highlighted day whenever it changes
  useLayoutEffect(() => {
    if (open && mode === 'days') pop.current?.querySelector<HTMLButtonElement>(`[data-day="${focus}"]`)?.focus()
  }, [open, mode, focus])
  useLayoutEffect(() => {
    if (open && mode === 'months') pop.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"], .dp-month')?.focus()
  }, [open, mode])

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (mode === 'months') setMode('days'); else close(); return }
    if (mode !== 'days') return
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    let next: string | null = null
    if (e.key in step) next = addDaysISO(focus, step[e.key])
    else if (e.key === 'PageUp' || e.key === 'PageDown') next = shiftMonth(focus, e.key === 'PageUp' ? -1 : 1)
    else if (e.key === 'Home') next = addDaysISO(focus, -new Date(`${focus}T00:00:00Z`).getUTCDay())
    else if (e.key === 'End') next = addDaysISO(focus, 6 - new Date(`${focus}T00:00:00Z`).getUTCDay())
    if (next) { e.preventDefault(); setFocus(next) }
  }

  const [vy, vm] = focus.split('-').map(Number)
  const grid = monthGrid(vy, vm)
  const weekdays = [0, 1, 2, 3, 4, 5, 6].map((d) => new Date(Date.UTC(2026, 10, 1 + d)).toLocaleDateString(loc, { weekday: 'narrow', timeZone: 'UTC' }))  // 1 Nov 2026 = Sunday
  const monthOk = (y: number, m: number) => {
    const first = `${y}-${String(m).padStart(2, '0')}-01`, last = addDaysISO(shiftMonth(first, 1), -1)
    return (!max || first <= max) && (!min || last >= min)
  }
  const goMonth = (n: number) => setFocus((f) => clampISO(shiftMonth(f, n), min, max))
  const prevY = vm === 1 ? vy - 1 : vy, prevM = vm === 1 ? 12 : vm - 1
  const nextY = vm === 12 ? vy + 1 : vy, nextM = vm === 12 ? 1 : vm + 1
  const shown = isISO(value) ? fmt(value, { day: 'numeric', month: 'short', year: 'numeric' }) : t('date.pick')

  return (
    <>
      <button ref={btn} type="button" id={id} className={`date-field${isISO(value) ? '' : ' empty'}`} style={style} disabled={disabled}
        aria-haspopup="dialog" aria-expanded={open} aria-invalid={invalid || undefined} aria-label={label ? `${label}: ${shown}` : undefined}
        aria-describedby={label ? undefined : valId} data-testid={testId} data-value={value}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); show() } }}>
        <span id={valId} className="date-field-text">{shown}</span>
        <CalendarDays size={18} aria-hidden="true" />
      </button>
      {open && host && createPortal(
        <div ref={pop} className="dp" role="dialog" aria-modal="false" aria-label={t('date.choose')} style={pos} onKeyDown={onKey}>
          <div className="dp-head">
            <button type="button" className="dp-nav" onClick={() => (mode === 'days' ? goMonth(-1) : setFocus((f) => clampISO(shiftMonth(f, -12), min, max)))}
              disabled={mode === 'days' ? !monthOk(prevY, prevM) : !monthOk(vy - 1, 12)} aria-label={mode === 'days' ? t('date.prevMonth') : t('date.prevYear')}><ChevronLeft size={18} aria-hidden="true" /></button>
            <button type="button" className="dp-title" onClick={() => setMode((m) => (m === 'days' ? 'months' : 'days'))} aria-label={mode === 'days' ? t('date.pickMonth') : t('date.backToDays')}>
              {mode === 'days' ? fmt(`${vy}-${String(vm).padStart(2, '0')}-01`, { month: 'long', year: 'numeric' }) : String(vy)}
            </button>
            <button type="button" className="dp-nav" onClick={() => (mode === 'days' ? goMonth(1) : setFocus((f) => clampISO(shiftMonth(f, 12), min, max)))}
              disabled={mode === 'days' ? !monthOk(nextY, nextM) : !monthOk(vy + 1, 1)} aria-label={mode === 'days' ? t('date.nextMonth') : t('date.nextYear')}><ChevronRight size={18} aria-hidden="true" /></button>
          </div>
          {mode === 'days' ? (
            <div className="dp-grid" role="grid" aria-label={fmt(`${vy}-${String(vm).padStart(2, '0')}-01`, { month: 'long', year: 'numeric' })}>
              <div className="dp-row" role="row">{weekdays.map((w, i) => <span key={i} className="dp-wd" role="columnheader">{w}</span>)}</div>
              {chunk(grid, 7).map((week, r) => (
                <div className="dp-row" role="row" key={r}>{week.map((d, c) => d ? (
                  <span role="gridcell" key={c}>
                    <button type="button" className="dp-day" data-day={d} tabIndex={d === focus ? 0 : -1} disabled={!allowed(d)}
                      aria-pressed={d === value} aria-current={d === today ? 'date' : undefined}
                      aria-label={fmt(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                      onClick={() => pick(d)} onFocus={() => d !== focus && setFocus(d)}>{Number(d.slice(8))}</button>
                  </span>) : <span role="gridcell" key={c} />)}</div>))}
            </div>
          ) : (
            <div className="dp-months">{Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <button type="button" key={m} className="dp-month" disabled={!monthOk(vy, m)} aria-pressed={m === vm}
                onClick={() => { setFocus(clampISO(`${vy}-${String(m).padStart(2, '0')}-${String(Math.min(Number(focus.slice(8)), 28)).padStart(2, '0')}`, min, max)); setMode('days') }}>
                {fmt(`${vy}-${String(m).padStart(2, '0')}-01`, { month: 'short' })}</button>))}
            </div>
          )}
          <div className="dp-foot">
            {clearable ? <button type="button" className="ghost btn-sm" onClick={() => { onChange(''); close() }}>{t('date.clear')}</button> : <span />}
            <button type="button" className="ghost btn-sm" disabled={!allowed(today)} onClick={() => pick(today)}>{t('date.today')}</button>
          </div>
        </div>, host)}
    </>
  )
}

function shiftMonth(iso: string, n: number) {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + n, 1))
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
}
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))
