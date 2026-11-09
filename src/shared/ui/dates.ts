// Calendar maths for DateField (pure, unit-tested in dates.test.ts). Days are 'YYYY-MM-DD' strings in IST; month is 1-12.

export const isISO = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))

export const todayISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

export function addDaysISO(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** The day kept inside [min, max] (either may be missing). */
export const clampISO = (iso: string, min?: string, max?: string) => (min && iso < min ? min : max && iso > max ? max : iso)

/** One month as a Sunday-first grid: day strings, with null for the blanks before the 1st and after the last day. */
export function monthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const mm = String(month).padStart(2, '0')
  const cells: (string | null)[] = Array.from({ length: first }, () => null)
  for (let d = 1; d <= days; d++) cells.push(`${year}-${mm}-${String(d).padStart(2, '0')}`)
  while (cells.length % 7) cells.push(null)
  return cells
}
