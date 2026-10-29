// POST { action, ... } with the caller's JWT.
//   create      { phone, name, role, shop_id?, vehicle_id? } -> { user_id, pin }   admin (manager: shop only)
//   reset_pin   { user_id }                                   -> { pin }            admin (manager: shop only)
//   set_active  { user_id, active }                           -> { ok }             admin
//   change_pin  { new_pin }                                   -> { ok }             any signed-in user (self)
//   bootstrap   { phone, name }                               -> { user_id, pin }   only while no admin exists
//   view_pin    { user_id }                                   -> { pin }            admin only, every view audited
// Generated PINs are one-time: the user must change it on first login (profiles.must_change_pin).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { cors, emailFor, isValidPin, isWeakPin, json, normalizePhone, passwordFor, randomPin } from '../_shared/pin.ts'

const ROLES = ['admin', 'manager', 'driver', 'shop'] as const
type Role = (typeof ROLES)[number]
const BANNED = '876000h' // ~100 years

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

// Owner decision: admins can see PINs (stored in pin_record, service role only).
async function recordPin(userId: string, pin: string, setBy: string | null) {
  await admin.from('pin_record').upsert({ user_id: userId, pin, set_by: setBy, updated_at: new Date().toISOString() })
}

const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)

async function caller(req: Request) {
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!jwt) return null
  const { data } = await admin.auth.getUser(jwt)
  if (!data.user) return null
  const { data: p } = await admin.from('profiles').select('user_id, role, phone, active').eq('user_id', data.user.id).single()
  return p && p.active ? (p as { user_id: string; role: Role; phone: string }) : null
}

async function createUser(phone: string, name: string, role: Role, extra: Record<string, unknown>, createdBy: string | null) {
  const pin = randomPin()
  const { data, error } = await admin.auth.admin.createUser({
    email: emailFor(phone), password: await passwordFor(phone, pin), email_confirm: true,
  })
  if (error || !data.user) return json({ error: error?.message?.includes('already') ? 'PHONE_EXISTS' : 'CREATE_FAILED' }, 409)
  const { error: pErr } = await admin.from('profiles').insert({
    user_id: data.user.id, role, name: name.trim(), phone, created_by: createdBy, must_change_pin: true, ...extra,
  })
  if (pErr) {
    await admin.auth.admin.deleteUser(data.user.id)
    return json({ error: pErr.code === '23505' ? 'PHONE_EXISTS' : 'CREATE_FAILED' }, 409)
  }
  await recordPin(data.user.id, pin, createdBy)
  return json({ user_id: data.user.id, pin })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)
  const body = await req.json().catch(() => ({}))

  if (body.action === 'bootstrap') {
    const { count } = await admin.from('profiles').select('user_id', { count: 'exact', head: true }).eq('role', 'admin')
    if ((count ?? 0) > 0) return json({ error: 'FORBIDDEN' }, 403)
    const phone = normalizePhone(body.phone)
    if (!phone || typeof body.name !== 'string' || !body.name.trim()) return json({ error: 'INVALID_INPUT' }, 400)
    return createUser(phone, body.name, 'admin', {}, null)
  }

  const me = await caller(req)
  if (!me) return json({ error: 'UNAUTHORIZED' }, 401)

  switch (body.action) {
    case 'change_pin': {
      if (!isValidPin(body.new_pin) || isWeakPin(body.new_pin)) return json({ error: 'WEAK_PIN' }, 400)
      const { error } = await admin.auth.admin.updateUserById(me.user_id, { password: await passwordFor(me.phone, body.new_pin) })
      if (error) return json({ error: 'UPDATE_FAILED' }, 500)
      await admin.from('profiles').update({ must_change_pin: false }).eq('user_id', me.user_id)
      await recordPin(me.user_id, body.new_pin, me.user_id)
      return json({ ok: true })
    }

    case 'create': {
      const phone = normalizePhone(body.phone)
      const role = body.role as Role
      if (!phone || !ROLES.includes(role) || typeof body.name !== 'string' || !body.name.trim()) {
        return json({ error: 'INVALID_INPUT' }, 400)
      }
      if (!(me.role === 'admin' || (me.role === 'manager' && role === 'shop'))) return json({ error: 'FORBIDDEN' }, 403)
      const extra: Record<string, unknown> = {}
      if (uuid(body.shop_id)) extra.shop_id = body.shop_id
      if (uuid(body.vehicle_id)) extra.vehicle_id = body.vehicle_id
      return createUser(phone, body.name, role, extra, me.user_id)
    }

    case 'view_pin': {
      if (me.role !== 'admin') return json({ error: 'FORBIDDEN' }, 403)
      if (!uuid(body.user_id)) return json({ error: 'INVALID_INPUT' }, 400)
      const { data: rec } = await admin.from('pin_record').select('pin').eq('user_id', body.user_id).maybeSingle()
      await admin.from('audit_log').insert({ actor: me.user_id, table_name: 'pin_record', row_id: body.user_id, action: 'view' })
      if (!rec) return json({ error: 'PIN_UNKNOWN' }, 404)
      return json({ pin: rec.pin })
    }

    case 'reset_pin':
    case 'set_active': {
      if (!uuid(body.user_id)) return json({ error: 'INVALID_INPUT' }, 400)
      const { data: target } = await admin.from('profiles').select('user_id, role, phone').eq('user_id', body.user_id).single()
      if (!target) return json({ error: 'NOT_FOUND' }, 404)
      const managerOnShop = me.role === 'manager' && target.role === 'shop'

      if (body.action === 'reset_pin') {
        if (!(me.role === 'admin' || managerOnShop)) return json({ error: 'FORBIDDEN' }, 403)
        const pin = randomPin()
        const { error } = await admin.auth.admin.updateUserById(target.user_id, { password: await passwordFor(target.phone, pin) })
        if (error) return json({ error: 'UPDATE_FAILED' }, 500)
        await admin.from('profiles').update({ must_change_pin: true }).eq('user_id', target.user_id)
        await recordPin(target.user_id, pin, me.user_id)
        return json({ pin })
      }

      if (me.role !== 'admin') return json({ error: 'FORBIDDEN' }, 403)
      if (target.user_id === me.user_id) return json({ error: 'CANNOT_DEACTIVATE_SELF' }, 400)
      const active = body.active === true
      const { error } = await admin.auth.admin.updateUserById(target.user_id, { ban_duration: active ? 'none' : BANNED })
      if (error) return json({ error: 'UPDATE_FAILED' }, 500)
      await admin.from('profiles').update({ active }).eq('user_id', target.user_id)
      return json({ ok: true })
    }

    default:
      return json({ error: 'UNKNOWN_ACTION' }, 400)
  }
})
