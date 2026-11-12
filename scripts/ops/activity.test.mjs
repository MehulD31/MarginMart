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
    expect(out[0]).toContain('<b>Vehicle 1</b> · V1 Supela')
    expect(out[0]).toContain('<b>86 peti</b> · 3 item')
    expect(out[0]).toContain('• Sting 250 — <b>50</b>')
  })
  it('bills, cancels, purchases and manual stock changes', () => {
    const out = describe({ rows: [
      row('cash_sale', 'insert', { number: 'KD-00018', shop_id: 's1', total_paise: 495000, payment_mode: 'cash' }, null, 'b18'),
      row('cash_sale', 'update', { number: 'KD-00011', voided_at: 'x', total_paise: 10000, void_reason: 'galat' }, { voided_at: null }, 'b11'),
      row('purchase', 'insert', { supplier_id: 'x', invoice_no: '77', total_paise: 12000000 }),
      row('stock_move', 'insert', { variant_id: 'v2', qty: -3, reason: 'toota' }),
    ] }, L)
    expect(out).toEqual(['🧾 Bill <b>KD-00018</b> · Sharma Kirana · <b>₹4,950</b> (cash)', '🚫 Bill KD-00011 cancel kiya (<b>₹100</b>): galat', '📦 Purchase · Pepsi #77 · <b>₹1,20,000</b>', '📊 Stock <b>-3</b> · Aquafina 1L · "toota"'])
  })
  it('deletes and unknown changes are never hidden', () => {
    const out = describe({ rows: [row('shop', 'delete', null, { name: 'X' }), row('price_list_item', 'update', {}), row('price_list_item', 'update', {})] }, L)
    expect(out).toEqual(['🗑 dukaan: 1 delete', '✏️ rate: 2 badlav'])
  })
  it('escapes names so Telegram HTML never breaks', () => {
    const out = describe({ rows: [row('shop', 'insert', { name: 'A<b>&B' })] }, L)
    expect(out[0]).toBe('🏪 Nayi dukaan: <b>A&lt;b&gt;&amp;B</b>')
  })
  it('an unload says what came back and what was sold, not that the truck left', () => {
    const rows = [row('route_day_plan', 'update', { status: 'out', unloaded_at: 'x' }, { status: 'loaded', unloaded_at: null }),
      row('load_line', 'update', { variant_id: 'v1', qty_returned: 6, qty_spare: 10, qty_ordered_total: 0 }), row('load_line', 'update', { variant_id: 'v2', qty_returned: 0, qty_spare: 5, qty_ordered_total: 0 }),
      row('stock_move', 'insert', { route_day_plan_id: 'p1', qty: 6, reason: 'Unloaded' })]
    const out = describe({ rows }, L)
    expect(out).toHaveLength(1)
    expect(out[0]).toContain('Truck wapas (unload)')
    expect(out[0]).toContain('wapas godown <b>6</b>')
    expect(out[0]).toContain('bika (parchi baaki) <b>80</b>')
    expect(out[0]).not.toContain('nikal')
  })
  it('a bill saved with total 0 then filled in shows the final total', () => {
    const rows = [row('cash_sale', 'insert', { number: 'KD-00018', shop_id: 's1', total_paise: 0, payment_mode: 'cash' }, null, 'b1'),
      row('cash_sale_line', 'insert', {}), row('cash_sale', 'update', { number: 'KD-00018', shop_id: 's1', total_paise: 264500, payment_mode: 'cash' }, { total_paise: 0 }, 'b1')]
    expect(describe({ rows }, L)).toEqual(['🧾 Bill <b>KD-00018</b> · Sharma Kirana · <b>₹2,645</b> (cash)'])
  })
  it('groups rows saved together by the same person', () => {
    const g = groupRows([{ actor: 'a', at: '1' }, { actor: 'a', at: '1' }, { actor: 'b', at: '1' }, { actor: 'a', at: '2' }])
    expect(g.map((x) => x.rows.length)).toEqual([2, 1, 1])
  })
})
