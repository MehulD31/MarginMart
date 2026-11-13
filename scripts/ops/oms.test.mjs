import { describe, expect, it } from 'vitest'
import { matchSku, omsItems, orderEvents, priceChanges } from './oms.mjs'

const it_ = (sku_code, description, mrp, price, child = '') => ({ sku_code, description, child, mrp, price_paise: price, units_per_case: 24 })
const items = [
  it_('5550303', 'STING RED STING-RED 250ML PET', 20, 48300),
  it_('5550000', 'STING RED STING-RED 180ML CAN', 30, 68400),
  it_('4076', 'NIMBOOZ CLOUDY LEMON 345ML PET', 20, 49800, '7 UP NIMBOZ 345ml PET 30 Rs20'),
  it_('1593', 'BLACK COLA 400ML PET', 20, 48900),
  it_('5550197', 'PEPSI MDC COLA 400ML PET', 20, 48900),
  it_('8531', 'TROP_PR/DELIGHT MIXED FRUIT 1.0L TETRA', 120, 99580),
  it_('5550082', 'TROP_PR/DELIGHT CRANBERRY 1.0L TETRA', 140, 116900),
  it_('2655', 'LEHAR EVERVESS SODA 750ML PET', 20, 33900),
]

describe('matchSku', () => {
  it('matches brand + size + pack', () => {
    expect(matchSku('Sting PET 250ml (Red)', 20, items)?.sku_code).toBe('5550303')
    expect(matchSku('Sting Red Sting Can 180ml', 30, items)?.sku_code).toBe('5550000')
  })
  it('tells Pepsi and Pepsi Black apart, and Nimbooz from 7UP', () => {
    expect(matchSku('Pepsi Black 400ml PET All Flavours', 20, items)?.sku_code).toBe('1593')
    expect(matchSku('Pepsi 400ml PET All Flavours', 20, items)?.sku_code).toBe('5550197')
    expect(matchSku('Nimbooz 345ml', 20, items)?.sku_code).toBe('4076')
  })
  it('a flavour word beats a matching MRP; soda is Lehar', () => {
    expect(matchSku('Tropicana Tetra 1L Cranberry', 120, items)?.sku_code).toBe('5550082')
    expect(matchSku('750ml Soda', 20, items)?.sku_code).toBe('2655')
  })
  it('returns null when nothing fits', () => expect(matchSku('Slice 1.2L', 70, items)).toBeNull())
})

describe('omsItems', () => {
  it('joins SKUs with the highest positive price row', () => {
    const r = omsItems({ skus: [{ sku_code: '1', sku_description: 'X 250ML PET', mrp: 20, factor_Case_BT: 30 }],
      prices: [{ sku_code: '1', price: 0 }, { sku_code: '1', price: 483, base_price: 345, base_tax: 138 }] })
    expect(r[0]).toMatchObject({ sku_code: '1', price_paise: 48300, base_paise: 34500, tax_paise: 13800, units_per_case: 30 })
  })
})

describe('priceChanges / orderEvents', () => {
  it('reports only changed prices of known SKUs', () => {
    const prev = new Map([['5550303', 47500], ['4076', 49800]])
    expect(priceChanges(prev, items)).toEqual([{ sku_code: '5550303', description: 'STING RED STING-RED 250ML PET', old: 47500, now: 48300 }])
  })
  it('finds new orders and invoices', () => {
    const a = [{ order_number: 'O1', order_status: 'Created' }]
    const b = [{ order_number: 'O1', order_status: 'Invoiced', invoice_no: 'INV9', order_value: 46000 }, { order_number: 'O2', order_status: 'Created' }]
    const e = orderEvents(a, b)
    expect(e.map((x) => [x.kind, x.key])).toEqual([['invoiced', 'O1'], ['new', 'O2']])
    expect(e[0]).toMatchObject({ invoice: 'INV9', value: 46000 })
  })
})
