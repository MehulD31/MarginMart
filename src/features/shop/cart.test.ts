import { describe, expect, it } from 'vitest'
import { cartCases, setQty } from './cart'

describe('cart', () => {
  it('adds, changes and removes lines', () => {
    let c = setQty({}, 'a', 2)
    c = setQty(c, 'b', 3)
    expect(cartCases(c)).toBe(5)
    c = setQty(c, 'a', 0)
    expect(c).toEqual({ b: 3 })
  })
  it('clamps to 0..999 whole cases', () => {
    expect(setQty({}, 'a', 1500)).toEqual({ a: 999 })
    expect(setQty({}, 'a', 2.7)).toEqual({ a: 2 })
    expect(setQty({ a: 1 }, 'a', -4)).toEqual({})
  })
})
