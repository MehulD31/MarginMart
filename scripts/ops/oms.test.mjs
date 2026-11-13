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

import { invoiceLines, orderRows, unbookedInvoices, orderLines, lineKind } from './oms.mjs'

describe('orderLines', () => {
  const r = (o) => ({ 'Requested Order Number': 'RO9', 'Order Date': '2026-11-13', 'Sku Code': '1892', 'Sku Description': 'PEPSI COLA 1.25 L PET 15 Rs50 PROMO', 'Order Type Description Oms': 'General Order',
    'Pristine Order Quantity': 0, 'Corrected Order Quantity': 0, 'Allocated Order Quantity': 0, 'Invoiced Quantity Sap': 0, 'Deleted Quantity': 0, 'Allocated Order Value': 0,
    'Delete Reason Oms': '', 'Rejection Des Sap': 'nan', ...o })
  it('classifies Pepsi order types', () => {
    expect(lineKind('Near Expiry Order - NS01')).toBe('near_expiry')
    expect(lineKind('General Order, Range SKU Order')).toBe('range')
    expect(lineKind('General Order, Specific MRP Order')).toBe('specific_mrp')
    expect(lineKind('Filler Order')).toBe('filler')
    expect(lineKind('Must Bill Order')).toBe('must_bill')
    expect(lineKind('General Order')).toBe('general')
    expect(lineKind('')).toBe('other')
  })
  it('keeps Near Expiry apart from General lines of the same SKU and carries reasons', () => {
    const l = orderLines([
      r({ 'Pristine Order Quantity': 15, 'Corrected Order Quantity': 15, 'Allocated Order Value': 9615 }),
      r({ 'Order Type Description Oms': 'Near Expiry Order - NS01', 'Pristine Order Quantity': 15, 'Deleted Quantity': 15, 'Delete Reason Oms': 'PFA' }),
      r({ 'Order Type Description Oms': 'Near Expiry Order - NS01', 'Corrected Order Quantity': 5 })])
    expect(l.length).toBe(2)
    expect(l.find((x) => x.kind === 'general')).toMatchObject({ asked: 15, corrected: 15, value_paise: 961500, delete_reason: null, reject_reason: null })
    expect(l.find((x) => x.kind === 'near_expiry')).toMatchObject({ asked: 15, corrected: 5, deleted: 15, delete_reason: 'PFA' })
  })
  it('skips rows without an order or SKU', () => {
    expect(orderLines([r({ 'Requested Order Number': '' }), r({ 'Sku Code': 'nan' })])).toEqual([])
  })
})
const row = (o) => ({ 'Requested Order Number': 'RO1', 'Order Date': '2026-11-03', 'Sku Code': '4068', 'Sku Description': 'PEPSI BLACK 300ml CAN', 'Pristine Order Quantity': 0,
  'Corrected Order Quantity': 0, 'Allocated Order Quantity': 0, 'Invoiced Quantity Sap': 0, 'Invoiced Value Sap': 0, 'Invoice Number Sap': '', 'Invoiced Date Sap': 'NaT', 'Deleted Quantity': 0, ...o })
describe('reports', () => {
  const e2e = [row({ 'Pristine Order Quantity': 5, 'Corrected Order Quantity': 8, 'Allocated Order Quantity': 8, 'Invoiced Quantity Sap': 8, 'Invoiced Value Sap': 2621.43, 'Invoice Number Sap': '5348', 'Invoiced Date Sap': '2026-11-04' }),
    row({ 'Sku Code': '4189', 'Sku Description': 'MIRINDA 750', 'Pristine Order Quantity': 3, 'Corrected Order Quantity': 3, 'Invoiced Quantity Sap': 3, 'Invoiced Value Sap': 2000, 'Invoice Number Sap': '5348', 'Invoiced Date Sap': '2026-11-04' }),
    row({ 'Requested Order Number': 'RO2', 'Pristine Order Quantity': 50, 'Deleted Quantity': 50 })]
  it('groups invoice lines and orders', () => {
    expect(invoiceLines(e2e)).toEqual([
      { invoice_no: '5348', sku_code: '4068', description: 'PEPSI BLACK 300ml CAN', invoiced_on: '2026-11-04', order_no: 'RO1', qty: 8, value_paise: 262143 },
      { invoice_no: '5348', sku_code: '4189', description: 'MIRINDA 750', invoiced_on: '2026-11-04', order_no: 'RO1', qty: 3, value_paise: 200000 }])
    const o = orderRows(e2e, [{ 'Requested Order Number': 'RO1', 'Order Status Desc': 'SAP SO Created' }])
    expect(o.find((x) => x.order_no === 'RO1')).toMatchObject({ asked: 8, corrected: 11, invoiced: 11, status: 'SAP SO Created' })
    expect(o.find((x) => x.order_no === 'RO2')).toMatchObject({ asked: 50, deleted: 50, corrected: 0 })
  })
  it('an invoice is booked when a purchase near that day has the same cases', () => {
    const lines = invoiceLines(e2e)
    expect(unbookedInvoices(lines, [{ invoice_no: 'RV1', purchase_date: '2026-11-04', cases: 11 }])).toEqual([])
    expect(unbookedInvoices(lines, [{ invoice_no: 'X 5348', purchase_date: '2026-10-01', cases: 1 }])).toEqual([])
    expect(unbookedInvoices(lines, [])).toMatchObject([{ invoice_no: '5348', qty: 11 }])
  })
})
