import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Eye, KeyRound, Power, UserPlus, Users } from 'lucide-react'
import { useAuth } from '../../shared/api/auth'
import { callFunction, type Profile, type Role } from '../../shared/api/functions'
import { supabase } from '../../shared/api/supabase'
import { errorMessage } from '../../shared/ui/errors'
import { Alert, Empty, PageHeader, Sheet, Skeleton, StatusBadge, type Msg } from '../../shared/ui/kit'
import { initials } from '../../shared/ui/util'
import { PinIssued, type Issued } from './PinIssued'
import { useConfirm } from '../../shared/ui/confirm'

const ROLES: Role[] = ['admin', 'manager', 'driver', 'shop']
const ROLE_BADGE: Record<Role, string> = { admin: 'badge-blue', manager: 'badge-amber', driver: 'badge-green', shop: '' }

export default function UsersPage() {
  const { t } = useTranslation()
  const { profile: me } = useAuth()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const isAdmin = me?.role === 'admin'
  const [adding, setAdding] = useState(false)
  const [issued, setIssued] = useState<Issued[]>([])
  const [msg, setMsg] = useState<Msg>(null)
  const [roleFilter, setRoleFilter] = useState<Role | ''>('')

  const users = useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error: err } = await supabase.from('profiles').select('*').order('role').order('name')
      if (err) throw err
      return data as Profile[]
    },
  })

  const act = useMutation({
    mutationFn: (body: Record<string, unknown>) => callFunction<{ pin?: string }>('admin-users', body),
    onError: (err) => setMsg({ kind: 'error', text: errorMessage(t, err) }),
    onSuccess: () => { setMsg(null); void qc.invalidateQueries({ queryKey: ['profiles'] }) },
  })

  const resetPin = async (u: Profile) => {
    if (!(await confirm({ title: t('users.resetPin'), body: t('users.confirmReset', { name: u.name }), confirm: t('users.resetPin') }))) return
    const res = await act.mutateAsync({ action: 'reset_pin', user_id: u.user_id }).catch(() => null)
    if (res?.pin) setIssued([{ name: u.name, phone: u.phone, pin: res.pin }])
  }
  const toggleActive = async (u: Profile) => {
    if (u.active && !(await confirm({ title: t('users.deactivate'), body: t('users.confirmDeactivate', { name: u.name }), confirm: t('users.deactivate'), danger: true }))) return
    await act.mutateAsync({ action: 'set_active', user_id: u.user_id, active: !u.active }).catch(() => null)
  }
  const showPin = async (u: Profile) => {
    const res = await act.mutateAsync({ action: 'view_pin', user_id: u.user_id }).catch(() => null)
    if (res?.pin) setIssued([{ name: u.name, phone: u.phone, pin: res.pin }])
  }
  const canManage = (u: Profile) => isAdmin || (me?.role === 'manager' && u.role === 'shop')
  const list = (users.data ?? []).filter((u) => !roleFilter || u.role === roleFilter)

  return (
    <section className="stack-lg">
      <PageHeader title={t('users.title')} sub={t('users.sub')}
        actions={<button type="button" className="primary" onClick={() => setAdding(true)}><UserPlus size={18} aria-hidden="true" />{t('users.add')}</button>} />
      <Alert msg={msg} />

      <div className="segmented" role="tablist" aria-label={t('users.role')}>
        {(['', ...ROLES] as const).map((r) => (
          <button key={r || 'all'} type="button" role="tab" aria-selected={roleFilter === r} className="btn-sm" onClick={() => setRoleFilter(r)}>
            {r ? t(`roles.${r}`) : t('common.all')} <span className="muted">{(users.data ?? []).filter((u) => !r || u.role === r).length}</span>
          </button>
        ))}
      </div>

      {users.isLoading ? <Skeleton /> : list.length === 0 ? (
        <div className="card"><Empty icon={<Users size={26} />} title={t('users.empty')} /></div>
      ) : (
        <div className="table-wrap">
          <table className="table-stack">
            <thead><tr>
              <th scope="col">{t('users.name')}</th><th scope="col">{t('users.role')}</th>
              <th scope="col">{t('users.status')}</th><th scope="col"><span className="sr-only">{t('common.actions')}</span></th>
            </tr></thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.user_id} className={u.active ? '' : 'dim'}>
                  <td className="lead">
                    <div className="row">
                      <span className="avatar-sm" aria-hidden="true">{initials(u.name)}</span>
                      <div><div className="cell-title">{u.name}{u.user_id === me?.user_id && <span className="badge" style={{ marginLeft: 6 }}>{t('users.you')}</span>}</div>
                        <div className="cell-sub num">{u.phone}</div></div>
                    </div>
                  </td>
                  <td><span className={`badge ${ROLE_BADGE[u.role]}`}>{t(`roles.${u.role}`)}</span>
                    {u.active && u.must_change_pin && <span className="badge badge-amber" style={{ marginLeft: 6 }}>{t('users.pinPending')}</span>}</td>
                  <td><StatusBadge active={u.active} /></td>
                  <td className="actions">
                    {isAdmin && (
                      <button type="button" className="btn-sm" disabled={act.isPending} onClick={() => void showPin(u)}><Eye size={16} aria-hidden="true" />{t('users.showPin')}</button>
                    )}
                    {canManage(u) && u.active && (
                      <button type="button" className="btn-sm" disabled={act.isPending} onClick={() => void resetPin(u)}><KeyRound size={16} aria-hidden="true" />{t('users.resetPin')}</button>
                    )}
                    {isAdmin && u.user_id !== me?.user_id && (
                      <button type="button" className={`btn-sm ${u.active ? 'danger' : ''}`} disabled={act.isPending} onClick={() => void toggleActive(u)}>
                        <Power size={16} aria-hidden="true" />{u.active ? t('users.deactivate') : t('users.activate')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={adding} title={t('users.add')} onClose={() => setAdding(false)}>
        <AddUserForm allowedRoles={isAdmin ? ROLES.filter((r) => r !== 'shop') : []}
          onCreated={(i) => { setAdding(false); setIssued([i]) }} onCancel={() => setAdding(false)} />
      </Sheet>
      <PinIssued issued={issued} onDone={() => setIssued([])} />
    </section>
  )
}

function AddUserForm({ allowedRoles, onCreated, onCancel }: { allowedRoles: Role[]; onCreated: (i: Issued) => void; onCancel: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<Role>(allowedRoles.includes('driver') ? 'driver' : allowedRoles[0])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!allowedRoles.length) return <p className="muted">{t('users.shopsHint')}</p>

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await callFunction<{ pin: string }>('admin-users', { action: 'create', name, phone, role })
      void qc.invalidateQueries({ queryKey: ['profiles'] })
      onCreated({ name, phone, pin: res.pin })
    } catch (err) {
      setError(errorMessage(t, err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="stack" onSubmit={onSubmit} noValidate>
      <label className="field"><span>{t('users.name')}</span>
        <input required maxLength={100} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="field"><span>{t('users.phone')}</span>
        <input type="tel" inputMode="numeric" maxLength={10} required value={phone} autoComplete="off"
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} /></label>
      <fieldset className="days"><legend>{t('users.role')}</legend>
        {allowedRoles.map((r) => (
          <label key={r} className="day-toggle"><input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} /><span>{t(`roles.${r}`)}</span></label>
        ))}
      </fieldset>
      <p className="muted">{t('users.shopsHint')}</p>
      <Alert msg={error ? { kind: 'error', text: error } : null} />
      <div className="sheet-foot">
        <button type="button" onClick={onCancel}>{t('common.cancel')}</button>
        <button type="submit" className="primary" disabled={busy || !name.trim() || phone.length !== 10}>{busy ? t('common.loading') : t('users.create')}</button>
      </div>
    </form>
  )
}
