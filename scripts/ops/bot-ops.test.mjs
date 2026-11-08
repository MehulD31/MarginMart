import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleOpsCommand } from '../../api/_ops.js'

// Stub the network: RPC calls return canned rows, Telegram calls are recorded.
let sent, rpcCalls
beforeEach(() => {
  sent = []; rpcCalls = []
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    const body = JSON.parse(init.body)
    if (String(url).includes('/rpc/')) {
      const fn = String(url).split('/rpc/')[1]
      rpcCalls.push({ fn, body })
      const data = {
        bot_due: [{ name: 'Sai Baba General Store', locality: 'Shanti Nagar', phone: '9584810952', balance: 250000, overdue: 100000, last_payment: null }],
        bot_stock: [{ item: '750ml Mirinda 750ml Mirinda', on_hand: 0, low_threshold: 10 }],
        bot_sleeping: [],
      }[fn]
      return new Response(JSON.stringify(data), { status: 200 })
    }
    sent.push(body.text)
    return new Response('{"ok":true}', { status: 200 })
  }))
})
afterEach(() => vi.unstubAllGlobals())

const msg = { chat: { id: 1 } }

describe('handleOpsCommand', () => {
  it('ignores other text', async () => {
    expect(await handleOpsCommand(msg, '/sale Sharma')).toBe(false)
    expect(await handleOpsCommand(msg, 'hello')).toBe(false)
    expect(sent).toEqual([])
  })
  it('/due lists balances with overdue', async () => {
    expect(await handleOpsCommand(msg, '/due')).toBe(true)
    expect(rpcCalls[0]).toMatchObject({ fn: 'bot_due', body: { p_q: null } })
    expect(sent[0]).toContain('Sai Baba General Store · Shanti Nagar: ₹2,500 (overdue ₹1,000)')
    expect(sent[0]).toContain('aakhri payment kabhi nahi')
  })
  it('/due@bot <name> passes the search', async () => {
    await handleOpsCommand(msg, '/due@kd_bot sai')
    expect(rpcCalls[0].body.p_q).toBe('sai')
  })
  it('/stock shows doubled names once and flags low', async () => {
    await handleOpsCommand(msg, '/stock mirinda')
    expect(sent[0]).toContain('• 750ml Mirinda: 0 peti ⚠️')
  })
  it('/sleeping with nobody asleep', async () => {
    await handleOpsCommand(msg, '/sleeping')
    expect(sent[0]).toContain('Koi dukan 10 din se zyada chup nahi hai')
  })
})
