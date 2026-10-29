import { describe, expect, it } from 'vitest'
import { mergeByVariant, parseInvoice } from './purchaseImport'

describe('Pepsi invoice import', () => {
  const grid = [
    ['Distributor', 'R G ASSOCIATE'], [], ['', '', '', 'Values'],
    ['SKU Code', 'Child SKU Description', 'MRP', 'Sum of Order Qty', 'Sum of 8 Oz', 'Sum of Gross Weight', 'Sum of Order Value'],
    ['⊟1785', 'MIRINDA ORANGE MID CAL 400ml PET 30 Rs20', 20, 50, 105.65, 645.5, 24750],
    [5550303, 'STING 250ML PET 30 RS20 WE', 20, 600, 792.6, 4986, 293400],
    ['Grand Total', '', '', 1093, 1629.33, 10196.38, 576588],
  ]
  it('reads lines and skips the total', () => {
    expect(parseInvoice(grid)).toEqual([
      { sku: '1785', desc: 'MIRINDA ORANGE MID CAL 400ml PET 30 Rs20', qty: 50, valuePaise: 2475000 },
      { sku: '5550303', desc: 'STING 250ML PET 30 RS20 WE', qty: 600, valuePaise: 29340000 },
    ])
  })
  it('rejects other sheets', () => { expect(() => parseInvoice([['a', 'b']])).toThrow('SHEET_FORMAT') })
  it('merges flavours and averages the cost', () => {
    expect(mergeByVariant([{ variant_id: 'a', qty: 50, valuePaise: 2475000 }, { variant_id: 'a', qty: 50, valuePaise: 2475000 }]))
      .toEqual([{ variant_id: 'a', qty: 100, cost_paise: 49500 }])
  })
})
