// Reads a Pepsi order/invoice export (SKU Code, Child SKU Description, Order Qty, Order Value).
// Pure so it is unit-tested; the page reads the file with exceljs.

export interface InvoiceLine { sku: string; desc: string; qty: number; valuePaise: number }

const toNum = (v: unknown) => (typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d.-]/g, '')))

export function parseInvoice(grid: unknown[][]): InvoiceLine[] {
  const text = (v: unknown) => String(v ?? '').trim()
  const h = grid.findIndex((row) => row.some((c) => /order\s*qty/i.test(text(c))) && row.some((c) => /order\s*value/i.test(text(c))))
  if (h < 0) throw new Error('SHEET_FORMAT')
  const head = grid[h].map(text)
  const col = (re: RegExp) => head.findIndex((c) => re.test(c))
  const sku = col(/sku\s*cod/i), desc = col(/desc/i), qty = col(/order\s*qty/i), val = col(/order\s*value/i)
  if (sku < 0 || qty < 0 || val < 0) throw new Error('SHEET_FORMAT')
  const out: InvoiceLine[] = []
  for (const row of grid.slice(h + 1)) {
    const d = text(row[desc >= 0 ? desc : sku])
    if (/total/i.test(d) || /total/i.test(text(row[sku]))) continue
    const code = text(row[sku]).replace(/\D/g, '')
    const q = toNum(row[qty]), v = toNum(row[val])
    if (!code || !(q > 0) || !(v > 0)) continue
    out.push({ sku: code, desc: d, qty: Math.round(q), valuePaise: Math.round(v * 100) })
  }
  return out
}

/** Combine lines that map to the same flavour; cost per case = total value / total cases. */
export function mergeByVariant(lines: { variant_id: string; qty: number; valuePaise: number }[]) {
  const m = new Map<string, { qty: number; value: number }>()
  for (const l of lines) { const x = m.get(l.variant_id) ?? { qty: 0, value: 0 }; m.set(l.variant_id, { qty: x.qty + l.qty, value: x.value + l.valuePaise }) }
  return [...m.entries()].map(([variant_id, x]) => ({ variant_id, qty: x.qty, cost_paise: Math.round(x.value / x.qty) }))
}
