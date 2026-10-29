import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Sheet } from './kit'

interface Ask { title: string; body?: string; confirm?: string; danger?: boolean }
const Ctx = createContext<(a: Ask) => Promise<boolean>>(async () => false)

/** App-styled replacement for window.confirm: a bottom sheet on phones, a dialog on laptops. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [ask, setAsk] = useState<Ask | null>(null)
  const resolver = useRef<(v: boolean) => void>(() => {})
  const confirm = useCallback((a: Ask) => new Promise<boolean>((res) => { resolver.current = res; setAsk(a) }), [])
  const done = (v: boolean) => { resolver.current(v); setAsk(null) }
  return (
    <Ctx.Provider value={confirm}>
      {children}
      <Sheet open={!!ask} title={ask?.title} onClose={() => done(false)}>
        {ask && <div className="stack">
          {ask.body && <p className="muted">{ask.body}</p>}
          <div className="sheet-foot">
            <button type="button" onClick={() => done(false)}>{t('common.cancel')}</button>
            <button type="button" className={ask.danger ? 'danger-solid' : 'primary'} onClick={() => done(true)} autoFocus>{ask.confirm ?? t('common.yes')}</button>
          </div>
        </div>}
      </Sheet>
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useConfirm = () => useContext(Ctx)
