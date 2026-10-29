import { describe, expect, it } from 'vitest'
import { csvRecords, parseCsv, toCsv } from './csv'

describe('csv', () => {
  it('handles quotes, commas and CRLF', () => {
    expect(parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n\r\n')).toEqual([['a', 'b'], ['x, y', 'he said "hi"']])
  })
  it('maps headers to keys', () => {
    expect(csvRecords('\uFEFFShop Name,Route\nSharma Store,Mon/Thu')).toEqual([{ shop_name: 'Sharma Store', route: 'Mon/Thu' }])
  })
  it('neutralises formula injection on export', () => {
    expect(toCsv([['=HYPERLINK("x")']])).toContain(`"'=HYPERLINK(""x"")"`)
  })
})
