import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Download, FileDown } from 'lucide-react'
import { supabase } from '../../shared/api/supabase'
import { must } from '../../shared/api/db'
import { Alert, Empty, PageHeader, Skeleton } from '../../shared/ui/kit'
import { itemName, niceDate, periodOf, reportHtml, rupees, type SalesReport } from '../../shared/salesReport.js'
import { todayIST } from './opsData'

// Sales report (owner, 13 Nov 2026): everything sold, any period, always live. "Download PDF" prints the same document
// the autopilot sends to Telegram (src/shared/salesReport.js). Admin only (shows margin).
const KINDS = ['till', 'month', 'lastmonth', 'week', 'today', 'custom'] as const
type Kind = (typeof KINDS)[number]
type SortKey = 'cases' | 'amount_paise' | 'margin_paise' | 'shops' | 'item'

export default function SalesReportPage() {
  const { t } = useTranslation()
  const today = todayIST()
  const [kind, setKind] = useState<Kind>('till')
  const [custom, setCustom] = useState({ from: today.slice(0, 8) + '01', to: today })
  const [sort, setSort] = useState<SortKey>('cases')
  const [q, setQ] = useState('')
  const [exporting, setExporting] = useState(false)
  const p = kind === 'custom' ? { ...custom, label: `${niceDate(custom.from)} – ${niceDate(custom.to)}` } : periodOf(kind, today)
  const badRange = kind === 'custom' && (!custom.from || !custom.to || custom.from > custom.to)
  const rep = useQuery({ queryKey: ['sales_report', p.from, p.to], enabled: !badRange, refetchInterval: 120_000,
    queryFn: () => must<SalesReport>(supabase.rpc('sales_report', { p_from: p.from, p_to: p.to })) })

  const items = useMemo(() => {
    const list = (rep.data?.by_item ?? []).filter((i) => itemName(i.item).toLowerCase().includes(q.trim().toLowerCase()))
    return [...list].sort((a, b) => (sort === 'item' ? itemName(a.item).localeCompare(itemName(b.item)) : Number(b[sort]) - Number(a[sort])))
  }, [rep.data, sort, q])

  const pdf = () => {
    if (!rep.data) return
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(reportHtml(rep.data, { title: t('srep.title'), label: p.label, generatedAt: new Date().toISOString() }))
    w.document.close()
    w.onload = () => { w.focus(); w.print() }
    setTimeout(() => { try { w.focus(); w.print() } catch { /* closed */ } }, 600)
  }

  const exportExcel = async () => {
    if (!rep.data) return
    setExporting(true)
    try {
      const r = rep.data, tt = r.totals
      const rs = (paise: number | string | null | undefined) => Number((Number(paise ?? 0) / 100).toFixed(2))
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      const styleHead = (ws: InstanceType<typeof ExcelJS.Workbook>['worksheets'][number], cols: { header: string; key: string; width: number }[]) => {
        ws.columns = cols
        const head = ws.getRow(1)
        head.font = { bold: true, color: { argb: 'FFFFFFFF' } }
        head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF15803D' } }
        ws.views = [{ state: 'frozen', ySplit: 1 }]
        ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } }
      }

      const netAmt = Number(tt?.net_paise ?? 0)
      const grossAmt = Number(tt?.gross_paise ?? 0)
      const costAmt = Number(tt?.cost_paise ?? 0)
      const marginAmt = Number(tt?.margin_paise ?? 0)
      const discAmt = Number(tt?.discount_paise ?? 0)
      const totCases = Number(tt?.cases ?? 0)
      const totBills = Math.max(1, Number(tt?.bills ?? 0))
      const totDays = Math.max(1, Number(tt?.days ?? 0))
      const fromEff = r.first_sale && r.from < r.first_sale ? r.first_sale : r.from

      // 1. Summary sheet
      const wsSum = wb.addWorksheet('Summary')
      styleHead(wsSum, [
        { header: 'Metric', key: 'metric', width: 28 },
        { header: 'Value', key: 'value', width: 22 },
        { header: 'Notes', key: 'notes', width: 38 },
      ])
      wsSum.addRows([
        { metric: 'Report Period', value: p.label, notes: `${fromEff} to ${r.to}` },
        { metric: 'Total Sales (Net, ₹)', value: rs(netAmt), notes: discAmt ? `After ₹${rs(discAmt)} bill discounts` : 'All bills (incl. GST)' },
        { metric: 'Gross Sales (₹)', value: rs(grossAmt), notes: 'Before bill discounts' },
        { metric: 'Buy Cost (₹)', value: rs(costAmt), notes: 'Based on purchase cost per case' },
        { metric: 'Gross Margin (₹)', value: rs(marginAmt), notes: `${netAmt ? ((marginAmt / netAmt) * 100).toFixed(1) : '0.0'}% of net sales` },
        { metric: 'Cases Sold', value: totCases, notes: `${Number(tt?.units ?? 0).toLocaleString('en-IN')} bottles / packs` },
        { metric: 'Bills', value: Number(tt?.bills ?? 0), notes: `${tt?.days ?? 0} selling days` },
        { metric: 'Shops Served', value: Number(tt?.shops ?? 0), notes: `${tt?.items ?? 0} unique items` },
        { metric: 'Avg Bill Value (₹)', value: rs(netAmt / totBills), notes: `${(totCases / totBills).toFixed(1)} cases / bill` },
        { metric: 'Avg Sell Rate / Case (₹)', value: rs(netAmt / Math.max(1, totCases)), notes: '' },
        { metric: 'Avg Margin / Case (₹)', value: rs(marginAmt / Math.max(1, totCases)), notes: '' },
        { metric: 'Avg Sales / Day (₹)', value: rs(netAmt / totDays), notes: `${Math.round(totCases / totDays)} cases / day` },
      ])
      wsSum.addRow({})
      const chHead = wsSum.addRow({ metric: 'Channel', value: 'Bills', notes: 'Cases / Net (₹)' })
      chHead.font = { bold: true }
      for (const c of r.by_channel ?? []) {
        wsSum.addRow({ metric: t(`srep.ch.${c.channel}`), value: c.bills, notes: `${c.cases} cases · ₹${rs(c.net).toLocaleString('en-IN')}` })
      }
      wsSum.addRow({})
      const pmHead = wsSum.addRow({ metric: 'Payment Mode', value: 'Bills', notes: 'Net (₹)' })
      pmHead.font = { bold: true }
      for (const m of r.by_mode ?? []) {
        wsSum.addRow({ metric: t(`srep.mode.${m.mode}`), value: m.bills, notes: `₹${rs(m.net).toLocaleString('en-IN')}` })
      }

      // 2. Items Sold sheet (respects current sort)
      const wsItems = wb.addWorksheet('Items Sold')
      styleHead(wsItems, [
        { header: '#', key: 'idx', width: 6 },
        { header: 'Item', key: 'item', width: 32 },
        { header: 'Brand', key: 'brand', width: 16 },
        { header: 'Cases', key: 'cases', width: 10 },
        { header: 'Bottles', key: 'bottles', width: 12 },
        { header: 'Amount (₹)', key: 'amount', width: 15 },
        { header: 'Avg Rate / Case (₹)', key: 'avgRate', width: 18 },
        { header: 'Avg Buy / Case (₹)', key: 'avgBuy', width: 18 },
        { header: 'Margin (₹)', key: 'margin', width: 15 },
        { header: 'Margin %', key: 'marginPct', width: 11 },
        { header: 'Shops', key: 'shops', width: 9 },
        { header: 'Last Sold', key: 'lastSold', width: 14 },
      ])
      const allItems = [...(r.by_item ?? [])].sort((a, b) =>
        sort === 'item' ? itemName(a.item).localeCompare(itemName(b.item)) : Number(b[sort]) - Number(a[sort])
      )
      allItems.forEach((i, idx) => {
        const amt = Number(i.amount_paise ?? 0)
        const mrg = Number(i.margin_paise ?? 0)
        const row = wsItems.addRow({
          idx: idx + 1,
          item: itemName(i.item),
          brand: i.brand,
          cases: Number(i.cases),
          bottles: Number(i.units),
          amount: rs(amt),
          avgRate: rs(i.avg_rate_paise),
          avgBuy: i.avg_buy_paise != null ? rs(i.avg_buy_paise) : '',
          margin: rs(mrg),
          marginPct: amt ? Number(((mrg / amt) * 100).toFixed(1)) : 0,
          shops: Number(i.shops),
          lastSold: i.last_sold,
        })
        if (mrg < 0) row.getCell('margin').font = { color: { argb: 'FFDC2626' }, bold: true }
      })
      if (allItems.length) {
        const totRow = wsItems.addRow({
          idx: '',
          item: `TOTAL (${allItems.length} items)`,
          brand: '',
          cases: totCases,
          bottles: Number(tt?.units ?? 0),
          amount: rs(grossAmt),
          avgRate: rs(grossAmt / Math.max(1, totCases)),
          avgBuy: rs(costAmt / Math.max(1, totCases)),
          margin: rs(marginAmt + discAmt),
          marginPct: grossAmt ? Number((((marginAmt + discAmt) / grossAmt) * 100).toFixed(1)) : 0,
          shops: '',
          lastSold: '',
        })
        totRow.font = { bold: true }
      }

      // 3. Day by Day sheet
      const wsDay = wb.addWorksheet('Day by Day')
      styleHead(wsDay, [
        { header: 'Date', key: 'date', width: 14 },
        { header: 'Bills', key: 'bills', width: 10 },
        { header: 'Cases', key: 'cases', width: 12 },
        { header: 'Amount (₹)', key: 'amount', width: 16 },
      ])
      for (const d of r.by_day ?? []) {
        wsDay.addRow({ date: d.dy, bills: Number(d.bills), cases: Number(d.cases), amount: rs(d.amount_paise) })
      }
      if ((r.by_day ?? []).length) {
        const totDay = wsDay.addRow({
          date: 'TOTAL',
          bills: (r.by_day ?? []).reduce((s, d) => s + Number(d.bills), 0),
          cases: (r.by_day ?? []).reduce((s, d) => s + Number(d.cases), 0),
          amount: rs((r.by_day ?? []).reduce((s, d) => s + Number(d.amount_paise), 0)),
        })
        totDay.font = { bold: true }
      }

      // 4. By Brand sheet
      const wsBrand = wb.addWorksheet('By Brand')
      styleHead(wsBrand, [
        { header: 'Brand', key: 'brand', width: 22 },
        { header: 'Cases', key: 'cases', width: 12 },
        { header: 'Amount (₹)', key: 'amount', width: 16 },
        { header: 'Share %', key: 'share', width: 12 },
      ])
      for (const b of r.by_brand ?? []) {
        wsBrand.addRow({
          brand: b.brand,
          cases: Number(b.cases),
          amount: rs(b.amount_paise),
          share: grossAmt ? Number(((Number(b.amount_paise) / grossAmt) * 100).toFixed(1)) : 0,
        })
      }

      // 5. Top Shops sheet
      const wsShops = wb.addWorksheet('Top Shops')
      styleHead(wsShops, [
        { header: '#', key: 'idx', width: 6 },
        { header: 'Shop', key: 'shop', width: 30 },
        { header: 'Area', key: 'area', width: 20 },
        { header: 'Bills', key: 'bills', width: 10 },
        { header: 'Cases', key: 'cases', width: 12 },
        { header: 'Amount (₹)', key: 'amount', width: 16 },
      ])
      ;(r.top_shops ?? []).forEach((s, idx) => {
        wsShops.addRow({
          idx: idx + 1,
          shop: s.name,
          area: s.locality ?? '',
          bills: Number(s.bills),
          cases: Number(s.cases),
          amount: rs(s.amount_paise),
        })
      })

      const buf = await wb.xlsx.writeBuffer()
      const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `KD-Foods-sales-report-${fromEff}-to-${r.to}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } finally {
      setExporting(false)
    }
  }

  const r = rep.data, tt = r?.totals
  const net = Number(tt?.net_paise ?? 0), cases = Number(tt?.cases ?? 0), bills = Math.max(1, Number(tt?.bills ?? 0))
  const maxDay = Math.max(1, ...(r?.by_day ?? []).map((d) => Number(d.amount_paise)))
  const th = (k: SortKey, label: string, num = true) => (
    <th scope="col" className={num ? 'num' : undefined} aria-sort={sort === k ? 'descending' : 'none'}>
      <button type="button" className="th-sort" onClick={() => setSort(k)}>{label}{sort === k ? ' ▾' : ''}</button></th>)

  return (
    <section className="stack-lg">
      <PageHeader title={t('srep.title')} sub={t('srep.sub')}
        actions={<>
          <button type="button" onClick={() => void exportExcel()} disabled={!r || exporting} data-testid="srep-excel">
            <Download size={18} aria-hidden="true" /> {exporting ? t('common.loading') : t('srep.excel')}
          </button>
          <button type="button" onClick={pdf} disabled={!r} data-testid="srep-pdf"><FileDown size={18} aria-hidden="true" /> {t('srep.pdf')}</button>
        </>} />
      <div className="segmented" role="tablist" aria-label={t('srep.period')} style={{ flexWrap: 'wrap' }}>
        {KINDS.map((k) => <button key={k} type="button" role="tab" className="btn-sm" aria-selected={kind === k} onClick={() => setKind(k)}>{t(`srep.k.${k}`)}</button>)}
      </div>
      {kind === 'custom' && (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <label className="stack" style={{ gap: 2 }}><span className="cell-sub">{t('srep.from')}</span><input className="input" type="date" value={custom.from} max={today} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></label>
          <label className="stack" style={{ gap: 2 }}><span className="cell-sub">{t('srep.to')}</span><input className="input" type="date" value={custom.to} max={today} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></label>
        </div>)}
      {badRange && <Alert msg={{ kind: 'error', text: t('srep.badRange') }} />}
      {rep.isError && <Alert msg={{ kind: 'error', text: t('srep.error') }} />}
      {!badRange && rep.isLoading && <Skeleton rows={8} />}
      {r && !Number(tt?.bills) && <Empty icon={<FileDown size={24} />} title={t('srep.none')} />}
      {r && !!Number(tt?.bills) && <>
        <p className="muted" style={{ margin: 0 }}>{p.label} · {niceDate(r.first_sale && r.from < r.first_sale ? r.first_sale : r.from)} – {niceDate(r.to)}</p>
        <div className="stats" data-testid="srep-totals">
          <Stat l={t('srep.sales')} v={rupees(net)} s={Number(tt!.discount_paise) ? t('srep.afterDisc', { v: rupees(tt!.discount_paise) }) : t('srep.allBills')} />
          <Stat l={t('srep.cases')} v={cases.toLocaleString('en-IN')} s={t('srep.units', { n: Number(tt!.units).toLocaleString('en-IN') })} />
          <Stat l={t('srep.bills')} v={String(tt!.bills)} s={t('srep.days', { n: tt!.days })} />
          <Stat l={t('srep.shops')} v={String(tt!.shops)} s={t('srep.items', { n: tt!.items })} />
          <Stat l={t('srep.avgBill')} v={rupees(net / bills)} s={t('srep.casesBill', { n: (cases / bills).toFixed(1) })} />
          <Stat l={t('srep.perCase')} v={rupees(net / Math.max(1, cases))} s={t('srep.rate')} />
          <Stat l={t('srep.perDay')} v={rupees(net / Math.max(1, Number(tt!.days)))} s={t('srep.casesDay', { n: Math.round(cases / Math.max(1, Number(tt!.days))) })} />
          <Stat l={t('srep.margin')} v={rupees(tt!.margin_paise)} s={t('srep.marginSub', { p: net ? ((Number(tt!.margin_paise) / net) * 100).toFixed(1) : '0', c: rupees(Number(tt!.margin_paise) / Math.max(1, cases)) })} />
        </div>

        <div className="card stack" style={{ gap: 8 }}>
          <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 17 }}>{t('srep.itemsSold')} ({items.length})</h2>
            <input className="input" style={{ maxWidth: 220 }} placeholder={t('srep.search')} aria-label={t('srep.search')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {/* Phones: sort chips + one card per item (a 8-column table left Amount off screen). Laptop: the table with sortable headers. */}
          <div className="segmented only-phone" role="group" aria-label={t('srep.sortBy')}>
            {([['cases', t('srep.cases')], ['amount_paise', t('srep.amount')], ['margin_paise', t('srep.marginCol')], ['shops', t('srep.shopsCol')], ['item', t('srep.item')]] as [SortKey, string][]).map(([k, label]) => (
              <button key={k} type="button" className="btn-sm" aria-pressed={sort === k} onClick={() => setSort(k)}>{label}</button>))}
          </div>
          <div className="table-wrap table-scroll"><table className="dense table-stack" data-testid="srep-items">
            <thead><tr>{th('item', t('srep.item'), false)}{th('cases', t('srep.cases'))}<th scope="col" className="num">{t('srep.bottles')}</th>{th('amount_paise', t('srep.amount'))}
              <th scope="col" className="num">{t('srep.avgRate')}</th><th scope="col" className="num">{t('srep.avgBuy')}</th>{th('margin_paise', t('srep.marginCol'))}{th('shops', t('srep.shopsCol'))}<th scope="col" className="num">{t('srep.lastSold')}</th></tr></thead>
            <tbody>{items.map((i) => (
              <tr key={i.item}><td className="lead"><b>{itemName(i.item)}</b><div className="cell-sub">{i.brand}</div></td>
                <td className="num" data-label={t('srep.cases')}><b>{i.cases}</b></td><td className="num" data-label={t('srep.bottles')}>{Number(i.units).toLocaleString('en-IN')}</td>
                <td className="num" data-label={t('srep.amount')}><b>{rupees(i.amount_paise)}</b></td>
                <td className="num" data-label={t('srep.avgRate')}>{rupees(i.avg_rate_paise)}</td>
                <td className="num" data-label={t('srep.avgBuy')}>{i.avg_buy_paise != null ? rupees(i.avg_buy_paise) : '—'}</td>
                <td className="num" data-label={t('srep.marginCol')} style={{ color: Number(i.margin_paise) < 0 ? '#dc2626' : undefined }}>{rupees(i.margin_paise)}</td>
                <td className="num" data-label={t('srep.shopsCol')}>{i.shops}</td><td className="num" data-label={t('srep.lastSold')}>{niceDate(i.last_sold)}</td></tr>))}</tbody>
            <tfoot><tr><td className="lead"><b>{t('srep.total')}</b></td><td className="num" data-label={t('srep.cases')}><b>{cases}</b></td><td className="num" data-label={t('srep.bottles')}>{Number(tt!.units).toLocaleString('en-IN')}</td>
              <td className="num" data-label={t('srep.amount')}><b>{rupees(tt!.gross_paise)}</b></td>
              <td className="num" data-label={t('srep.avgRate')}>{rupees(Number(tt!.gross_paise) / Math.max(1, cases))}</td>
              <td className="num" data-label={t('srep.avgBuy')}>{rupees(Number(tt!.cost_paise) / Math.max(1, cases))}</td>
              <td className="num" data-label={t('srep.marginCol')}>{rupees(Number(tt!.margin_paise) + Number(tt!.discount_paise))}</td><td className="phone-hide" /><td className="phone-hide" /></tr></tfoot>
          </table></div>
        </div>

        <div className="srep-grid">
          <div className="card stack" style={{ gap: 6 }}><h2 style={{ margin: 0, fontSize: 17 }}>{t('srep.byBrand')}</h2>
            {r.by_brand.map((b) => <Bar key={b.brand} label={b.brand} right={`${b.cases} · ${rupees(b.amount_paise)}`} pct={Number(b.amount_paise) / Math.max(1, Number(tt!.gross_paise))} />)}</div>
          <div className="card stack" style={{ gap: 6 }}><h2 style={{ margin: 0, fontSize: 17 }}>{t('srep.howSold')}</h2>
            {r.by_channel.map((c) => <Bar key={c.channel} label={t(`srep.ch.${c.channel}`)} right={`${c.bills} ${t('srep.billsShort')} · ${rupees(c.net)}`} pct={Number(c.net) / Math.max(1, Number(tt!.gross_paise))} />)}
            <h3 style={{ margin: '8px 0 0', fontSize: 15 }}>{t('srep.payment')}</h3>
            {r.by_mode.map((m) => <Bar key={m.mode} label={t(`srep.mode.${m.mode}`)} right={`${m.bills} ${t('srep.billsShort')} · ${rupees(m.net)}`} pct={Number(m.net) / Math.max(1, net)} />)}</div>
        </div>

        <div className="card stack" style={{ gap: 6 }}><h2 style={{ margin: 0, fontSize: 17 }}>{t('srep.byDay')}</h2>
          {r.by_day.map((d) => <Bar key={d.dy} label={niceDate(d.dy)} right={`${d.bills} ${t('srep.billsShort')} · ${d.cases} ${t('srep.casesShort')} · ${rupees(d.amount_paise)}`} pct={Number(d.amount_paise) / maxDay} />)}</div>

        <div className="card stack" style={{ gap: 8 }}><h2 style={{ margin: 0, fontSize: 17 }}>{t('srep.topShops')}</h2>
          <div className="table-wrap table-scroll"><table className="dense">
            <thead><tr><th scope="col">{t('srep.shop')}</th><th scope="col" className="num">{t('srep.bills')}</th><th scope="col" className="num">{t('srep.cases')}</th><th scope="col" className="num">{t('srep.amount')}</th></tr></thead>
            <tbody>{r.top_shops.map((s) => <tr key={s.name + s.locality}><th scope="row">{s.name}<div className="cell-sub">{s.locality}</div></th><td className="num">{s.bills}</td><td className="num">{s.cases}</td><td className="num">{rupees(s.amount_paise)}</td></tr>)}</tbody>
          </table></div></div>
        <p className="muted">{t('srep.note')}</p>
      </>}
    </section>
  )
}

function Stat({ l, v, s }: { l: string; v: string; s?: string }) {
  return <div className="stat"><div className="label">{l}</div><div className="value num">{v}</div>{s && <div className="cell-sub">{s}</div>}</div>
}
function Bar({ label, right, pct }: { label: string; right: string; pct: number }) {
  return (
    <div className="stack" style={{ gap: 3 }}>
      <div className="row-between cell-sub" style={{ gap: 8 }}><span style={{ color: 'var(--text, #0f172a)' }}>{label}</span><span className="num">{right}</span></div>
      <div className="srep-bar"><i style={{ width: `${Math.max(2, Math.min(100, pct * 100))}%` }} /></div>
    </div>)
}
