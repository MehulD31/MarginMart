import { describe, expect, it } from 'vitest'
import { netRate, parseRupees, shopMargin, shopMarginPct } from './pricing'

// Rows taken from the PepsiCo sheet dated 01-09-26.
const can300 = { units_per_case: 24, mrp_paise: 4000, trade_price_paise: 77500, scheme_value_paise: 0 }
const slice12 = { units_per_case: 12, mrp_paise: 7000, trade_price_paise: 71000, scheme_value_paise: 29000 }
const aquafina1l = { units_per_case: 12, mrp_paise: 2000, trade_price_paise: 14000, scheme_value_paise: 500 }

describe('pricing', () => {
  it('net rate = trade price minus scheme', () => {
    expect(netRate(can300)).toBe(77500)
    expect(netRate(slice12)).toBe(42000)   // sheet: Net Rate After Sch 420
    expect(netRate(aquafina1l)).toBe(13500) // sheet: 135
  })
  it('shop margin matches the sheet TS column', () => {
    expect(shopMargin(can300)).toBe(18500)  // 185
    expect(shopMargin(slice12)).toBe(42000) // 420
    expect(shopMargin(aquafina1l)).toBe(10500) // 105
  })
  it('margin percent of MRP value', () => {
    expect(shopMarginPct(can300)).toBe(19.3)
  })
  it('parses rupee strings to paise', () => {
    expect(parseRupees('₹1,051')).toBe(105100)
    expect(parseRupees('5.5')).toBe(550)
    expect(parseRupees(820)).toBe(82000)
    expect(parseRupees('')).toBeNull()
    expect(parseRupees('abc')).toBeNull()
  })
})
