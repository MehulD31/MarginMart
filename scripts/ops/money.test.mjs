import { describe, expect, it } from 'vitest'
import { detectIntent } from '../../api/_intent.js'
import { paisaText } from '../../api/_ops.js'

describe('detectIntent: money held by partners', () => {
  for (const t of ['shobhit ke paas kitna paisa hai', 'kiske paas company ka paisa hai?', 'shobhit ke account me kitne paise aaye', 'bot paisa kiske paas hai'])
    it(t, () => expect(detectIntent(t).kind).toBe('money'))
  it('udhaar is still udhaar', () => expect(detectIntent('sharma ka udhaar kitna hai').kind).toBe('due'))
  it('chit-chat about money is ignored', () => expect(detectIntent('paisa aa gaya').kind).toBe('ignore'))
})

describe('paisaText', () => {
  it('shows each holder, late warning and the next step', () => {
    const t = paisaText([
      { account_id: 'a', name: 'Shobhit (personal)', kind: 'personal', holding_paise: 2475000, payments: 3, oldest_days: 9 },
      { account_id: 'b', name: 'Cash', kind: 'cash', holding_paise: 0, payments: 0, oldest_days: null }])
    expect(t).toContain('Shobhit (personal): ₹24,750 (3 payment, sabse purana 9 din) ⚠️ 7 din se zyada')
    expect(t).toContain('Cash: ₹0 ✅')
    expect(t).toContain('Moved to company')
  })
  it('all moved', () => expect(paisaText([{ account_id: 'a', name: 'Shobhit (personal)', kind: 'personal', holding_paise: 0, payments: 0, oldest_days: null }])).toContain('Sab company bank me hai'))
})