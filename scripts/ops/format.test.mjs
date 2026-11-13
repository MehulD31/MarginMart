import { describe, expect, it } from 'vitest'
import { idleLowText, item, monthRange, reorderCard, reorderText, toCsv, waLink, waNumber } from './format.mjs'

describe('item', () => {
  it('shows doubled catalogue names once', () => {
    expect(item('200ml RGB Slice 200ml RGB Slice')).toBe('200ml RGB Slice')
    expect(item('Slice PET 250ml Slice PET 250ml')).toBe('Slice PET 250ml')
  })
  it('leaves normal names alone', () => {
    expect(item('300ml Can Pepsi')).toBe('300ml Can Pepsi')
    expect(item('Pepsi Pepsi Black')).toBe('Pepsi Pepsi Black')
    expect(item(null)).toBe('')
  })
})

describe('waNumber / waLink', () => {
  it('normalises Indian mobiles', () => {
    expect(waNumber('98765 43210')).toBe('919876543210')
    expect(waNumber('+91 9876543210')).toBe('919876543210')
    expect(waNumber('09876543210')).toBe('919876543210')
  })
  it('rejects landlines and junk', () => {
    expect(waNumber('011 23456789')).toBeNull()  // Delhi landline (starts 1-5 after the code)
    expect(waNumber('98765')).toBeNull()
    expect(waNumber('')).toBeNull()
    expect(waNumber(undefined)).toBeNull()
    expect(waLink('123', 'hi')).toBeNull()
  })
  it('encodes the message', () => {
    expect(waLink('9876543210', 'a b&c')).toBe('https://wa.me/919876543210?text=a%20b%26c')
  })
})

describe('reorderCard', () => {
  const rs = (p) => `?${p / 100}`
  const rows = [
    { item: 'Nimbooz 345ml Nimbooz 345ml', need: 39, on_hand: 24, days_left: 6.9, per_day: 3.5, urgent: false, cost_paise: 100000 },
    { item: 'Pepsi 400ml', need: 32, on_hand: 0, days_left: 0, per_day: 2.2, urgent: true, cost_paise: 50000 },
    { item: 'Slice Tetra 125ml', need: 3, on_hand: 14, days_left: 12.9, per_day: 1.1, urgent: false, thin: true, cost_paise: 0 }]
  it('puts urgent items first with stock and days left, and totals the cost', () => {
    const t = reorderCard(rows, rs, '13 Nov')
    expect(t).toContain('<b>Pepsi Order · 13 Nov</b>')
    expect(t).toContain('3 item · kul ~<b>?1500</b>')
    expect(t.indexOf('Abhi chahiye')).toBeLessThan(t.indexOf('Is hafte ke liye'))
    expect(t).toContain('? <b>Pepsi 400ml</b> — <b>32 peti</b>')
    expect(t).toContain('stock 0 · stock khatam')
    expect(t).toContain('stock 24 · ~7 din chalega · roz ~3.5 peti bikta hai')
    expect(t).toContain('kam data')
    expect(t).toContain('Nimbooz 345ml</b>')
    expect(t).not.toContain('Nimbooz 345ml Nimbooz')
  })
  it('has no urgent section when nothing is urgent, and escapes names', () => {
    const t = reorderCard([{ item: 'A & B <x>', need: 1, on_hand: 5, days_left: 9, per_day: 1, cost_paise: 100 }], rs)
    expect(t).not.toContain('Abhi chahiye')
    expect(t).toContain('A &amp; B &lt;x&gt;')
  })
})
describe('idleLowText', () => {
  it('lists low-stock items that did not sell, and is empty when none', () => {
    expect(idleLowText([{ item: '300ml Can Pepsi', on_hand: 5 }])).toContain('â€¢ 300ml Can Pepsi: 5 peti')
    expect(idleLowText([])).toBe('')
  })
})

describe('reorderText', () => {
  it('lists cases per item', () => {
    expect(reorderText([{ item: 'Pepsi 300ml', need: 12 }, { item: 'Slice Slice', need: 3 }], '9 Nov')).toBe(
      'Pepsi order 9 Nov:\nâ€¢ Pepsi 300ml: 12 peti\nâ€¢ Slice: 3 peti')
  })
})

describe('toCsv', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(toCsv(['a', 'b'], [{ a: 'x,y', b: 'say "hi"' }, { a: 1, b: null }])).toBe('a,b\n"x,y","say ""hi"""\n1,\n')
  })
})

describe('monthRange', () => {
  it('rolls December into January', () => {
    expect(monthRange(2026, 12)).toEqual({ from: '2026-12-01T00:00:00+05:30', to: '2027-01-01T00:00:00+05:30', label: '2026-12' })
    expect(monthRange(2026, 10).to).toBe('2026-11-01T00:00:00+05:30')
  })
})
