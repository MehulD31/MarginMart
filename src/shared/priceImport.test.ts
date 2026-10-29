import { describe, expect, it } from 'vitest'
import { matchRows, parseSheet, type PackRef } from './priceImport'

// Mirrors the layout of the PepsiCo sheet: a title row, then the header row, then data.
const grid: unknown[][] = [
  ['01-09-26', 'PEPSI SCHEME'],
  ['PACK', '# Btls', 'MRP', 'Trade Margin', 'Trade Price', 'Scheme Value', 'TS', 'Net Rate After Sch', 'Scheme', 'Remarks'],
  ['300ml Can', 24, 40, 185, 775, 0, 185, 775, 'Net Rate', ''],
  ['1.2 LTR SLICE', 12, 70, 130, 710, 290, 420, 420, 'BOGO Offer on MRP', ''],
  ['750ml', 24, 40, 140, 820, 0, 140, 820, 'Net Rate', ''],
  ['750ml', 24, 35, 110, 730, 0, 110, 730, 'Net Rate', ''],
  ['Brand New Pack', 12, 50, 0, 500, 0, 0, 500, 'Net Rate', ''],
  ['', null, null],
]

const packs: PackRef[] = [
  { id: 'can', source_name: '300ml Can', name_en: '300ml Can', units_per_case: 24, mrp_paise: 4000 },
  { id: 'slice', source_name: '1.2 LTR SLICE', name_en: 'Slice 1.2L', units_per_case: 12, mrp_paise: 6500 },
  { id: '750-40', source_name: '750ml|40', name_en: '750ml (MRP 40)', units_per_case: 24, mrp_paise: 4000 },
  { id: '750-35', source_name: '750ml|35', name_en: '750ml (MRP 35)', units_per_case: 24, mrp_paise: 3500 },
]

describe('price sheet import', () => {
  const rows = parseSheet(grid)

  it('finds the header and skips blank rows', () => {
    expect(rows).toHaveLength(5)
    expect(rows[1]).toMatchObject({ name: '1.2 LTR SLICE', trade_price_paise: 71000, scheme_value_paise: 29000, bogo: true })
  })

  it('matches by sheet name, and duplicate names by MRP', () => {
    const r = matchRows(rows, packs)
    expect(r.matched.map((m) => m.pack.id)).toEqual(['can', 'slice', '750-40', '750-35'])
    expect(r.unmatched.map((u) => u.name)).toEqual(['Brand New Pack'])
  })

  it('warns when MRP changed versus the catalogue', () => {
    const slice = matchRows(rows, packs).matched.find((m) => m.pack.id === 'slice')!
    expect(slice.warnings).toContain('MRP_CHANGED')
  })

  it('rejects a sheet without the expected headers', () => {
    expect(() => parseSheet([['foo', 'bar']])).toThrow('SHEET_FORMAT')
  })
})
