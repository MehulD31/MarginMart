import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { amountInWords, billPdf, billToken, billTokenOk, money, pct } from '../../api/_billpdf.js'

const line = (i, extra = {}) => ({ item: `Sting PET 250ml (Red) ${i}`, hsn: '22029999', rate_bp: 4000, qty: 50, price_paise: 49500,
  total_paise: 2475000, taxable_paise: 1767857, cgst_paise: 353572, sgst_paise: 353571, ...extra })
const BILL = {
  id: '63eb175a-9643-4711-a389-0ed4757e37ad', number: 'KD-00001', at: '2026-11-08T06:03:00Z', mode: 'cash', total_paise: 2475000,
  voided: false, void_reason: null, taxable_paise: 1767857, cgst_paise: 353572, sgst_paise: 353571, missing_gst: false,
  seller: { name: 'K.D. Foods', legal_name: 'Fortifit Nutrition Private Limited', gstin: null, address: 'Bhilai', phone: '96300 12636', state: 'Chhattisgarh', state_code: '22' },
  buyer: { name: 'Shri Maruti Kirana', phone: '7999247999', locality: 'Charoda' },
  lines: [line(1)],
}

describe('amount in words (Indian system)', () => {
  const cases = [
    [0, 'Rupees Zero Only'], [100, 'Rupees One Only'], [2629500, 'Rupees Twenty Six Thousand Two Hundred Ninety Five Only'],
    [2475050, 'Rupees Twenty Four Thousand Seven Hundred Fifty and Fifty Paise Only'], [99, 'Ninety Nine Paise Only'],
    [69139500, 'Rupees Six Lakh Ninety One Thousand Three Hundred Ninety Five Only'], [1000000000, 'Rupees One Crore Only'],
    [12345678900, 'Rupees Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine Only'], [1100000, 'Rupees Eleven Thousand Only'],
  ]
  for (const [p, w] of cases) it(String(p), () => expect(amountInWords(p)).toBe(w))
})

describe('formatting', () => {
  it('money with Indian commas and paise', () => expect(money(1767857)).toBe('₹17,678.57'))
  it('percent from basis points', () => { expect(pct(4000)).toBe('40%'); expect(pct(500)).toBe('5%'); expect(pct(250)).toBe('2.5%') })
})

describe('signed bill links', () => {
  const s = 'x'.repeat(48)
  it('a link opens only its own bill', () => {
    const t = billToken(BILL.id, s)
    expect(t).toHaveLength(32)
    expect(billTokenOk(BILL.id, t, s)).toBe(true)
    expect(billTokenOk('00000000-0000-4000-8000-000000000000', t, s)).toBe(false)
    expect(billTokenOk(BILL.id, t, 'y'.repeat(48))).toBe(false)
    expect(billTokenOk(BILL.id, t.slice(0, 31) + (t.at(-1) === 'A' ? 'B' : 'A'), s)).toBe(false)
    expect(billTokenOk(BILL.id, null, s)).toBe(false)
    expect(billTokenOk(BILL.id, t, '')).toBe(false)
  })
})

describe('bill PDF', () => {
  it('one page for a normal bill, with title + metadata', async () => {
    const doc = await PDFDocument.load(await billPdf(BILL))
    expect(doc.getPageCount()).toBe(1)
    expect(doc.getTitle()).toBe('K.D. Foods bill KD-00001')
  })
  it('long bills flow onto more pages', async () => {
    const lines = Array.from({ length: 60 }, (_, i) => line(i + 1))
    const doc = await PDFDocument.load(await billPdf({ ...BILL, lines }))
    expect(doc.getPageCount()).toBeGreaterThan(1)
  })
  it('cancelled bill, GSTIN set, long names and missing HSN still build', async () => {
    const b = { ...BILL, voided: true, void_reason: 'galat entry', missing_gst: true, seller: { ...BILL.seller, gstin: '22AAECF7513L1Z5' },
      buyer: { ...BILL.buyer, name: 'Shri Maa Durga Kirana and General Store Very Long Name Bhilai Charoda', gstin: '22ABCDE1234F1Z5' },
      lines: [line(1, { item: 'Mix Fruit / Apple / Litchi Tetra 125ml (Mix Fruit / Apple / Litchi Tetra 125ml)', hsn: null, rate_bp: 0 })] }
    expect((await billPdf(b)).length).toBeGreaterThan(5000)
  })
  it('no bill -> error', async () => { await expect(billPdf(null)).rejects.toThrow('NOT_FOUND') })
})
