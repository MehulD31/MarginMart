import { useMemo, useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ImagePlus, Package, Plus, Recycle } from 'lucide-react'
import { supabase } from '../../shared/api/supabase'
import { imageUrl, must, usePacks, useVariants, type Pack, type Variant } from '../../shared/api/db'
import { useAuth } from '../../shared/api/auth'
import { formatPaise, rupeesToPaise } from '../../shared/money'
import { compressImage } from '../../shared/image'
import { ProductImage } from '../../shared/ui/ProductImage'
import { errorMessage } from '../../shared/ui/errors'
import { Alert, Empty, PageHeader, Sheet, Skeleton, type Msg } from '../../shared/ui/kit'

export default function CatalogPage() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const packs = usePacks()
  const variants = useVariants()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const byPack = useMemo(() => {
    const m = new Map<string, Variant[]>()
    for (const v of variants.data ?? []) m.set(v.pack_id, [...(m.get(v.pack_id) ?? []), v])
    return m
  }, [variants.data])
  const list = (packs.data ?? []).filter((p) => `${p.name_en} ${p.name_hi ?? ''}`.toLowerCase().includes(q.toLowerCase()))
  const photos = (variants.data ?? []).filter((v) => v.image_path).length
  const current = packs.data?.find((p) => p.id === open)

  return (
    <section className="stack-lg">
      <PageHeader title={t('catalog.title')}
        sub={t('catalog.sub', { packs: packs.data?.length ?? 0, flavours: variants.data?.length ?? 0, photos })} />
      {!isAdmin && <Alert msg={{ kind: 'warn', text: t('catalog.readOnly') }} />}
      <input type="search" aria-label={t('common.search')} placeholder={t('catalog.searchLabel')} value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 420 }} />

      {packs.isLoading ? <Skeleton rows={6} /> : list.length === 0 ? (
        <div className="card"><Empty icon={<Package size={26} />} title={t('common.noMatches')} /></div>
      ) : (
        <div className="pack-grid">
          {list.map((p) => {
            const vs = byPack.get(p.id) ?? []
            return (
              <button key={p.id} type="button" className={`pack-card ${p.active ? '' : 'dim'}`} onClick={() => setOpen(p.id)}>
                <ProductImage path={vs.find((v) => v.image_path)?.image_path} name={p.name_en} size={64} />
                <div className="grow">
                  <div className="cell-title">{p.name_en}</div>
                  <div className="cell-sub">{t('catalog.caseOf', { n: p.units_per_case })} · MRP {formatPaise(p.mrp_paise)}</div>
                  <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    <span className="badge">{t('catalog.nFlavours', { count: vs.length })}</span>
                    {p.is_returnable && <span className="badge badge-amber"><Recycle size={12} aria-hidden="true" />{t('catalog.returnable')}</span>}
                    {!p.active && <span className="badge">{t('users.inactive')}</span>}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      <Sheet open={!!current} wide title={current?.name_en} onClose={() => setOpen(null)}>
        {current && <PackEditor key={current.id} pack={current} variants={byPack.get(current.id) ?? []} canEdit={isAdmin} />}
      </Sheet>
    </section>
  )
}

function PackEditor({ pack, variants, canEdit }: { pack: Pack; variants: Variant[]; canEdit: boolean }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name_en: pack.name_en, name_hi: pack.name_hi ?? '', units: String(pack.units_per_case),
    mrp: String(pack.mrp_paise / 100), returnable: pack.is_returnable, active: pack.active,
  })
  const [msg, setMsg] = useState<Msg>(null)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setMsg(null)
    try {
      await must(supabase.from('pack').update({
        name_en: form.name_en.trim(), name_hi: form.name_hi.trim() || null, units_per_case: Number(form.units),
        mrp_paise: rupeesToPaise(Number(form.mrp)), is_returnable: form.returnable, active: form.active,
      }).eq('id', pack.id).select())
      setMsg({ kind: 'success', text: t('common.saved') })
      void qc.invalidateQueries({ queryKey: ['pack'] })
    } catch (err) { setMsg({ kind: 'error', text: errorMessage(t, err) }) }
  }
  const valid = form.name_en.trim() && Number(form.units) >= 1 && Number(form.mrp) > 0

  return (
    <div className="stack-lg">
      <form className="stack" onSubmit={save} noValidate>
        <fieldset disabled={!canEdit} className="plain stack">
          <div className="form-grid">
            <label className="field"><span>{t('catalog.nameEn')}</span><input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} /></label>
            <label className="field"><span>{t('catalog.nameHi')}</span><input lang="hi" value={form.name_hi} onChange={(e) => setForm({ ...form, name_hi: e.target.value })} /></label>
            <label className="field"><span>{t('catalog.unitsPerCase')}</span><input type="number" inputMode="numeric" min={1} value={form.units} onChange={(e) => setForm({ ...form, units: e.target.value })} /></label>
            <label className="field"><span>{t('catalog.mrpPerUnit')}</span><input type="number" inputMode="decimal" min={0} step="0.5" value={form.mrp} onChange={(e) => setForm({ ...form, mrp: e.target.value })} /></label>
          </div>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <label className="chip"><input type="checkbox" checked={form.returnable} onChange={(e) => setForm({ ...form, returnable: e.target.checked })} />{t('catalog.returnableLabel')}</label>
            <label className="chip"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />{t('catalog.activeLabel')}</label>
          </div>
          <Alert msg={msg} />
          {canEdit && <div className="row"><button type="submit" className="primary" disabled={!valid}>{t('common.save')}</button></div>}
        </fieldset>
      </form>

      <div className="stack">
        <div className="row-between"><h3>{t('catalog.flavoursTitle')}</h3><span className="muted">{t('catalog.photoHint')}</span></div>
        <ul className="variant-grid">{variants.map((v) => <VariantCard key={v.id} v={v} canEdit={canEdit} />)}</ul>
        {canEdit && <AddVariant packId={pack.id} />}
      </div>
    </div>
  )
}

function VariantCard({ v, canEdit }: { v: Variant; canEdit: boolean }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [en, setEn] = useState(v.flavour_en)
  const [hi, setHi] = useState(v.flavour_hi ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refresh = () => void qc.invalidateQueries({ queryKey: ['variant'] })

  const update = async (patch: Partial<Variant>) => {
    setBusy(true); setError(null)
    try { await must(supabase.from('variant').update(patch).eq('id', v.id).select()); refresh() }
    catch (err) { setError(errorMessage(t, err)) }
    finally { setBusy(false) }
  }
  const upload = async (file: File | undefined) => {
    if (!file) return
    setBusy(true); setError(null)
    try {
      const blob = await compressImage(file)
      const path = `${v.pack_id}/${v.id}-${Date.now()}.webp`
      const { error: upErr } = await supabase.storage.from('product-images').upload(path, blob, { contentType: 'image/webp' })
      if (upErr) throw upErr
      const old = v.image_path
      await must(supabase.from('variant').update({ image_path: path }).eq('id', v.id).select())
      if (old) await supabase.storage.from('product-images').remove([old])
      refresh()
    } catch (err) { setError(errorMessage(t, err)) }
    finally { setBusy(false) }
  }

  const src = imageUrl(v.image_path)
  return (
    <li className={`card variant ${v.active ? '' : 'dim'}`}>
      <label className={`thumb${canEdit ? ' thumb-upload' : ''}`} aria-busy={busy}>
        {src ? <img src={src} alt={v.flavour_en} loading="lazy" /> : <span className="stack" style={{ alignItems: 'center', gap: 4 }}><ImagePlus size={28} aria-hidden="true" /><span className="muted">{canEdit ? t('catalog.uploadPhoto') : t('catalog.noPhoto')}</span></span>}
        {canEdit && <input type="file" accept="image/*" className="sr-only" disabled={busy} aria-label={`${t('catalog.uploadPhoto')}: ${v.flavour_en}`} onChange={(e) => void upload(e.target.files?.[0])} />}
      </label>
      <fieldset disabled={!canEdit || busy} className="stack plain" style={{ gap: 8 }}>
        <label className="field"><span>{t('catalog.flavourEn')}</span>
          <input value={en} onChange={(e) => setEn(e.target.value)} onBlur={() => en.trim() && en !== v.flavour_en && void update({ flavour_en: en.trim() })} /></label>
        <label className="field"><span>{t('catalog.flavourHi')}</span>
          <input lang="hi" value={hi} onChange={(e) => setHi(e.target.value)} onBlur={() => hi !== (v.flavour_hi ?? '') && void update({ flavour_hi: hi.trim() || null })} /></label>
        {canEdit && <label className="chip"><input type="checkbox" checked={v.active} onChange={(e) => void update({ active: e.target.checked })} />{t('catalog.showToShops')}</label>}
        {error && <p className="error" role="alert">{error}</p>}
      </fieldset>
    </li>
  )
}

function AddVariant({ packId }: { packId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const add = async (e: FormEvent) => {
    e.preventDefault(); setError(null)
    try {
      await must(supabase.from('variant').insert({ pack_id: packId, flavour_en: name.trim(), sort: 99 }).select())
      setName(''); void qc.invalidateQueries({ queryKey: ['variant'] })
    } catch (err) { setError(errorMessage(t, err)) }
  }
  return (
    <form className="row" onSubmit={add} noValidate style={{ alignItems: 'flex-end' }}>
      <label className="field grow"><span>{t('catalog.newFlavour')}</span><input maxLength={60} placeholder="Pepsi" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <button type="submit" disabled={!name.trim()}><Plus size={18} aria-hidden="true" />{t('common.add')}</button>
      {error && <p className="error full" role="alert">{error}</p>}
    </form>
  )
}
