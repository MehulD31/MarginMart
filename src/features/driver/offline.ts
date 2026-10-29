// Driver offline support (HLD §6.5): the day's data is kept in IndexedDB, and every delivery or payment
// goes into a queue with its own id. The server treats a repeated id as the same action, so retrying is safe.
import { openDB, type IDBPDatabase } from 'idb'
import { supabase } from '../../shared/api/supabase'

export type QueueKind = 'delivery' | 'payment'
export interface QueuedAction {
  id: string
  kind: QueueKind
  shopId: string
  args: Record<string, unknown>
  createdAt: number
  status: 'pending' | 'failed'
  error?: string
  result?: Record<string, unknown>
}

let dbp: Promise<IDBPDatabase> | null = null
const db = () => (dbp ??= openDB('marginmart-driver', 1, {
  upgrade(d) { d.createObjectStore('kv'); d.createObjectStore('queue', { keyPath: 'id' }) },
}))

export async function saveSnapshot<T>(userId: string, data: T) { await (await db()).put('kv', { at: Date.now(), data }, `snapshot:${userId}`) }
export async function loadSnapshot<T>(userId: string): Promise<{ at: number; data: T } | undefined> { return (await db()).get('kv', `snapshot:${userId}`) }

export async function enqueue(a: Omit<QueuedAction, 'createdAt' | 'status'>) {
  await (await db()).put('queue', { ...a, createdAt: Date.now(), status: 'pending' } satisfies QueuedAction)
  notify()
}
export async function listQueue(): Promise<QueuedAction[]> { return ((await (await db()).getAll('queue')) as QueuedAction[]).sort((a, b) => a.createdAt - b.createdAt) }
export async function dropAction(id: string) { await (await db()).delete('queue', id); notify() }

// Results of synced actions are kept briefly so the receipt can show the real bill number.
export async function rememberResult(id: string, result: unknown) { await (await db()).put('kv', result, `result:${id}`) }
export async function getResult<T>(id: string): Promise<T | undefined> { return (await db()).get('kv', `result:${id}`) }

const listeners = new Set<() => void>()
export const onQueueChange = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }
const notify = () => listeners.forEach((f) => f())

const BUSINESS = /^[A-Z_]+$/ // our RPC errors; anything else (network, 5xx) means "try again later"
let running: Promise<{ synced: number; failed: number; offline: boolean }> | null = null

/** Sends queued actions in order. Stops at the first network failure so order is kept. */
export function syncQueue() {
  running ??= (async () => {
    let synced = 0, failed = 0, offline = false
    for (const a of await listQueue()) {
      if (a.status === 'failed') continue
      const rpc = a.kind === 'delivery' ? 'record_delivery' : 'record_payment'
      const { data, error } = await supabase.rpc(rpc, { p_action_id: a.id, ...a.args })
      if (!error) { await rememberResult(a.id, data); await dropAction(a.id); synced++; continue }
      if (BUSINESS.test(error.message)) {
        await (await db()).put('queue', { ...a, status: 'failed', error: error.message } satisfies QueuedAction); failed++; notify(); continue
      }
      offline = true; break
    }
    return { synced, failed, offline }
  })().finally(() => { running = null })
  return running
}

export async function retryFailed(id: string) {
  const a = (await (await db()).get('queue', id)) as QueuedAction | undefined
  if (a) { await (await db()).put('queue', { ...a, status: 'pending', error: undefined }); notify() }
}
