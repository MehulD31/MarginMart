import { describe, expect, it } from 'vitest'
import { buildText, cleanLine, mixReels, pickStyles, reelButtons, timeShots, voTexts, windows, MAX_SHOTS, MIN_SHOTS, STYLES } from './plan.mjs'
const ID = '11111111-2222-3333-4444-555555555555'
const vid = (id, duration) => ({ id, kind: 'video', duration })
const img = (id) => ({ id, kind: 'image' })

describe('windows', () => {
  it('a 16 s video gives several windows spread over the clip, a photo one', () => {
    const w = windows(vid('a', 16))
    expect(w.length).toBe(3)
    expect(w[0]).toBeLessThan(w.at(-1))
    expect(w.at(-1) + 2.5).toBeLessThanOrEqual(16)
    expect(windows(img('p'))).toEqual([0])
  })
})

describe('mixReels', () => {
  it('a big batch becomes several Reels, each opening on a different new clip, no window used twice', () => {
    const fresh = [vid('a', 15), vid('b', 12), vid('c', 10), img('d'), vid('e', 9)]
    const reels = mixReels(fresh, [], [])
    expect(reels.length).toBe(3)
    expect(new Set(reels.map((r) => r.shots[0].id)).size).toBe(3)
    const used = reels.flatMap((r) => r.shots.filter((s) => !s.again).map((s) => `${s.id}@${s.from}`))
    expect(new Set(used).size).toBe(used.length)
    for (const r of reels) { expect(r.shots.length).toBeGreaterThanOrEqual(MIN_SHOTS); expect(r.shots.length).toBeLessThanOrEqual(MAX_SHOTS) }
    expect(new Set(reels.map((r) => r.style)).size).toBe(3)
  })
  it('one photo still makes a Reel, topped up from the least-used library clips', () => {
    const old = [{ ...vid('old1', 12), uses: 3 }, { ...vid('old2', 12), uses: 0 }, { ...img('old3'), uses: 1 }]
    const [r] = mixReels([img('new')], old, [])
    expect(r.shots[0].id).toBe('new')
    expect(r.shots[1].id).toBe('old2')
    expect(r.shots.length).toBe(MIN_SHOTS)
    expect(r.shots.filter((s) => !s.fresh).length).toBe(3)
  })
  it('an empty library pads with tighter crops of the same footage', () => {
    const [r] = mixReels([img('a'), img('b')], [], [])
    expect(r.shots.length).toBe(MIN_SHOTS)
    expect(r.shots[2].again).toBe(true)
    expect(r.shots[2].z0).toBeGreaterThan(1.1)
  })
  it('neighbouring shots move in opposite directions', () => {
    const [r] = mixReels([vid('a', 12)], [], [])
    expect(r.shots[0].z1 > r.shots[0].z0).toBe(true)
    expect(r.shots[1].z1 < r.shots[1].z0).toBe(true)
  })
})

describe('styles', () => {
  it('rotate, starting after the last style posted', () => {
    expect(pickStyles(3, [])).toEqual(['punch', 'story', 'frame'])
    expect(pickStyles(2, ['punch', 'frame'])).toEqual(['story', 'frame'])
    expect(pickStyles(1, ['frame'])).toEqual(['punch'])
  })
  it('shot lengths follow the voice, on the half-second beat, inside the style range', () => {
    const shots = [{}, {}, {}]
    const t = timeShots(shots, [1.2, 3.9, 0], 'story')
    expect(t.shots.map((s) => s.len)).toEqual([3.5, 4.5, 3.5])
    expect(t.shots[1].at).toBe(3.5)
    expect(t.brandAt).toBe(11.5)
    expect(timeShots(shots, [1.2, 2.6, 0], 'punch').shots.map((s) => s.len)).toEqual([3, 3.5, 3])
    for (const k of Object.keys(STYLES)) expect(STYLES[k].accent).toMatch(/^#/)
  })
  it('every shot gets a voice line even if the AI gives none', () => {
    const v = voTexts(5, null, 'punch')
    expect(v.shots.every(Boolean)).toBe(true)
    expect(v.end.ig).toMatch(/RATE/)
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
    const t = buildText(mixReels([vid('a', 9)])[0].shots, null)
    expect(t.shots[0].text.a).toBeTruthy()
    expect(t.shots[1].text.b).toBeTruthy()
    expect(t.brand.b).toBe('Daily delivery')
  })
  it('uses the AI hook in upper case', () => {
    const t = buildText([{}], { hook: { small: 'MarginMart ki', a: 'nayi', b: 'gaadi' } })
    expect(t.shots[0].text).toMatchObject({ a: 'NAYI', b: 'GAADI' })
  })
})

describe('reelButtons', () => {
  it('offers queue, post now, Facebook only (Insta by hand) and skip', () => {
    const d = reelButtons(ID).inline_keyboard.flat().map((b) => b.callback_data)
    expect(d).toEqual([`sp:ok:${ID}`, `sp:now:${ID}`, `sp:fb:${ID}`, `sp:no:${ID}`])
    expect(d.every((x) => x.length <= 64)).toBe(true)
  })
})
