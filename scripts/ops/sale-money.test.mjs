import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleSaleMessage, handleSaleTap, parseLine, shopLabel } from '../../api/_sale.js'

// Telegram sale flow + "Paid into". Network stubbed: RPCs return canned rows, Gemini returns AI_OUT, Telegram calls recorded.
const SHOBHIT = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Shobhit (personal)', kind: 'personal' }
const BANK = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Company bank', kind: 'company' }
const STING = { variant_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', label: 'Sting PET 250ml (Red)', on_hand: 700, floor_paise: 48300, buy_paise: 48300, trade_paise: 52500 }
const SHOP = { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', name: 'Shri Maruti Kirana', phone: '7999247999', locality: 'Charoda', owner: 'Ramesh Sahu' }
let sent, rpcCalls, state, AI_OUT
const LINE = { variant_id: STING.variant_id, label: STING.label, qty: 50, price: 49500, floor: 48300, buy: 48300, stock: 700 }
const data = (fn, body) => { if (fn === 'bot_session_set') { state = body.p_state; return null } return ({
  bot_money_accounts: [BANK, SHOBHIT, { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', name: 'Cash', kind: 'cash' }],
  bot_session_get: state,
  bot_record_sale_into: { number: 'KD-00007', total_paise: 2475000, margin_paise: 60000, account: SHOBHIT.name },
  bot_money_holdings: [{ account_id: SHOBHIT.id, name: SHOBHIT.name, kind: 'personal', holding_paise: 3175000, payments: 2, oldest_days: 0 }],
  bot_catalog: [STING], bot_shops: [SHOP], bot_shop_guess: [{ ...SHOP, score: 1 }],
}[fn] ?? null) }

beforeEach(() => {
  sent = []; rpcCalls = []
  state = { flow: 'sale', step: 'cart', who: 'Mehul', shop: SHOP, lines: [LINE], mode: null }
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    const u = String(url)
    if (u.includes('generativelanguage')) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(AI_OUT) }] } }] }), { status: 200 })
    const body = init?.body ? JSON.parse(init.body) : {}
    if (u.includes('/rpc/')) { const fn = u.split('/rpc/')[1]; rpcCalls.push({ fn, body }); return new Response(JSON.stringify(data(fn, body)), { status: 200 }) }
    if (u.endsWith('/sendMessage')) sent.push(body)
    return new Response('{"ok":true}', { status: 200 })
  }))
})
afterEach(() => vi.unstubAllGlobals())
const tap = (d) => handleSaleTap({ id: 'q', data: d, from: { id: 7 }, message: { chat: { id: 1 } } })

describe('Telegram: paid into a partner account', () => {
  it('tapping UPI -> Shobhit sets the account', async () => {
    await tap('s:pay:upi:' + SHOBHIT.id)
    expect(state.account).toEqual(SHOBHIT)
    expect(state.mode).toBe('upi')
    expect(sent.at(-1).text).toContain('Paisa aaya: Shobhit (personal)')
  })
  it('confirm saves with the account and says how much Shobhit now holds', async () => {
    await tap('s:pay:upi:' + SHOBHIT.id)
    await tap('s:ok')
    const save = rpcCalls.find((c) => c.fn === 'bot_record_sale_into')
    expect(save.body).toMatchObject({ p_account: SHOBHIT.id, p_mode: 'upi', p_shop: SHOP.id })
    expect(sent.at(-1).text).toContain('Unke paas ab company ka ₹31,750 hai')
  })
  it('plain UPI / cash save with no account (= company bank / cash box)', async () => {
    await tap('s:pay:upi')
    await tap('s:ok')
    expect(rpcCalls.find((c) => c.fn === 'bot_record_sale_into').body.p_account).toBeNull()
    expect(sent.at(-1).text).not.toContain('Unke paas')
  })
  it('a switched-off account is refused', async () => {
    await tap('s:pay:upi:99999999-9999-4999-8999-999999999999')
    expect(state.account ?? null).toBeNull()
    expect(sent.some((m) => m.text.includes('Ye account ab band hai'))).toBe(true)
    // the cart shown again offers UPI (company) and UPI -> Shobhit as separate buttons
    const btns = sent.at(-1).reply_markup.inline_keyboard.flat().map((b) => b.text)
    expect(btns).toEqual(expect.arrayContaining(['💵 Cash', '📱 UPI (company)', '📱 UPI → Shobhit']))
  })
})

describe('parser: account only when the note names it', () => {
  it('"upi shobhit" -> Shobhit, mode upi', async () => {
    AI_OUT = { shop_id: SHOP.id, lines: [{ variant_id: STING.variant_id, qty: 50, price: 495, sure: true }], mode: null, account_id: SHOBHIT.id, unclear: [] }
    const p = await parseLine('maruti kirana sting 50 crate 495 upi shobhit')
    expect(p.account).toEqual(SHOBHIT)
    expect(p.mode).toBe('upi')
  })
  it('AI picks an account the note never mentions -> ignored', async () => {
    AI_OUT = { shop_id: SHOP.id, lines: [{ variant_id: STING.variant_id, qty: 50, price: 495, sure: true }], mode: 'upi', account_id: SHOBHIT.id, unclear: [] }
    const p = await parseLine('maruti kirana sting 50 crate 495 upi')
    expect(p.account).toBeNull()
  })
})

describe('Telegram: owner name shown with the shop', () => {
  it('label', () => {
    expect(shopLabel(SHOP)).toBe('Shri Maruti Kirana · Ramesh Sahu')
    expect(shopLabel({ name: 'Sai Kirana', owner: null })).toBe('Sai Kirana')
  })
  it('/sale shop buttons show shop · owner · area', async () => {
    await handleSaleMessage({ chat: { id: 1 }, from: { id: 7, first_name: 'Mehul' }, text: '/sale' })
    const btn = sent.at(-1).reply_markup.inline_keyboard.flat().find((b) => b.callback_data === 's:shop:' + SHOP.id)
    expect(btn.text).toBe('Shri Maruti Kirana · Ramesh Sahu · Charoda')
  })
  it('cart and confirm show the owner', async () => {
    await tap('s:pay:cash')
    expect(sent.at(-1).text).toContain('🏪 Shri Maruti Kirana · Ramesh Sahu')
  })
  it('parser gives the AI the owner names (so "ramesh ki dukan" works) and keeps the owner on the shop', async () => {
    AI_OUT = { shop_id: SHOP.id, lines: [{ variant_id: STING.variant_id, qty: 5, price: 495, sure: true }], mode: 'cash', account_id: null, unclear: [] }
    let prompt = ''
    const f = globalThis.fetch
    globalThis.fetch = async (u, i) => { if (String(u).includes('generativelanguage')) prompt = JSON.parse(i.body).contents[0].parts[0].text; return f(u, i) }
    const p = await parseLine('ramesh ki dukan sting 5 peti 495 cash')
    expect(prompt).toContain('"owner":"Ramesh Sahu"')
    expect(p.shop.owner).toBe('Ramesh Sahu')
  })
})
describe('Telegram: discount', () => {
  it('"discount 295" -> ₹295 off, shown in the cart and saved with the bill', async () => {
    AI_OUT = { shop_id: SHOP.id, lines: [{ variant_id: STING.variant_id, qty: 50, price: 495, sure: true }], mode: 'cash', account_id: null, discount: 295, unclear: [] }
    const p = await parseLine('maruti kirana sting 50 crate 495 cash discount 295')
    expect(p.discount).toBe(29500)
    state = { ...state, discount: p.discount }
    await tap('s:pay:cash')
    expect(sent.at(-1).text).toContain('Discount: −₹295')
    expect(sent.at(-1).text).toContain('Total: ₹24,455')
    await tap('s:ok')
    expect(rpcCalls.find((c) => c.fn === 'bot_record_sale_into').body.p_discount).toBe(29500)
  })
  it('AI invents a discount the note never said -> ignored', async () => {
    AI_OUT = { shop_id: SHOP.id, lines: [{ variant_id: STING.variant_id, qty: 50, price: 495, sure: true }], mode: 'cash', account_id: null, discount: 100, unclear: [] }
    expect((await parseLine('maruti kirana sting 50 crate 495 cash')).discount).toBe(0)
  })
  it('discount bigger than the bill -> not used, asks', async () => {
    AI_OUT = { shop_id: SHOP.id, lines: [{ variant_id: STING.variant_id, qty: 1, price: 495, sure: true }], mode: 'cash', account_id: null, discount: 900, unclear: [] }
    const p = await parseLine('maruti kirana sting 1 crate 495 discount 900')
    expect(p.discount).toBe(0)
    expect(p.unclear.join(' ')).toContain('Discount samajh nahi aaya')
  })
})