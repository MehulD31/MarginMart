// Turns rows from the PepsiCo scheme sheet into price-list items, matched to packs.
// Pure (no Excel/DB) so it is unit-tested; the page reads the file with exceljs.
import { parseRupees } from './pricing'

export interface SheetRow {
  rowNo: number
  name: string
  units: number | null
  mrp_paise: number | null
  trade_price_paise: number | null
  scheme_value_paise: number
  bogo: boolean
}

export interface PackRef { id: string; source_name: string | null; name_en: string; units_per_case: number; mrp_paise: number }

export interface ImportResult {
  matched: { row: SheetRow; pack: PackRef; warnings: string[] }[]
  unmatched: SheetRow[]
}

export const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

const HEADERS = { name: 'pack', units: '# btls', mrp: 'mrp', trade: 'trade price', scheme: 'scheme value', type: 'scheme' }

/** Finds the header row and column positions, then extracts data rows. `grid` is rows of cell values. */
export function parseSheet(grid: unknown[][]): SheetRow[] {
  const text = (v: unknown) => normalize(String(v ?? ''))
  const headerIdx = grid.findIndex((r) => r.some((c) => text(c) === HEADERS.name) && r.some((c) => text(c).startsWith('trade price')))
  if (headerIdx < 0) throw new Error('SHEET_FORMAT')
  const h = grid[headerIdx].map(text)
  const col = (key: string, starts = false) => h.findIndex((c) => (starts ? c.startsWith(key) : c === key))
  const ci = {
    name: col(HEADERS.name), units: col(HEADERS.units), mrp: col(HEADERS.mrp), trade: col(HEADERS.trade, true),
    scheme: col(HEADERS.scheme, true), type: col(HEADERS.type),
  }
  if (ci.name < 0 || ci.trade < 0 || ci.mrp < 0) throw new Error('SHEET_FORMAT')

  const rows: SheetRow[] = []
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const r = grid[i]
    const name = String(r[ci.name] ?? '').replace(/\s+/g, ' ').trim()
    if (!name) continue
    const units = parseRupees(r[ci.units])
    rows.push({
      rowNo: i + 1,
      name,
      units: units === null ? null : units / 100,
      mrp_paise: parseRupees(r[ci.mrp]),
      trade_price_paise: parseRupees(r[ci.trade]),
      scheme_value_paise: ci.scheme >= 0 ? parseRupees(r[ci.scheme]) ?? 0 : 0,
      bogo: ci.type >= 0 && /bogo/i.test(String(r[ci.type] ?? '')),
    })
  }
  return rows
}

/** Match by source_name; rows whose name repeats in the sheet are keyed "name|MRP". */
export function matchRows(rows: SheetRow[], packs: PackRef[]): ImportResult {
  const counts = new Map<string, number>()
  for (const r of rows) counts.set(normalize(r.name), (counts.get(normalize(r.name)) ?? 0) + 1)
  const bySource = new Map(packs.filter((p) => p.source_name).map((p) => [normalize(p.source_name!), p]))

  const result: ImportResult = { matched: [], unmatched: [] }
  for (const row of rows) {
    const n = normalize(row.name)
    const key = (counts.get(n) ?? 0) > 1 && row.mrp_paise !== null ? `${n}|${row.mrp_paise / 100}` : n
    const pack = bySource.get(key) ?? bySource.get(n)
    if (!pack || row.trade_price_paise === null) { result.unmatched.push(row); continue }
    const warnings: string[] = []
    if (row.units !== null && row.units !== pack.units_per_case) warnings.push('UNITS_CHANGED')
    if (row.mrp_paise !== null && row.mrp_paise !== pack.mrp_paise) warnings.push('MRP_CHANGED')
    if (row.scheme_value_paise >= row.trade_price_paise) warnings.push('SCHEME_TOO_HIGH')
    result.matched.push({ row, pack, warnings })
  }
  return result
}
