import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleOpsCommand, handleOpsTap, handleText } from '../../api/_ops.js'

// Stub the network: RPC calls return canned rows, Telegram calls are recorded.
let sent, rpcCalls, tgCalls
const DAY = { day: '2026-11-08', counter: { bills: 1, cases: 10, total_paise: 500000, cash_paise: 500000, upi_paise: 0, margin_paise: 20000, below_cost_lines: 0 },
  route: { bills: 0, cases: 0, total_paise: 0 }, collected: { cash_paise: 0, upi_paise: 0 }, top_items: [{ item: 'Sting Sting', cases: 10 }], trucks: [], open_orders_tomorrow: 0 }
const DATA = {
  bot_due: [{ id: '11111111-1111-1111-1111-111111111111', name: 'Sai Baba General Store', locality: 'Shanti Nagar', phone: '9584810952', balance: 250000, overdue: 100000, last_payment: null }],
  bot_stock: [{ item: '750ml Mirinda 750ml Mirinda', on_hand: 0, low_threshold: 10 }],
  bot_sleeping: [],
  bot_day: DAY,
  bot_reorder: [{ item: 'Sting 250ml', need: 12, on_hand: 3, days_left: 1.5, urgent: true, cost_paise: 600000 }],
  bot_idle_low: [{ item: '300ml Can Pepsi', on_hand: 5 }],
  bot_shop_card: { id: '11111111-1111-1111-1111-111111111111', name: 'Sai Baba General Store', locality: 'Shanti Nagar', phone: '9584810952', owner: 'Tarsam',
    route: 'V1', balance: 250000, overdue: 100000, credit_days: 7, entries: [{ type: 'invoice', amount_paise: 250000, mode: null, created_at: '2026-11-01T10:00:00Z' }],
    last_order: null, last_sale: null, orders_30d: 3 },
  bot_session_get: { flow: 'unsure', text: 'Sting 250 pe 20 rs off' },
  bot_session_set: null,
}
beforeEach(() => {
  sent = []; rpcCalls = []; tgCalls = []
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    const body = JSON.parse(init.body)
    if (String(url).includes('/rpc/')) {
      const fn = String(url).split('/rpc/')[1]
      rpcCalls.push({ fn, body })
      return new Response(JSON.stringify(DATA[fn] ?? null), { status: 200 })
    }
    const method = String(url).split('/').pop()
    tgCalls.push({ method, body })
    if (method === 'sendMessage') sent.push(body)
    return new Response('{"ok":true}', { status: 200 })
  }))
})
afterEach(() => vi.unstubAllGlobals())

const msg = (extra = {}) => ({ chat: { id: 1 }, from: { id: 7, first_name: 'Mehul' }, ...extra })

describe('slash commands', () => {
  it('ignores commands that are not ours', async () => {
    expect(await handleOpsCommand(msg(), '/sale Sharma')).toBe(false)
    expect(await handleOpsCommand(msg(), 'hello')).toBe(false)
    expect(sent).toEqual([])
  })
  it('/due lists balances with a button per shop', async () => {
    expect(await handleOpsCommand(msg(), '/due')).toBe(true)
    expect(rpcCalls[0]).toMatchObject({ fn: 'bot_due', body: { p_q: null } })
    expect(sent[0].text).toContain('Sai Baba General Store · Shanti Nagar: ₹2,500 (overdue ₹1,000)')
    expect(sent[0].text).toContain('aakhri payment kabhi nahi')
    expect(sent[0].reply_markup.inline_keyboard[0][0]).toMatchObject({ callback_data: 'd:11111111-1111-1111-1111-111111111111' })
  })
  it('/due@bot <name> passes the search', async () => {
    await handleOpsCommand(msg(), '/due@kd_bot sai')
    expect(rpcCalls[0].body.p_q).toBe('sai')
  })
  it('/stock shows doubled names once and flags low', async () => {
    await handleOpsCommand(msg(), '/stock mirinda')
    expect(sent[0].text).toContain('• 750ml Mirinda: 0 peti ⚠️')
  })
  it('/sleeping with nobody asleep', async () => {
    await handleOpsCommand(msg(), '/sleeping')
    expect(sent[0].text).toContain('Koi dukan 10 din se zyada chup nahi hai')
  })
  it('/aaj answers instantly from the database', async () => {
    await handleOpsCommand(msg(), '/aaj')
    expect(rpcCalls[0].fn).toBe('bot_day')
    expect(sent[0].text).toContain('Aaj ka hisaab')
    expect(sent[0].text).toContain('Sabse zyada: Sting 10')
  })
  it('/order gives a forwardable Pepsi order', async () => {
    await handleOpsCommand(msg(), '/order')
    expect(sent[1].text).toContain('• Sting 250ml: 12 peti')
    expect(sent[1].text).not.toContain('🔴')
    expect(sent[0].text).toContain('Jaldi chahiye')
    expect(sent[0].text).toContain('₹6,000')
    expect(sent.some((m) => m.text.includes('bika nahi') && m.text.includes('• 300ml Can Pepsi: 5 peti'))).toBe(true)
  })
  it('/menu shows buttons and refreshes the command list', async () => {
    await handleOpsCommand(msg(), '/menu')
    expect(tgCalls.some((c) => c.method === 'setMyCommands')).toBe(true)
    expect(sent[0].reply_markup.inline_keyboard.flat().map((b) => b.callback_data)).toContain('m:today')
  })
})

describe('plain words', () => {
  it('chit-chat gets no reply', async () => {
    expect(await handleText(msg(), 'ok bhai')).toBe('ignore')
    expect(sent).toEqual([])
  })
  it('a Pepsi scheme goes to the scheme reader', async () => {
    expect(await handleText(msg(), 'Sting 250ml scheme Rs 20 per case off valid till 15 Nov')).toBe('scheme')
    expect(sent).toEqual([])
  })
  it('"sharma ka udhaar" searches that shop', async () => {
    expect(await handleText(msg(), 'sai baba ka udhaar kitna hai?')).toBe('done')
    expect(rpcCalls[0]).toMatchObject({ fn: 'bot_due', body: { p_q: 'sai baba' } })
  })
  it('a reply to the scheme card is a correction', async () => {
    const m = msg({ reply_to_message: { from: { is_bot: true }, caption: 'Matlab ... ✅ Approve = app me scheme chalu' } })
    expect(await handleText(m, 'nahi, 25 rs hai')).toBe('scheme')
  })
  it('unsure text is parked and asked about', async () => {
    const setState = vi.fn()
    expect(await handleText(msg(), 'Dear partner please note: '.repeat(6) + '4500 and 12', { setState })).toBe('done')
    expect(setState).toHaveBeenCalledWith(7, expect.objectContaining({ flow: 'unsure' }))
    expect(sent[0].reply_markup.inline_keyboard[0].map((b) => b.callback_data)).toEqual(['u:scheme', 'u:ask'])
  })
})

describe('buttons', () => {
  const tap = (data) => ({ id: 'q1', data, from: { id: 7, first_name: 'Mehul' }, message: { chat: { id: 1 }, message_id: 5 } })
  it('shop card has the khata and a WhatsApp reminder link', async () => {
    expect(await handleOpsTap(tap('d:11111111-1111-1111-1111-111111111111'))).toBe(true)
    const card = sent[0]
    expect(card.text).toContain('Baki: ₹2,500 · overdue ₹1,000')
    expect(card.text).toContain('Bill: ₹2,500')
    expect(card.reply_markup.inline_keyboard[0][0].url).toMatch(/^https:\/\/wa\.me\/919584810952\?text=/)
  })
  it('"Pepsi scheme hai" sends the parked text to the scheme reader', async () => {
    const sendScheme = vi.fn()
    const ctx = { getState: async () => DATA.bot_session_get, setState: vi.fn(), sendScheme }
    expect(await handleOpsTap(tap('u:scheme'), ctx)).toBe(true)
    expect(sendScheme).toHaveBeenCalledWith('Sting 250 pe 20 rs off', 'Mehul')
    expect(ctx.setState).toHaveBeenCalledWith(7, {})
  })
  it('menu buttons answer', async () => {
    await handleOpsTap(tap('m:stock'))
    expect(sent[0].text).toContain('Kam stock')
  })
  it('unknown buttons are left to others', async () => {
    expect(await handleOpsTap(tap('s:shop:x'))).toBe(false)
  })
})
