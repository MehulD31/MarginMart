import { describe, expect, it } from 'vitest'
import { itemName, periodOf, reportHtml, rupees, type SalesReport } from './salesReport.js'

const r: SalesReport = {
  from: '2020-01-01', to: '2026-11-13', first_sale: '2026-11-06', last_sale: '2026-11-12',
  totals: { bills: 31, shops: 27, days: 3, items: 2, cases: 360, units: 9902, gross_paise: 16105500, discount_paise: 17000, net_paise: 16088500, cost_paise: 15407200, margin_paise: 681300 },
  by_mode: [{ mode: 'cash', bills: 29, net: 12540500 }], by_channel: [{ channel: 'counter', bills: 17, cases: 303, net: 13960000 }],
  by_item: [{ item: 'Nimbooz 345ml Nimbooz 345ml', brand: 'Pepsi', cases: 54, units: 1620, amount_paise: 2800000, avg_rate_paise: 51852, margin_paise: 90000, bills: 11, shops: 10, first_sold: '2026-11-06', last_sold: '2026-11-12' }],
  by_brand: [{ brand: 'Pepsi', cases: 297, amount_paise: 12850000 }], by_day: [{ dy: '2026-11-06', bills: 5, cases: 120, amount_paise: 6000000 }],
  top_shops: [{ name: 'Paul <Aqua>', locality: 'Supela', bills: 1, cases: 50, amount_paise: 2475000 }],
}

describe('sales report', () => {
  it('periods', () => {
    expect(periodOf('month', '2026-11-13')).toMatchObject({ from: '2026-11-01', to: '2026-11-13' })
    expect(periodOf('lastmonth', '2026-11-13')).toMatchObject({ from: '2026-10-01', to: '2026-10-31' })
    expect(periodOf('lastweek', '2026-11-16')).toMatchObject({ from: '2026-11-09', to: '2026-11-15' })   // Mon 16 Nov -> Mon 9 .. Sun 15
    expect(periodOf('week', '2026-11-13')).toMatchObject({ from: '2026-11-07', to: '2026-11-13' })
  })
  it('html has the totals, items once-named, escaped shops, and starts at the first sale', () => {
    const h = reportHtml(r, { label: 'Till date' })
    expect(h).toContain('₹1,60,885')
    expect(h).toContain('>360<')
    expect(h).toContain('Nimbooz 345ml<')
    expect(h).not.toContain('Nimbooz 345ml Nimbooz')
    expect(h).toContain('Paul &lt;Aqua&gt;')
    expect(h).toContain('6 Nov 2026 – 13 Nov 2026')
    expect(h).toContain('Margin')
    expect(reportHtml(r, { showMargin: false })).not.toContain('Margin (over buy price)')
  })
  it('helpers', () => {
    expect(rupees(16088500)).toBe('₹1,60,885')
    expect(itemName('Slice Slice')).toBe('Slice')
    expect(reportHtml({ ...r, totals: { ...r.totals, bills: 0 } })).toContain('No sales in this period.')
  })
})
