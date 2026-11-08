// Types for insights.js (kept as plain JS so the Telegram autopilot in scripts/ops can import it too).
export interface Line { item: string; qty: number; value: number; cost: number | null }
export interface Win { from: string; to: string; bills: number; value: number; cases: number; margin: number | null; shops: number; avgBill: number }
export interface ItemStat {
  id: string; label: string; brand: string | null; img: string | null; onHand: number; low: number
  cases: number; value: number; margin: number | null; marginPerCase: number | null; shops: number; cases7: number; trend: number | null
  perDay: number; coverDays: number | null; runOut: string | null; lastSold: string | null; reorder: number
}
export type Segment = 'champion' | 'loyal' | 'new' | 'oneTime' | 'atRisk' | 'lost'
export interface Rec { item: string; label: string; score: number; onHand: number }
export interface ShopStat {
  id: string; name: string; owner: string | null; phone: string | null; area: string | null; route: string | null
  bills: number; days: number; cases: number; value: number; margin: number | null; first: string; last: string; since: number
  gap: number | null; nextDue: string | null; lateBy: number | null; avgBill: number; likelyValue: number
  likely: { item: string; label: string; qty: number; times: number }[]; balance: number; overdue: number
  segment: Segment; recommend: Rec[]; reason?: 'late' | 'due' | 'firstRepeat'
}
export interface Alert { level: 'red' | 'amber' | 'green' | 'info'; kind: string; [k: string]: unknown }
export interface Area { area: string; total: number; value: number; cases: number; buyers: number; untapped: number; reach: number }
export interface Prospect { id: string; name: string; owner: string | null; phone: string | null; area: string | null; route: string | null; areaValue: number }
export interface Analysis {
  today: string; admin: boolean; spanDays: number; firstDay: string
  kpi: { today: Win; yesterday: Win; last7: Win; prev7: Win; last30: Win; prev30: Win; all: Win; change7: { value: number | null; cases: number | null; shops: number | null } }
  daily: { day: string; value: number; cases: number; bills: number; margin: number }[]
  weekday: { dow: number; days: number; cases: number }[]
  forecast: { day: string; cases: number }[]
  items: ItemStat[]; sold: ItemStat[]; deadStock: ItemStat[]; shops: ShopStat[]
  segments: { key: Segment; shops: ShopStat[] }[]
  callToday: ShopStat[]; dueSoon: ShopStat[]
  pairs: { a: string; b: string; aLabel: string; bLabel: string; shops: number; score: number }[]
  areas: Area[]; prospects: Prospect[]; concentration: number; totalShops: number; buyers: number
  alerts: Alert[]; recommendFor: (shopId: string, n?: number) => Rec[]
}
export function analyze(data: unknown): Analysis
export function factsForAI(a: Analysis): Record<string, unknown>
