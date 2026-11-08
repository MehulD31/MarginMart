import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Building2, FileText } from 'lucide-react'
import { supabase } from '../../shared/api/supabase'
import { must } from '../../shared/api/db'
import { useAuth } from '../../shared/api/auth'
import { errorMessage } from '../../shared/ui/errors'
import { Alert, PageHeader, Skeleton, type Msg } from '../../shared/ui/kit'

interface Settings { business_name: string; legal_name: string | null; business_gstin: string | null; business_address: string | null; business_phone: string | null; state_name: string; state_code: string }
interface PackGst { id: string; name_en: string; hsn: string | null; gst_rate_bp: number; active: boolean }
// Chhattisgarh GSTINs start with 22. Format: 2 digits state + 10 PAN + 1 entity + Z + 1 check.
const GSTIN = /^22[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

/** Business details printed on every bill: name, GSTIN, address. Admin edits; manager can see. */
export default function BusinessPage() {
  const { t } = useTranslation()
  const isAdmin = useAuth().profile?.role === 'admin'
  const qc = useQueryClient()
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => must<Settings>(supabase.rpc('settings_get')) })
  const packs = useQuery({ queryKey: ['pack', 'gst'], queryFn: () => must<PackGst[]>(supabase.from('pack').select('id, name_en, hsn, gst_rate_bp, active').eq('active', true).order('name_en')) })

  const missing = (packs.data ?? []).filter((p) => !p.hsn)
  if (settings.isLoading) return <Skeleton rows={4} />
  return (
    <section className="stack-lg">
      <PageHeader title={t('biz.title')} sub={t('biz.sub')} />
      {settings.isError ? <Alert msg={{ kind: 'error', text: errorMessage(t, settings.error) }} />
        : <SettingsForm s={settings.data!} isAdmin={isAdmin} onSaved={() => void qc.invalidateQueries({ queryKey: ['settings'] })} />}

      <div className="card stack">
        <h2 className="row"><FileText size={20} aria-hidden="true" />{t('biz.itemsTitle')}</h2>
        <p className="cell-sub">{t('biz.itemsSub')}</p>
        {packs.isLoading ? <Skeleton rows={2} /> : missing.length === 0 ? <p className="muted">{t('biz.itemsAllSet')}</p> : (
          <>
            <Alert msg={{ kind: 'warn', text: t('biz.itemsMissing', { count: missing.length }) }} />
            <ul className="plain-list cell-sub" data-testid="gst-missing">{missing.map((p) => <li key={p.id}>• {p.name_en}</li>)}</ul>
          </>
        )}
      </div>
    </section>
  )
}

function SettingsForm({ s, isAdmin, onSaved }: { s: Settings; isAdmin: boolean; onSaved: () => void }) {
  const { t } = useTranslation()
  const [f, setF] = useState({ name: s.business_name ?? '', legal: s.legal_name ?? '', gstin: s.business_gstin ?? '', address: s.business_address ?? '', phone: s.business_phone ?? '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  const gstin = f.gstin.replace(/\s/g, '').toUpperCase()
  const gstinOk = !gstin || GSTIN.test(gstin)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); if (!gstinOk || f.name.trim().length < 2) return
    setBusy(true); setMsg(null)
    try {
      await must(supabase.rpc('settings_save', { p_business_name: f.name, p_legal_name: f.legal, p_gstin: gstin || null, p_address: f.address, p_phone: f.phone }))
      onSaved()
      setMsg({ kind: 'success', text: gstin ? t('biz.savedGst') : t('biz.saved') })
    } catch (err) { setMsg({ kind: 'error', text: errorMessage(t, err) }) } finally { setBusy(false) }
  }

  return (
      <form className="card stack" onSubmit={submit} noValidate>
        <h2 className="row"><Building2 size={20} aria-hidden="true" />{t('biz.details')}</h2>
        <fieldset disabled={!isAdmin || busy} className="plain stack">
          <div className="form-grid">
            <label className="field"><span>{t('biz.name')}</span><input maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
            <label className="field"><span>{t('biz.legal')}</span><input maxLength={120} value={f.legal} onChange={(e) => setF({ ...f, legal: e.target.value })} /></label>
            <label className="field"><span>{t('biz.gstin')}</span>
              <input maxLength={15} value={f.gstin} placeholder="22AAAAA0000A1Z5" aria-invalid={!gstinOk} aria-describedby="gstin-hint"
                onChange={(e) => setF({ ...f, gstin: e.target.value.toUpperCase() })} style={{ textTransform: 'uppercase' }} /></label>
            <label className="field"><span>{t('biz.phone')}</span><input maxLength={20} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
          </div>
          <p id="gstin-hint" className={`cell-sub ${gstinOk ? '' : 'text-warn'}`}>{gstinOk ? (gstin ? t('biz.gstinOn') : t('biz.gstinEmpty')) : t('errors.BAD_GSTIN')}</p>
          <label className="field"><span>{t('biz.address')}</span><textarea rows={2} maxLength={250} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></label>
          <p className="cell-sub">{t('biz.state', { state: s.state_name ?? 'Chhattisgarh', code: s.state_code ?? '22' })}</p>
          <Alert msg={msg} />
          {isAdmin && <div className="row"><button type="submit" className="primary" disabled={!gstinOk || f.name.trim().length < 2}>{busy ? t('common.loading') : t('common.save')}</button></div>}
        </fieldset>
      </form>
  )
}
