import { describe, expect, it } from 'vitest'
import { detectIntent } from '../../api/_intent.js'

const k = (t, o) => detectIntent(t, o).kind

describe('detectIntent: owners chatting is ignored', () => {
  for (const t of ['ok', 'theek hai', 'kal milte hain', 'haan bhai', '👍', 'truck nikal gaya', 'Sharma ji aaye the'])
    it(t, () => expect(k(t)).toBe('ignore'))
})

describe('detectIntent: Pepsi scheme messages go to the scheme reader', () => {
  it('pasted scheme', () => expect(k('Sting 250ml PET scheme Rs 20 per case off valid 10-15 Nov')).toBe('scheme'))
  it('Hinglish scheme', () => expect(k('Mountain Dew 750 pe 15 rs/case discount, 12 nov tak')).toBe('scheme'))
  it('forwarded with numbers', () => expect(k('Nimbooz 345ml 1+1 free till 20th', { forwarded: true })).toBe('scheme'))
  it('a question about schemes is not a scheme', () => expect(k('sting pe scheme kitna hai?')).toBe('ask'))
})

describe('detectIntent: quick answers', () => {
  it('today', () => {
    expect(k('aaj ka hisaab')).toBe('today')
    expect(k('aaj kitni peti biki?')).toBe('today')
    expect(k('hisaab')).toBe('today')
  })
  it('yesterday', () => expect(k('kal ka hisaab batao')).toBe('yesterday'))
  it('week', () => expect(k('is hafte ka report')).toBe('week'))
  it('due for everyone', () => expect(detectIntent('sabse zyada udhaar kiska hai')).toEqual({ kind: 'due', q: null }))
  it('due for one shop', () => {
    expect(detectIntent('sharma ka udhaar kitna hai?')).toEqual({ kind: 'due', q: 'sharma' })
    expect(detectIntent('Gupta Kirana ka baki')).toEqual({ kind: 'due', q: 'gupta kirana' })
  })
  it('stock', () => {
    expect(detectIntent('sting ka stock kitna hai')).toEqual({ kind: 'stock', q: 'sting' })
    expect(detectIntent('stock')).toEqual({ kind: 'stock', q: null })
  })
  it('reorder', () => expect(k('pepsi ko order bhejna hai, kya mangana hai')).toBe('reorder'))
  it('sleeping', () => expect(k('kaunsi dukan order nahi kar rahi')).toBe('sleeping'))
  it('menu', () => expect(k('menu')).toBe('menu'))
  it('sale help', () => expect(k('sale kaise likhu')).toBe('sale_help'))
  it('sales report pdf, with the period', () => {
    expect(detectIntent('sales report bhejo')).toEqual({ kind: 'salesreport', period: 'till' })
    expect(detectIntent('is mahine ki sales report')).toEqual({ kind: 'salesreport', period: 'month' })
    expect(detectIntent('pichhle mahine ki bikri report pdf')).toEqual({ kind: 'salesreport', period: 'lastmonth' })
    expect(detectIntent('pdf bhejo hafte ka')).toEqual({ kind: 'salesreport', period: 'week' })
  })
})

describe('detectIntent: questions go to AI, but only business ones', () => {
  it('business question', () => expect(k('is mahine sabse zyada margin kis item pe hai?')).toBe('ask'))
  it('addressed to the bot', () => expect(k('bot kal kitne truck jayenge')).toBe('ask'))
  it('reply to the bot', () => expect(k('isme sabse achha kaun raha?', { replyToBot: true })).toBe('ask'))
  it('follow-up that names a report still gets the report', () => expect(k('aur pichhle hafte?', { replyToBot: true })).toBe('week'))
  it('non-business question between owners', () => expect(k('khana kha liya?')).toBe('ignore'))
  it('long unclear text with numbers', () => expect(k('Sir please note the following for next month: '.repeat(4) + 'amount 4500 and 12 boxes')).toBe('unsure'))
})
