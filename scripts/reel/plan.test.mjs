import { describe, expect, it } from 'vitest'
import { buildText, cleanLine, planShots, reelButtons, totalSeconds, MAX_SHOTS } from './plan.mjs'
const ID = '11111111-2222-3333-4444-555555555555'

describe('planShots', () => {
  it('one 16 s video becomes several shots from across the clip', () => {
    const s = planShots([{ kind: 'video', duration: 16 }])
    expect(s.length).toBe(3)
    expect(s[0].from).toBeLessThan(s[2].from)
    expect(s[2].from + 2).toBeLessThanOrEqual(16)
  })
  it('photo + video keeps the order they were sent in', () => {
    const s = planShots([{ kind: 'image' }, { kind: 'video', duration: 6 }])
    expect(s[0].idx).toBe(0)
    expect(s.slice(1).every((x) => x.idx === 1)).toBe(true)
  })
  it('two photos are padded to 3 shots with a tighter crop on the repeat', () => {
    const s = planShots([{ kind: 'image' }, { kind: 'image' }])
    expect(s.length).toBe(3)
    expect(s[2].again).toBe(true)
    expect(s[2].z0).toBeGreaterThan(1.1)
  })
  it('caps a big batch at 6 shots and keeps the first and last item', () => {
    const s = planShots(Array.from({ length: 10 }, () => ({ kind: 'image' })))
    expect(s.length).toBe(MAX_SHOTS)
    expect(s[0].idx).toBe(0); expect(s.at(-1).idx).toBe(9)
    expect(totalSeconds(s)).toBe(17)
  })
  it('neighbouring shots move in opposite directions', () => {
    const s = planShots([{ kind: 'video', duration: 12 }])
    expect(s[0].z1 > s[0].z0).toBe(true)
    expect(s[1].z1 < s[1].z0).toBe(true)
  })
})

describe('on-screen text', () => {
  it('drops emoji, prices and Durg, and keeps lines short', () => {
    expect(cleanLine('Nayi gaadi 🚚')).toBe('Nayi gaadi')
    expect(cleanLine('Sirf ₹120 me')).toBe('Sirf me')
    expect(cleanLine('Durg-Bhilai delivery')).toBe('Bhilai delivery')
    expect(cleanLine('ek bahut lambi line jo kat jaani chahiye', 14).length).toBeLessThanOrEqual(14)
  })
  it('fills missing AI text with safe defaults', () => {
    const t = buildText(planShots([{ kind: 'video', duration: 9 }]), null)
    expect(t.shots[0].text.a).toBeTruthy()
    expect(t.shots[1].text.b).toBeTruthy()
    expect(t.brand.b).toBe('Daily delivery')
  })
  it('uses the AI hook in upper case', () => {
    const t = buildText(planShots([{ kind: 'image' }]), { hook: { small: 'MarginMart ki', a: 'nayi', b: 'gaadi' } })
    expect(t.shots[0].text).toMatchObject({ a: 'NAYI', b: 'GAADI' })
  })
})

describe('reelButtons', () => {
  it('offers auto post, post now, Facebook only (Insta by hand) and skip', () => {
    const d = reelButtons(ID).inline_keyboard.flat().map((b) => b.callback_data)
    expect(d).toEqual([`sp:ok:${ID}`, `sp:now:${ID}`, `sp:fb:${ID}`, `sp:no:${ID}`])
    expect(d.every((x) => x.length <= 64)).toBe(true)
  })
})
