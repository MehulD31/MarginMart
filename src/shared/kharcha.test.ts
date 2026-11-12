import { describe, expect, it } from 'vitest'
import { fixedPerDay, parseKharcha, pnl, spendBudget } from './kharcha.js'

const s = {
  fixed_costs: [{ label: 'EMI', paise: 2500000 }, { label: 'Drivers (3)', paise: 4500000 }, { label: 'Helpers (3)', paise: 3000000 },
    { label: 'Manager', paise: 2000000 }, { label: 'Director', paise: 3000000 }, { label: 'Miscellaneous', paise: 2000000 }],
  spend_line: 'Miscellaneous', working_days: 26, loading_paise_per_case: 125, cash_discount_paise: 100, on_time_pct: 70,
}

describe('kharcha P&L', () => {
  it('charges every fixed line per working day except Miscellaneous (real spends are charged instead)', () => {
    expect(fixedPerDay(s)).toBe(576923)            // ₹1,50,000 / 26
  })
  it('today: margin minus loading, spends and the day share of fixed', () => {
    const r = pnl({ cases: 57, sales_paise: 2145000, cost_paise: 1962892 }, [{ amount_paise: 80000, category: 'Petrol/Diesel' }, { amount_paise: 150000, category: 'Vehicle rent' }], s, 1)
    expect(r.margin).toBe(182108)
    expect(r.variable).toBe(57 * 195)
    expect(r.kharcha).toBe(230000)
    expect(r.profit).toBe(182108 - 57 * 195 - 230000 - 576923)
    expect(r.byCat['Vehicle rent']).toBe(150000)
    expect(r.need).toBeGreaterThan(0)
  })
  it('no sales and no spends on a day off charges nothing for the month view', () => {
    expect(pnl({ cases: 0, sales_paise: 0, cost_paise: 0 }, [], s, 0).profit).toBe(0)
  })
  it('budget vs actual for the spend line', () => {
    expect(spendBudget(s, [{ amount_paise: 1500000 }, { amount_paise: 600000 }])).toMatchObject({ budget: 2000000, spent: 2100000, left: -100000, over: true })
  })
})

describe('parseKharcha (Telegram "petrol 800")', () => {
  it('reads amount and guesses the category', () => {
    expect(parseKharcha('petrol 800')).toMatchObject({ amount_paise: 80000, category: 'Petrol/Diesel' })
    expect(parseKharcha('gaadi kiraya 1,500 tata ace')).toMatchObject({ amount_paise: 150000, category: 'Vehicle rent', note: 'gaadi kiraya tata ace' })
    expect(parseKharcha('₹60 chai')).toMatchObject({ amount_paise: 6000, category: 'Tea/Food' })
    expect(parseKharcha('puncture 250')).toMatchObject({ category: 'Repair' })
    expect(parseKharcha('stationery 120')).toMatchObject({ category: 'Other' })
  })
  it('rejects text without a sensible amount', () => {
    expect(parseKharcha('petrol')).toBe(null)
    expect(parseKharcha('petrol 0')).toBe(null)
  })
})
