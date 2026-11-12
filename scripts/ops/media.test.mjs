import { describe, expect, it } from 'vitest'
import { captionPrompt, fallbackCaption, finishCaption, mediaOf, PHONE, postIdOf, previewButtons, TAGS, tooBig, waShare, wantsRate, rateDm, GROUP } from './media.mjs'

const ID = '11111111-2222-3333-4444-555555555555'

describe('mediaOf', () => {
  it('takes any video, with its note', () => {
    expect(mediaOf({ video: { file_id: 'V', file_size: 9e6 }, caption: 'godown me naya stock' })).toEqual({ type: 'video', file_id: 'V', size: 9e6, note: 'godown me naya stock' })
    expect(mediaOf({ document: { file_id: 'D', mime_type: 'video/mp4' } }).type).toBe('video')
  })
  it('takes a photo with no caption or one that says post', () => {
    expect(mediaOf({ photo: [{ file_id: 'small' }, { file_id: 'big', file_size: 200000 }] })).toMatchObject({ type: 'image', file_id: 'big', note: '' })
    expect(mediaOf({ photo: [{ file_id: 'p' }], caption: 'insta pe daalo, truck loading' }).note).toBe('insta pe daalo, truck loading')
  })
  it('leaves other photos (e.g. a forwarded Pepsi scheme) alone', () => {
    expect(mediaOf({ photo: [{ file_id: 'p' }], caption: '400ml pe 80 TS 4 din' })).toBeNull()
    expect(mediaOf({ text: 'hello' })).toBeNull()
    expect(mediaOf({ voice: { file_id: 'a' } })).toBeNull()
  })
  it('knows the 20 MB bot limit', () => {
    expect(tooBig({ size: 25 * 1024 * 1024 })).toBe(true)
    expect(tooBig({ size: 5e6 })).toBe(false)
  })
})

describe('captions', () => {
  it('prompt keeps to the business facts', () => {
    const p = captionPrompt('naya Aquafina stock', 'video')
    expect(p).toContain('MarginMart (by K.D. Foods)')
    expect(p).toContain('Never call it a PepsiCo distributor')
    expect(p).toContain('naya Aquafina stock')
    expect(p).not.toMatch(/cold drinks only/i)
  })
  it('always ends with the phone and our tags, no markdown or stray hashtags', () => {
    const c = finishCaption('**Maal aa gaya** #random\nSupela, Bhilai')
    expect(c).toContain(`📞 Call/WhatsApp ${PHONE}`)
    expect(c.endsWith(TAGS)).toBe(true)
    expect(c).not.toContain('**')
    expect(c).not.toContain('#random')
  })
  it('fallback works without AI', () => {
    expect(fallbackCaption('truck loading', 'video')).toContain('truck loading')
    expect(fallbackCaption('', 'image')).toContain(PHONE)
  })
})

describe('preview buttons', () => {
  it('carry the post id, and a reply finds it again', () => {
    const kb = previewButtons(ID)
    expect(kb.inline_keyboard.flat().map((b) => b.callback_data)).toEqual([`sp:ok:${ID}`, `sp:now:${ID}`, `sp:no:${ID}`])
    expect(postIdOf({ reply_markup: kb })).toBe(ID)
    expect(postIdOf({ text: 'x' })).toBeNull()
  })
})

describe('waShare', () => {
  it('puts caption and post link in a wa.me forward link', () => {
    expect(waShare('Naya Sting', 'https://ig/p/1')).toBe('https://wa.me/?text=' + encodeURIComponent('Naya Sting\n\nhttps://ig/p/1'))
  })
  it('works without a link', () => {
    expect(waShare('Hi', null)).toBe('https://wa.me/?text=Hi')
  })
})

describe('rate comments', () => {
  it('spots rate requests in Hinglish, Hindi and typos', () => {
    for (const t of ['RATE', 'rate list bhejo', 'Rate?', 'kitne ka hai', 'bhav kya hai', 'रेट', 'price please', 'ret']) expect(wantsRate(t)).toBe(true)
  })
  it('ignores other comments', () => {
    for (const t of ['nice', 'gaadi mast hai 🔥', 'congratulations', 'separate', '']) expect(wantsRate(t)).toBe(false)
  })
  it('DM has the group link and WhatsApp number, and no prices', () => {
    const d = rateDm('Ramesh Kumar')
    expect(d).toContain('Ramesh ji'); expect(d).toContain(GROUP); expect(d).toContain('wa.me/919630012636')
    expect(d).not.toMatch(/₹\s*\d/)
  })
})