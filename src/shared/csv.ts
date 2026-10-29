/** Minimal RFC 4180 CSV parser: quoted fields, escaped quotes, CRLF. Returns rows of strings. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const src = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((f) => f.trim())) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some((f) => f.trim())) rows.push(row)
  return rows
}

/** Rows to objects keyed by normalized header (lowercase, spaces → underscores). */
export function csvRecords(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text)
  if (!header) return []
  const keys = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'))
  return rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])))
}

/** Escapes values so a downloaded CSV opens cleanly in Excel. */
export function toCsv(rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v)
    // Prefix formula-like values so Excel doesn't execute them (CSV injection).
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
  }
  return '\uFEFF' + rows.map((r) => r.map(esc).join(',')).join('\r\n')
}
