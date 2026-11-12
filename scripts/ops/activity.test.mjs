import { describe as suite, expect, it } from 'vitest'
import { describe, groupRows } from './activity.mjs'

const L = {
  variant: (id) => ({ v1: 'Sting 250', v2: 'Aquafina 1L', v3: 'Pepsi 600' }[id]), route: () => 'V1 Supela', vehicle: () => 'Vehicle 1',
  shop: (id) => ({ s1: 'Sharma Kirana' }[id]), supplier: () => 'Pepsi', load: () => [{ variant_id: 'v1', qty: 50 }, { variant_id: 'v2', qty: 30 }, { variant_id: 'v3', qty: 6 }],
}
const row = (table_name, action, after, before = null, row_id = 'p1') => ({ table_name, action, after, before, row_id, actor: 'u1', at: 't1' })

suite('website activity', () => {
  it('a truck load becomes one line with total and top items, not 27 raw changes', () => {
    const rows = [row('route_day_plan', 'update', { status: 'loaded', route_id: 'r', vehicle_id: 'v' }, { status: 'planning' }),
      ...Array.from({ length: 13 }, () => row('load_line', 'insert', {})), ...Array.from({ length: 13 }, () => row('stock_move', 'insert', { route_day_plan_id: 'p1', qty: -5 }))]
    const out = describe({ rows }, L)
    expect(out).toHaveLength(1)
    expect(out[0]).toContain('Vehicle 1 · V1 Supela load ki: 86 peti')
    expect(out[0]).toContain('Sting 250 50')
  })
  it('bills, cancels, purchases and manual stock changes', () => {
    const out = describe({ rows: [
      row('cash_sale', 'insert', { number: 'KD-00018', shop_id: 's1', total_paise: 495000, payment_mode: 'cash' }),
      row('cash_sale', 'update', { number: 'KD-00011', voided_at: 'x', total_paise: 10000, void_reason: 'galat' }, { voided_at: null }),
      row('purchase', 'insert', { supplier_id: 'x', invoice_no: '77', total_paise: 12000000 }),
      row('stock_move', 'insert', { variant_id: 'v2', qty: -3, reason: 'toota' }),
    ] }, L)
    expect(out).toEqual(['🧾 Bill KD-00018 · Sharma Kirana · ₹4,950 (cash)', '🚫 Bill KD-00011 cancel kiya (₹100): galat', '📦 Purchase · Pepsi #77 · ₹1,20,000', '📊 Stock -3 · Aquafina 1L · "toota"'])
  })
  it('deletes and unknown changes are never hidden', () => {
    const out = describe({ rows: [row('shop', 'delete', null, { name: 'X' }), row('price_list_item', 'update', {}), row('price_list_item', 'update', {})] }, L)
    expect(out).toEqual(['🗑 dukaan: 1 delete', '✏️ rate: 2 badlav'])
  })
  it('groups rows saved together by the same person', () => {
    const g = groupRows([{ actor: 'a', at: '1' }, { actor: 'a', at: '1' }, { actor: 'b', at: '1' }, { actor: 'a', at: '2' }])
    expect(g.map((x) => x.rows.length)).toEqual([2, 1, 1])
  })
})
