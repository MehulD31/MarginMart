import { describe, expect, it } from 'vitest'
import { formatPaise, rupeesToPaise } from './money'

describe('money', () => {
  it('formats paise as INR', () => {
    expect(formatPaise(77500)).toBe('₹775')
    expect(formatPaise(550)).toBe('₹5.50')
  })
  it('converts rupees to paise without float drift', () => {
    expect(rupeesToPaise(0.1 + 0.2)).toBe(30)
  })
})
