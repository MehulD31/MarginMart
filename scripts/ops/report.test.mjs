import { describe, expect, it } from 'vitest'
import { dayText, rs, weekText } from './report.mjs'

const empty = { day: '2026-11-08', counter: { bills: 0, cases: 0, total_paise: 0, cash_paise: 0, upi_paise: 0, margin_paise: 0, below_cost_lines: 0 },
  route: { bills: 0, cases: 0, total_paise: 0 }, collected: { cash_paise: 0, upi_paise: 0 }, top_items: [], trucks: [], open_orders_tomorrow: 0 }

describe('rs', () => {
  it('formats paise as Indian rupees', () => {
    expect(rs(12345600)).toBe('₹1,23,456')
    expect(rs(null)).toBe('₹0')
  })
})

describe('dayText', () => {
  it('says plainly when nothing happened', () => {
    const { text, cases } = dayText(empty)
    expect(cases).toBe(0)
    expect(text).toContain('Abhi tak koi bikri ya vasooli nahi.')
    expect(text).not.toContain('Counter:')
  })
  it('adds counter + route cases and flags closing problems', () => {
    const d = { ...empty, counter: { ...empty.counter, bills: 2, cases: 30, total_paise: 1500000, cash_paise: 1000000, upi_paise: 500000, margin_paise: 60000, below_cost_lines: 1 },
      route: { bills: 3, cases: 20, total_paise: 1000000 },
      top_items: [{ item: 'Sting Sting', cases: 25 }],
      trucks: [{ route: 'V1', status: 'out', closed: false }, { route: 'V2', status: 'closed', closed: true, cash_received: true, expected_cash_paise: 500000, handed_cash_paise: 450000 }] }
    const { text, cases } = dayText(d)
    expect(cases).toBe(50)
    expect(text).toContain('Kul 50 peti · ₹25,000')
    expect(text).toContain('Sabse zyada: Sting 25')
    expect(text).toContain('V1: truck abhi tak close nahi hua')
    expect(text).toContain('V2: cash ₹500 kam')
    expect(text).toContain('1 line buy price se kam')
  })
})

describe('weekText', () => {
  it('compares with last week and links sleeping shops', () => {
    const day = (iso, cases) => ({ ...empty, day: iso, counter: { ...empty.counter, cases, total_paise: cases * 50000 } })
    const w = { end: '2026-11-07', days: [day('2026-11-01', 10), day('2026-11-02', 30)], prev_week_counter_cases: 20, prev_week_route_cases: 0, new_shops: 1,
      today: { dues: { total_paise: 0, overdue_paise: 0, top: [] } } }
    const { text, cases } = weekText(w, [{ name: 'Gupta', locality: 'Supela', days: 12, phone: '9876543210' }], () => 'LINK')
    expect(cases).toBe(40)
    expect(text).toContain('40 peti (pichhla hafta 20, +100%)')
    expect(text).toContain('Best din: 2 Nov (30 peti)')
    expect(text).toContain('• Gupta · Supela: 12 din\n  LINK')
  })
})
