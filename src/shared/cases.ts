// Cases with pieces: a quantity is kept as fractional cases (18 of 24 cans = 0.75, 15 of 30 = 0.5), shown as "1 case 6 pcs".
export const round6 = (n: number) => Math.round(n * 1e6) / 1e6
/** Whole cases and loose pieces of a quantity in cases. `units` = pieces in one case. */
export function splitQty(q: number, units: number) {
  const u = Math.max(1, units || 1)
  let c = Math.floor(q + 1e-9), p = Math.round((q - c) * u)
  if (p >= u) { c += 1; p = 0 }
  return { c: Math.max(0, c), p: Math.max(0, p) }
}
export const joinQty = (cases: number, pcs: number, units: number) => round6(cases + pcs / Math.max(1, units || 1))
/** True when the quantity is a whole number of pieces (what the database also checks). */
export const wholePieces = (q: number, units: number) => Math.abs(q * units - Math.round(q * units)) < 0.01
/** "12 cases", "1 case 6 pcs", "18 pcs", "0". Words come from the language files (qty.case, qty.cases, qty.pcs). */
export function qtyText(q: number, units: number, w: { case: string; cases: string; pcs: string }) {
  const { c, p } = splitQty(q, units)
  if (c === 0 && p === 0) return '0'
  const a = c ? `${c} ${c === 1 ? w.case : w.cases}` : ''
  const b = p ? `${p} ${w.pcs}` : ''
  return [a, b].filter(Boolean).join(' ')
}
/** Total of many items' quantities as plain cases (decimals only when there are pieces): 7, 7.25. */
export const casesNum = (q: number) => String(Math.round(q * 100) / 100)
