import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Download, MessageCircle } from 'lucide-react'
import { toCsv } from '../../shared/csv'
import { Sheet } from '../../shared/ui/kit'
import { downloadText } from '../../shared/ui/util'

export interface Issued { name: string; phone: string; pin: string }

/** One-time PIN hand-off. PINs are never shown again after this closes. */
export function PinIssued({ issued, onDone }: { issued: Issued[]; onDone: () => void }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState<string | null>(null)
  const message = (i: Issued) => t('users.waMessage', { phone: i.phone, pin: i.pin, url: window.location.origin })
  const wa = (i: Issued) => `https://wa.me/91${i.phone}?text=${encodeURIComponent(message(i))}`
  const copy = async (i: Issued) => { await navigator.clipboard.writeText(message(i)); setCopied(i.phone) }
  const one = issued.length === 1 ? issued[0] : null

  return (
    <Sheet open={issued.length > 0} title={one ? t('users.pinFor', { name: one.name }) : t('shops.pinsIssued', { n: issued.length })} onClose={onDone}>
      <div className="stack">
        {one ? (
          <div className="pin-reveal">
            <span className="muted">{one.phone}</span>
            <span className="digits" aria-label={one.pin.split('').join(' ')}>{one.pin}</span>
          </div>
        ) : (
          <ul className="plain-list">{issued.map((i) => (
            <li key={i.phone} className="pin-row">
              <div className="grow"><div className="cell-title">{i.name}</div><div className="cell-sub num">{i.phone} · <strong>{i.pin}</strong></div></div>
              <a className="button whatsapp btn-sm icon-btn" href={wa(i)} target="_blank" rel="noopener noreferrer" aria-label={`${t('users.shareWhatsApp')} ${i.name}`}><MessageCircle size={18} /></a>
            </li>))}</ul>
        )}
        <p className="alert alert-warn">{t('users.pinHint')}</p>
        <div className="sheet-foot" style={{ flexWrap: 'wrap' }}>
          {one && <>
            <button type="button" onClick={() => void copy(one)}><Copy size={18} aria-hidden="true" />{copied ? t('common.copied') : t('common.copy')}</button>
            <a className="button whatsapp" href={wa(one)} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} aria-hidden="true" />{t('users.shareWhatsApp')}</a>
          </>}
          {!one && <button type="button" onClick={() => downloadText('shop-pins.csv', toCsv([['name', 'phone', 'pin'], ...issued.map((i) => [i.name, i.phone, i.pin])]))}>
            <Download size={18} aria-hidden="true" />{t('shops.downloadPins')}</button>}
          <button type="button" className="primary" onClick={onDone}>{t('shops.pinsDone')}</button>
        </div>
      </div>
    </Sheet>
  )
}
