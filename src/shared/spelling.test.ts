import { describe, expect, it } from 'vitest'
import { suggestName } from './spelling'

describe('suggestName', () => {
  it('fixes the typos found in real shop names', () => {
    expect(suggestName('Satguru Daily Needa')).toBe('Satguru Daily Needs')
    expect(suggestName('Sai Kirana Stor')).toBe('Sai Kirana Store')
    expect(suggestName('patel jotel')).toBe('patel hotel')
  })
  it('leaves good names and Hindi words alone', () => {
    expect(suggestName('Sahu Daily Needs')).toBeNull()
    expect(suggestName('Dewangan Kirana')).toBeNull()
    expect(suggestName('Maa Durga Paan')).toBeNull()
  })
})
