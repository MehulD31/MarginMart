import { describe, expect, it } from 'vitest'
import { chats, decide, phoneKey, report } from './ads.mjs'

const ad = (id, o) => ({ id, name: id, status: 'ACTIVE', spend7: 0, chats7: 0, lifeSpend: 0, lifeChats: 0, ...o })

describe('ads rules (never touch budgets, only pause/resume)', () => {
  it('pauses an ad that spent ₹60+ with no chats, and one 1.8x worse than the best', () => {
    const r = decide([ad('a', { spend7: 100, chats7: 25 }), ad('b', { spend7: 80, chats7: 0 }), ad('c', { spend7: 90, chats7: 9 }), ad('d', { spend7: 70, chats7: 10 })])
    expect(r.pause.map((p) => p.id)).toEqual(['b', 'c'])
  })
  it('does not judge an ad before ₹60 spent', () => {
    expect(decide([ad('a', { spend7: 59, chats7: 0 }), ad('b'), ad('c')]).pause).toEqual([])
  })
  it('keeps at least 2 running and resumes the best paused one', () => {
    const r = decide([ad('a', { spend7: 100, chats7: 0 }), ad('p', { status: 'PAUSED', lifeSpend: 100, lifeChats: 20 }), ad('q', { status: 'PAUSED', lifeSpend: 100, lifeChats: 5 })])
    expect(r.pause).toEqual([])
    expect(r.resume.map((x) => x.id)).toEqual(['p'])
  })
  it('skips ads it paused itself in the last 7 days', () => {
    const now = Date.now()
    const r = decide([ad('a', { spend7: 10 }), ad('p', { status: 'PAUSED', lifeSpend: 50, lifeChats: 10, pausedByUsAt: now - 864e5 })], now)
    expect(r.resume).toEqual([])
  })
  it('reads WhatsApp conversations from insights', () => {
    expect(chats({ actions: [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '7' }, { action_type: 'link_click', value: '40' }] })).toBe(7)
  })
  it('report shows spend, chats, cost per chat and money problems', () => {
    const t = report([ad('Nayi Gaadi', { spend7: 300, chats7: 60 })], { pause: [], resume: [] }, { problem: 'Payment method nahi hai' })
    expect(t).toContain('₹300'); expect(t).toContain('<b>60</b> WhatsApp chat'); expect(t).toContain('₹5/chat'); expect(t).toContain('Payment method')
  })
})

describe('phoneKey', () => {
  it('normalises Indian mobiles for hashing and drops junk', () => {
    expect(phoneKey('98765 43210')).toBe('919876543210')
    expect(phoneKey('+91-98765-43210')).toBe('919876543210')
    expect(phoneKey('09876543210')).toBe('919876543210')
    expect(phoneKey('0788 222333')).toBe(null)
    expect(phoneKey('')).toBe(null)
  })
})
