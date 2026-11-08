// K.D. Foods bill PDF (A4). Pure: bill data in (public._bill / bill_data / bot_bill), PDF bytes out. Used by
// api/bill-pdf.js (website + WhatsApp link) and the Telegram sale flow. Prices are GST-inclusive; the database already
// splits each line into taxable + CGST + SGST, so this file only lays it out. Unit-tested in scripts/ops/billpdf.test.mjs.
import fs from 'node:fs'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { PDFDocument, rgb, degrees } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

const FONT_DIR = new URL('./_fonts/', import.meta.url)
let fontBytes = null
const loadFonts = () => (fontBytes ??= {
  regular: fs.readFileSync(new URL('NotoSans-Regular.ttf', FONT_DIR)),
  bold: fs.readFileSync(new URL('NotoSans-Bold.ttf', FONT_DIR)),
})

// ---------- small helpers (exported for tests) ----------
export const money = (paise, dp = 2) => '₹' + (Number(paise ?? 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp })
export const pct = (bp) => `${(Number(bp ?? 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen',
  'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
const two = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`)
const three = (n) => [n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred` : '', two(n % 100)].filter(Boolean).join(' ')
/** Indian system: 2629500 paise -> "Rupees Twenty Six Thousand Two Hundred Ninety Five Only". */
export function amountInWords(paise) {
  const p = Math.round(Math.abs(Number(paise ?? 0)))
  let r = Math.floor(p / 100); const ps = p % 100
  if (r === 0 && ps === 0) return 'Rupees Zero Only'
  const parts = []
  const crore = Math.floor(r / 1e7); r %= 1e7
  const lakh = Math.floor(r / 1e5); r %= 1e5
  const thousand = Math.floor(r / 1e3); r %= 1e3
  if (crore) parts.push(`${crore >= 100 ? three(crore % 1000) : two(crore)} Crore`)   // up to 999 crore
  if (lakh) parts.push(`${two(lakh)} Lakh`)
  if (thousand) parts.push(`${two(thousand)} Thousand`)
  if (r) parts.push(three(r))
  const rupees = parts.length ? `Rupees ${parts.join(' ')}` : ''
  const paisa = ps ? `${rupees ? ' and ' : ''}${two(ps)} Paise` : ''
  return `${rupees}${paisa} Only`
}

/** Signed, non-guessable link token for one bill (so a shop can open its PDF from WhatsApp without a login). */
export const billToken = (id, secret) => createHmac('sha256', `kd-bill-link:${secret}`).update(String(id)).digest('base64url').slice(0, 32)
export function billTokenOk(id, token, secret) {
  if (!secret || typeof token !== 'string' || token.length !== 32) return false
  const a = Buffer.from(billToken(id, secret)), b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}

const istDate = (iso) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })

// ---------- layout ----------
const A4 = [595.28, 841.89]
const M = 36
const INK = rgb(0.11, 0.12, 0.14), MUTED = rgb(0.42, 0.45, 0.5), LINE = rgb(0.85, 0.87, 0.9), BRAND = rgb(0.09, 0.55, 0.3), HEAD_BG = rgb(0.94, 0.97, 0.95)
// Table columns (width, align). Sum = page width - 2 margins = 523.
const COLS = [
  ['#', 18, 'l'], ['Item', 143, 'l'], ['HSN', 48, 'l'], ['Cases', 34, 'r'], ['Rate', 48, 'r'], ['Taxable', 56, 'r'],
  ['GST', 30, 'r'], ['CGST', 44, 'r'], ['SGST', 44, 'r'], ['Amount', 58, 'r'],
]

/** bill = public._bill(id). Returns Uint8Array (PDF). */
export async function billPdf(bill) {
  if (!bill?.number) throw new Error('NOT_FOUND')
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const f = loadFonts()
  const R = await pdf.embedFont(f.regular, { subset: true })
  const B = await pdf.embedFont(f.bold, { subset: true })
  const seller = bill.seller ?? {}, buyer = bill.buyer ?? {}
  const gstin = seller.gstin || null
  pdf.setTitle(`${seller.name ?? 'K.D. Foods'} bill ${bill.number}`)
  pdf.setAuthor(seller.name ?? 'K.D. Foods')
  pdf.setCreator('K.D. Foods app')

  let page, y
  const W = (t, font, size) => font.widthOfTextAtSize(String(t), size)
  const text = (t, x, yy, { font = R, size = 9, color = INK, align = 'l', width = 0 } = {}) => {
    const s = String(t ?? '')
    const dx = align === 'r' ? width - W(s, font, size) : align === 'c' ? (width - W(s, font, size)) / 2 : 0
    page.drawText(s, { x: x + dx, y: yy, size, font, color })
  }
  const fit = (t, font, size, width) => {          // cut with "…" so text never runs into the next column
    let s = String(t ?? '')
    if (W(s, font, size) <= width) return s
    while (s.length > 1 && W(s + '…', font, size) > width) s = s.slice(0, -1)
    return s + '…'
  }
  const wrap = (t, font, size, width, maxLines = 2) => {
    const words = String(t ?? '').split(/\s+/), lines = []
    let cur = ''
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w
      if (W(next, font, size) <= width || !cur) cur = next
      else { lines.push(cur); cur = w }
    }
    if (cur) lines.push(cur)
    if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = fit(lines[maxLines - 1] + '…', font, size, width) }
    return lines.map((l) => fit(l, font, size, width))
  }
  const hr = (yy, color = LINE, x1 = M, x2 = A4[0] - M) => page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: 0.6, color })

  const newPage = (first) => {
    page = pdf.addPage(A4)
    y = A4[1] - M
    if (bill.voided) {
      page.drawText('CANCELLED', { x: 120, y: 300, size: 72, font: B, color: rgb(0.85, 0.15, 0.15), opacity: 0.18, rotate: degrees(35) })
    }
    if (!first) {
      text(`${seller.name ?? 'K.D. Foods'} · Bill ${bill.number} (continued)`, M, y - 10, { font: B, size: 9, color: MUTED })
      y -= 24
    }
  }
  const tableHead = () => {
    page.drawRectangle({ x: M, y: y - 16, width: A4[0] - 2 * M, height: 16, color: HEAD_BG })
    let x = M
    for (const [label, w, a] of COLS) { text(label, x + 3, y - 11, { font: B, size: 7.5, color: MUTED, align: a, width: w - 6 }); x += w }
    y -= 16
  }

  // ---- page 1 header ----
  newPage(true)
  text(seller.name ?? 'K.D. Foods', M, y - 16, { font: B, size: 18, color: BRAND })
  const title = gstin ? 'TAX INVOICE' : 'BILL'
  text(title, M, y - 16, { font: B, size: 14, align: 'r', width: A4[0] - 2 * M })
  y -= 26
  const sellerLines = [seller.legal_name && seller.legal_name !== seller.name ? seller.legal_name : null, seller.address,
    [seller.phone ? `Phone ${seller.phone}` : null, `State ${seller.state ?? 'Chhattisgarh'} (${seller.state_code ?? '22'})`].filter(Boolean).join(' · ')].filter(Boolean)
  for (const l of sellerLines.flatMap((s) => wrap(s, R, 8.5, 300, 2))) { text(l, M, y - 9, { size: 8.5, color: MUTED }); y -= 12 }
  text(`GSTIN: ${gstin ?? 'to be added'}`, M, y - 10, { font: B, size: 9, color: gstin ? INK : rgb(0.75, 0.35, 0.05) })
  // bill meta, right side
  const meta = [['Bill no.', bill.number], ['Date', istDate(bill.at)], ['Payment', `${bill.mode === 'upi' ? 'UPI' : 'Cash'} · paid`]]
  let my = A4[1] - M - 42
  for (const [k, v] of meta) {
    text(k, A4[0] - M - 200, my, { size: 8.5, color: MUTED })
    text(v, A4[0] - M - 130, my, { font: B, size: 9, align: 'r', width: 130 })
    my -= 13
  }
  y -= 18
  hr(y)
  y -= 14

  // ---- buyer ----
  text('Billed to', M, y, { size: 8, color: MUTED })
  text('Place of supply', A4[0] - M - 200, y, { size: 8, color: MUTED })
  y -= 13
  text(fit(buyer.name ?? '', B, 11, 300), M, y, { font: B, size: 11 })
  text(`${seller.state ?? 'Chhattisgarh'} (${seller.state_code ?? '22'})`, A4[0] - M - 200, y, { font: B, size: 9 })
  y -= 12
  const buyerLines = [buyer.owner, [buyer.address, buyer.locality].filter(Boolean).join(', '), buyer.phone ? `Phone ${buyer.phone}` : null,
    buyer.gstin ? `GSTIN ${buyer.gstin}` : null].filter(Boolean)
  for (const l of buyerLines) { text(fit(l, R, 8.5, 320), M, y, { size: 8.5, color: MUTED }); y -= 11.5 }
  y -= 8

  // ---- lines ----
  tableHead()
  const lines = bill.lines ?? []
  lines.forEach((l, i) => {
    const itemLines = wrap(l.item, R, 8.5, COLS[1][1] - 6, 2)
    const h = 8 + itemLines.length * 10
    if (y - h < M + 150) { newPage(false); tableHead() }
    const cells = [String(i + 1), null, l.hsn ?? '—', String(l.qty), money(l.price_paise), money(l.taxable_paise), pct(l.rate_bp),
      money(l.cgst_paise), money(l.sgst_paise), money(l.total_paise)]
    let x = M
    COLS.forEach(([, w, a], c) => {
      if (c === 1) itemLines.forEach((t, k) => text(t, x + 3, y - 12 - k * 10, { size: 8.5 }))
      else text(fit(cells[c], c === 9 ? B : R, 8, w - 6), x + 3, y - 12, { font: c === 9 ? B : R, size: 8, align: a, width: w - 6 })
      x += w
    })
    y -= h
    hr(y)
  })
  if (!lines.length) { text('No items', M + 3, y - 12, { size: 8.5, color: MUTED }); y -= 20 }

  // ---- totals ----
  if (y < M + 150) newPage(false)
  y -= 8
  const cases = lines.reduce((a, l) => a + Number(l.qty), 0)
  const totals = [['Cases', String(cases)], ['Taxable value', money(bill.taxable_paise)], ['CGST', money(bill.cgst_paise)], ['SGST', money(bill.sgst_paise)]]
  const tx = A4[0] - M - 220
  for (const [k, v] of totals) { text(k, tx, y - 10, { size: 9, color: MUTED }); text(v, tx + 100, y - 10, { size: 9, align: 'r', width: 120 }); y -= 14 }
  hr(y - 2, INK, tx, A4[0] - M)
  y -= 6
  text('Total', tx, y - 13, { font: B, size: 12 })
  text(money(bill.total_paise), tx + 80, y - 13, { font: B, size: 12, align: 'r', width: 140 })
  // GST summary by rate (left side, same height)
  const byRate = new Map()
  for (const l of lines) {
    const k = Number(l.rate_bp ?? 0), cur = byRate.get(k) ?? { taxable: 0, cgst: 0, sgst: 0 }
    byRate.set(k, { taxable: cur.taxable + Number(l.taxable_paise), cgst: cur.cgst + Number(l.cgst_paise), sgst: cur.sgst + Number(l.sgst_paise) })
  }
  let sy = y + 62
  text('GST summary', M, sy, { font: B, size: 8.5 })
  sy -= 12
  for (const [rate, v] of [...byRate].sort((a, b) => b[0] - a[0])) {
    text(`${pct(rate)}: taxable ${money(v.taxable)} · CGST ${money(v.cgst)} · SGST ${money(v.sgst)}`, M, sy, { size: 8, color: MUTED }); sy -= 11
  }
  y -= 26
  text(`In words: ${amountInWords(bill.total_paise)}`, M, y, { size: 8.5 })
  y -= 14
  text('Prices include GST. Goods sold within Chhattisgarh: CGST + SGST.', M, y, { size: 8, color: MUTED })
  if (!gstin) { y -= 11; text('Our GSTIN will be printed here once added. Ask us for a fresh copy if you need it for GST credit.', M, y, { size: 8, color: rgb(0.75, 0.35, 0.05) }) }
  if (bill.missing_gst) { y -= 11; text('Some items have no HSN/GST rate set yet; they are shown at 0%.', M, y, { size: 8, color: rgb(0.75, 0.35, 0.05) }) }
  if (bill.voided) { y -= 13; text(`This bill was cancelled${bill.void_reason ? ': ' + bill.void_reason : ''}.`, M, y, { font: B, size: 9, color: rgb(0.8, 0.15, 0.15) }) }

  // ---- footer ----
  const fy = M + 40
  text('Thank you for your business.', M, fy, { size: 9 })
  text(`For ${seller.legal_name ?? seller.name ?? 'K.D. Foods'}`, A4[0] - M - 220, fy, { font: B, size: 9, align: 'r', width: 220 })
  text('Authorised signatory', A4[0] - M - 220, fy - 28, { size: 8, color: MUTED, align: 'r', width: 220 })
  text('Computer-made bill.', M, fy - 28, { size: 7.5, color: MUTED })

  const n = pdf.getPageCount()
  pdf.getPages().forEach((p, i) => { page = p; if (n > 1) text(`Page ${i + 1} of ${n}`, M, M - 14, { size: 7.5, color: MUTED, align: 'r', width: A4[0] - 2 * M }) })
  return pdf.save()
}
