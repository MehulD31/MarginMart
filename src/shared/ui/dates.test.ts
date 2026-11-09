import { describe, expect, it } from 'vitest'
import { addDaysISO, clampISO, isISO, monthGrid } from './dates'

describe('isISO', () => {
  it('accepts real days only', () => {
    expect(isISO('2026-11-09')).toBe(true)
    expect(isISO('2026-13-01')).toBe(false)
    expect(isISO('11/09/2026')).toBe(false)
    expect(isISO('')).toBe(false)
    expect(isISO(undefined)).toBe(false)
  })
})

describe('addDaysISO', () => {
  it('crosses months, years and leap days', () => {
    expect(addDaysISO('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysISO('2028-03-01', -1)).toBe('2028-02-29')
    expect(addDaysISO('2026-11-09', -7)).toBe('2026-11-02')
  })
})

describe('clampISO', () => {
  it('keeps the day inside the range', () => {
    expect(clampISO('2026-11-20', undefined, '2026-11-09')).toBe('2026-11-09')
    expect(clampISO('2025-01-01', '2025-11-08')).toBe('2025-11-08')
    expect(clampISO('2026-11-05', '2026-11-01', '2026-11-09')).toBe('2026-11-05')
  })
})

describe('monthGrid', () => {
  it('November 2026 starts on a Sunday and fills whole weeks', () => {
    const g = monthGrid(2026, 11)
    expect(g[0]).toBe('2026-11-01')
    expect(g.length % 7).toBe(0)
    expect(g.filter(Boolean)).toHaveLength(30)
    expect(g.at(-1)).toBe(null)
  })
  it('February 2026 starts on a Sunday too, and 2028 has 29 days', () => {
    expect(monthGrid(2026, 2)[0]).toBe('2026-02-01')
    expect(monthGrid(2028, 2).filter(Boolean)).toHaveLength(29)
    expect(monthGrid(2026, 10).slice(0, 4)).toEqual([null, null, null, null])  // 1 Oct 2026 = Thursday
  })
})
