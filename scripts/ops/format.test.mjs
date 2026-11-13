import { describe, expect, it } from 'vitest'
import { idleLowText, item, monthRange, reorderText, toCsv, waLink, waNumber } from './format.mjs'

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

describe('idleLowText', () => {
  it('lists low-stock items that did not sell, and is empty when none', () => {
    expect(idleLowText([{ item: '300ml Can Pepsi', on_hand: 5 }])).toContain('• 300ml Can Pepsi: 5 peti')
    expect(idleLowText([])).toBe('')
  })
})

describe('reorderText', () => {
  it('lists cases per item', () => {
    expect(reorderText([{ item: 'Pepsi 300ml', need: 12 }, { item: 'Slice Slice', need: 3 }], '9 Nov')).toBe(
      'Pepsi order 9 Nov:\n• Pepsi 300ml: 12 peti\n• Slice: 3 peti')
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
