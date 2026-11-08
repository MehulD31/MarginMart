import { describe, expect, it } from 'vitest'
import { analyze, factsForAI } from './insights.js'

const S = (id: string, area = 'Supela', phone = '98' + id.padStart(8, '0')) => ({ id, name: `Shop ${id}`, owner: `Owner ${id}`, phone, area, route: 'R1' })
const I = (id: string, on_hand: number) => ({ id, label: `Item ${id}`, brand: 'PepsiCo', img: null, on_hand, low: 5, cost: 400 })
let n = 0
const B = (shop: string, day: string, lines: [string, number, number][]) => ({ id: `c:${++n}`, at: `${day}T10:00:00Z`, day, shop, src: 'counter',
  lines: lines.map(([item, qty, price]) => [item, qty, qty * price, qty * 400]) })

const data = {
  today: '2026-11-20', admin: true, dues: { s2: [100000, 50000] },
  shops: [S('s1'), S('s2'), S('s3'), S('s4', 'Durg'), S('s5'), S('s6', 'Supela', null as unknown as string)],
  items: [I('sting', 12), I('nimbooz', 100), I('lays', 0), I('slice', 40)],
  bills: [
    // s1: every 4 days, sting 5 + nimbooz 2; last on the 12th -> 8 days ago, late by 4
    B('s1', '2026-11-04', [['sting', 5, 500], ['nimbooz', 2, 450]]),
    B('s1', '2026-11-08', [['sting', 5, 500], ['nimbooz', 2, 450]]),
    B('s1', '2026-11-12', [['sting', 6, 500], ['nimbooz', 2, 450]]),
    // s2: every 7 days, sting + slice
    B('s2', '2026-11-06', [['sting', 3, 500], ['slice', 4, 300]]),
    B('s2', '2026-11-13', [['sting', 3, 500], ['slice', 4, 300]]),
    B('s2', '2026-11-20', [['sting', 4, 500]]),
    // s3: once, sting only -> should be recommended nimbooz/slice
    B('s3', '2026-11-18', [['sting', 2, 500]]),
  ],
}

describe('analyze', () => {
  const a = analyze(data)
  it('totals and windows', () => {
    expect(a.kpi.all.bills).toBe(7)
    expect(a.kpi.today.cases).toBe(4)
    expect(a.kpi.last7.bills).toBe(2)                      // window 14th-20th: the 18th and the 20th
    expect(a.kpi.all.margin).toBe(a.kpi.all.value - a.kpi.all.cases * 400)
    expect(a.daily).toHaveLength(30)
    expect(a.daily.at(-1)).toMatchObject({ day: '2026-11-20', cases: 4 })
  })
  it('most sold items, stock cover and Pepsi order', () => {
    expect(a.sold[0]).toMatchObject({ id: 'sting', cases: 28, shops: 3 })
    expect(a.sold[0].topBuyers[0]).toMatchObject({ id: 's1', name: 'Shop s1', cases: 16 })
    const sting = a.items.find((i) => i.id === 'sting')!
    expect(sting.perDay).toBeGreaterThan(0)
    expect(sting.coverDays).toBeLessThanOrEqual(12)
    expect(sting.reorder).toBeGreaterThan(0)
    expect(a.deadStock.map((i) => i.id)).toEqual([])         // everything with stock has sold at least once
  })
  it('reorder rhythm: who is late and what they usually take', () => {
    const s1 = a.shops.find((s) => s.id === 's1')!
    expect(s1.gap).toBe(4)
    expect(s1.since).toBe(8)
    expect(s1.lateBy).toBe(4)
    expect(s1.likely[0]).toMatchObject({ item: 'sting', qty: 5, times: 3 })
    expect(a.callToday.map((s) => s.id)).toContain('s1')
    expect(a.callToday.map((s) => s.id)).not.toContain('s2')   // bought today
    const s2 = a.shops.find((s) => s.id === 's2')!
    expect(s2).toMatchObject({ gap: 7, since: 0, overdue: 50000 })
  })
  it('segments and recommendations', () => {
    expect(a.shops.find((s) => s.id === 's3')!.segment).toBe('new')
    expect(a.shops.find((s) => s.id === 's1')!.segment).toBe('atRisk')     // every 4 days, now 8 days quiet
    expect(a.shops.find((s) => s.id === 's2')!.segment).toBe('loyal')        // regular, but s1 is the top-value shop
    const rec = a.shops.find((s) => s.id === 's3')!.recommend.map((r) => r.item)
    expect(rec).toContain('nimbooz')                          // bought with sting by s1
    expect(rec).not.toContain('lays')                         // out of stock is never suggested
  })
  it('areas, prospects and alerts', () => {
    const supela = a.areas.find((x) => x.area === 'Supela')!
    expect(supela).toMatchObject({ total: 5, buyers: 3, untapped: 2 })
    expect(a.prospects.map((p) => p.id)).toEqual(['s5'])       // s4 is in an area with no sales, s6 has no phone
    expect(a.alerts.some((x) => x.kind === 'dues')).toBe(true)
    expect(a.alerts.some((x) => x.kind === 'lateShop' && x.shop === 'Shop s1')).toBe(true)
  })
  it('manager view hides cost and margin', () => {
    const m = analyze({ ...data, admin: false, bills: data.bills.map((b) => ({ ...b, lines: b.lines.map((l) => [l[0], l[1], l[2], null]) })) })
    expect(m.kpi.all.margin).toBeNull()
    expect(m.sold[0].marginPerCase).toBeNull()
    expect(JSON.stringify(factsForAI(m))).not.toContain('margin_per_case')
  })
  it('works with no sales at all', () => {
    const e = analyze({ today: '2026-11-20', admin: true, bills: [], shops: [S('x')], items: [I('sting', 5)], dues: {} })
    expect(e.kpi.all.bills).toBe(0)
    expect(e.callToday).toEqual([])
    expect(e.deadStock.map((i) => i.id)).toEqual(['sting'])
  })
})
