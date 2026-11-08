import { supabase } from '../../shared/api/supabase'
import { formatPaise } from '../../shared/money'

export interface BillLink { url: string; number: string; phone: string | null; total_paise: number; shop: string }

/** Signed link to a bill PDF (works without login, only for that bill), from api/bill-pdf. */
export async function billLink(id: string): Promise<BillLink> {
  const { data } = await supabase.auth.getSession()
  const r = await fetch(`/api/bill-pdf?id=${encodeURIComponent(id)}&link=1`, { headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` } })
  const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }))
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`)
  return j as BillLink
}

/** Opens a tab first (so phone browsers don't block it as a pop-up), then points it at the URL once known. */
async function openWith(make: () => Promise<string>) {
  const w = window.open('', '_blank')
  try {
    const url = await make()
    if (w) { w.opener = null; w.location.href = url } else window.location.assign(url)
  } catch (e) { w?.close(); throw e }
}

export const openBillPdf = (id: string) => openWith(async () => (await billLink(id)).url)

export const waBillText = (b: BillLink) =>
  `Namaste 🙏\nK.D. Foods bill ${b.number} · ${b.shop}\nTotal: ${formatPaise(b.total_paise)}\n\nBill PDF: ${b.url}\n\nDhanyavaad · 96300 12636`

/** WhatsApp chat with the shop (or the share picker if the shop has no phone), text + PDF link filled in. */
export const shareBillWhatsApp = (id: string) => openWith(async () => {
  const b = await billLink(id)
  return `https://wa.me/${b.phone ? '91' + b.phone : ''}?text=${encodeURIComponent(waBillText(b))}`
})
