export const CATEGORIES: string[]
export interface KharchaSettings {
  fixed_costs: { label: string; paise: number }[]; spend_line?: string; working_days: number
  loading_paise_per_case: number; cash_discount_paise: number; on_time_pct: number
}
export interface PnlInput { cases: number; sales_paise: number; cost_paise: number; active_days?: number }
export interface Pnl { sales: number; cost: number; cases: number; margin: number; variable: number; kharcha: number; fixed: number; profit: number; perCase: number | null; byCat: Record<string, number>; need: number }
export function fixedPerDay(s: KharchaSettings): number
export function variablePerCase(s: KharchaSettings): number
export function pnl(p: PnlInput | null | undefined, spends: { amount_paise: number; category?: string }[], s: KharchaSettings, days: number): Pnl
export function spendBudget(s: KharchaSettings, monthSpends: { amount_paise: number }[]): { line: string; budget: number; spent: number; left: number; over: boolean }
export function parseKharcha(text: string): { amount_paise: number; category: string; note: string | null } | null
