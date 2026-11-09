// Every Vercel endpoint in api/ must load and export a handler. (Nov 2026: insights-ai.js was saved as one line,
// so the whole file became a comment and the AI advisor failed live with no build error.)
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

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

describe('AI reply and source text', () => {
  it('cleans markdown and odd bullets from AI replies', async () => {
    const { clean } = await import('../../api/insights-ai.js')
    expect(clean('**Plan**\n*   Abhilash ko call karo\n- Nimbooz mangao\n1. Soda push')).toBe('Plan\n• Abhilash ko call karo\n• Nimbooz mangao\n• Soda push')
  })
  it('the AI prompt asks for a real bullet, not garbled text', async () => {
    const { buildPrompt } = await import('../../api/insights-ai.js')
    expect(buildPrompt({}, '', 'en')).toContain('bullets start with "• "')
  })
  // Windows tools can garble the rupee sign, bullets and dashes when a file is re-saved; the AI then copies them into answers.
  it('no source file contains garbled characters', () => {
    const files = execSync('git ls-files api src scripts', { encoding: 'utf8' }).split('\n').filter((f) => /\.(js|mjs|ts|tsx|json|css)$/.test(f))
    const bad = files.filter((f) => /\u0393|\u00c3|\u00e2\u20ac|\u256c|\u251c/.test(readFileSync(f, 'utf8')))
    expect(bad).toEqual([])
  })
})