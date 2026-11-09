// Every Vercel endpoint in api/ must load and export a handler. (Nov 2026: insights-ai.js was saved as one line,
// so the whole file became a comment and the AI advisor failed live with no build error.)
import { describe, expect, it } from 'vitest'
import { readdirSync } from 'node:fs'

const routes = readdirSync(new URL('../../api/', import.meta.url)).filter((f) => f.endsWith('.js') && !f.startsWith('_'))

describe('api routes', () => {
  it('there are routes to check', () => { expect(routes).toContain('insights-ai.js') })
  for (const f of routes) {
    it(`${f} exports a handler`, async () => {
      const m = await import(`../../api/${f}`)
      expect(typeof m.default).toBe('function')
    })
  }
  it('AI prompt carries the data and the question', async () => {
    const { buildPrompt } = await import('../../api/insights-ai.js')
    const p = buildPrompt({ top_items: [{ item: 'Sting', cases: 139 }] }, 'Who buys most Sting?', 'en', { name: 'Mehul', role: 'admin' })
    expect(p).toContain('"Sting"')
    expect(p).toContain('Who buys most Sting?')
    expect(p).toContain('Hinglish')
  })
})
