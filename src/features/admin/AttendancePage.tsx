import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Calendar, Check, CheckCheck, Clock, Download, Edit2, Plus, RotateCcw, Trash2, UserPlus, Users, Wallet, X } from 'lucide-react'
import { supabase } from '../../shared/api/supabase'
import { must } from '../../shared/api/db'
import { useAuth } from '../../shared/api/auth'
import { formatPaise, rupeesToPaise } from '../../shared/money'
import { Alert, Empty, PageHeader, Sheet, Skeleton, type Msg } from '../../shared/ui/kit'
import { todayIST } from './opsData'
import { useKharchaSettings } from './kharchaData'

type AttStatus = 'present' | 'half_day' | 'absent' | 'paid_leave' | 'holiday'
type Tab = 'daily' | 'monthly' | 'advances'

interface StaffMember {
  id: string
  name: string
  role: string
  phone: string | null
  monthly_salary_paise: number
  active: boolean
  sort_order: number
}

interface StaffAttendance {
  id: string
  staff_id: string
  att_date: string
  status: AttStatus
  overtime_paise: number
  note: string | null
  marked_by_name: string | null
  marked_at: string
}

interface StaffAdvance {
  id: string
  staff_id: string
  given_on: string
  amount_paise: number
  note: string | null
}

const STATUS_META: Record<AttStatus, { short: string; label: string; bg: string; fg: string; weight: number }> = {
  present: { short: 'P', label: 'Present', bg: '#dcfce7', fg: '#166534', weight: 1 },
  half_day: { short: 'H', label: 'Half day', bg: '#fef3c7', fg: '#92400e', weight: 0.5 },
  absent: { short: 'A', label: 'Absent', bg: '#fee2e2', fg: '#991b1b', weight: 0 },
  paid_leave: { short: 'L', label: 'Paid leave', bg: '#dbeafe', fg: '#1e40af', weight: 1 },
  holiday: { short: 'HO', label: 'Holiday', bg: '#ede9fe', fg: '#5b21b6', weight: 1 },
}

const CYCLE_ORDER: (AttStatus | null)[] = ['present', 'half_day', 'absent', 'paid_leave', null]

function daysInMonth(ym: string): string[] {
  const [y, m] = ym.split('-').map(Number)
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return Array.from({ length: count }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`)
}

function monthEnd(ym: string): string {
  const days = daysInMonth(ym)
  return days[days.length - 1]
}

export default function AttendancePage() {
  const qc = useQueryClient()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const today = todayIST()
  const [tab, setTab] = useState<Tab>('daily')
  const [attDate, setAttDate] = useState(today)
  const [month, setMonth] = useState(today.slice(0, 7))
  const [msg, setMsg] = useState<Msg>(null)
  const [exporting, setExporting] = useState(false)

  // Modals
  const [staffModal, setStaffModal] = useState<{ open: boolean; editing?: StaffMember }>({ open: false })
  const [staffForm, setStaffForm] = useState({ name: '', role: 'driver', phone: '', salary: '' })
  const [advOpen, setAdvOpen] = useState(false)
  const [advForm, setAdvForm] = useState({ staff_id: '', given_on: today, amount: '', note: '' })
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})
  const [otDrafts, setOtDrafts] = useState<Record<string, string>>({})

  const settingsQ = useKharchaSettings()
  const workingDays = Math.max(1, settingsQ.data?.working_days ?? 26)

  const staffQ = useQuery({
    queryKey: ['staff_member'],
    queryFn: () => must<StaffMember[]>(supabase.from('staff_member').select('*').eq('active', true).order('sort_order').order('name')),
  })

  const dayAttQ = useQuery({
    queryKey: ['staff_attendance', 'day', attDate],
    queryFn: () => must<StaffAttendance[]>(supabase.from('staff_attendance').select('*').eq('att_date', attDate)),
  })

  const mStart = `${month}-01`
  const mEnd = monthEnd(month)

  const monthAttQ = useQuery({
    queryKey: ['staff_attendance', 'month', month],
    queryFn: () => must<StaffAttendance[]>(
      supabase.from('staff_attendance').select('*').gte('att_date', mStart).lte('att_date', mEnd)
    ),
  })

  const monthAdvQ = useQuery({
    queryKey: ['staff_advance', 'month', month],
    enabled: isAdmin,
    queryFn: () => must<StaffAdvance[]>(
      supabase.from('staff_advance').select('*').gte('given_on', mStart).lte('given_on', mEnd).order('given_on', { ascending: false })
    ),
  })

  const staff = staffQ.data ?? []
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff])
  const dayByStaff = useMemo(() => new Map((dayAttQ.data ?? []).map((a) => [a.staff_id, a])), [dayAttQ.data])

  const monthDays = useMemo(() => daysInMonth(month), [month])
  const monthGrid = useMemo(() => {
    const m = new Map<string, StaffAttendance>()
    for (const a of monthAttQ.data ?? []) m.set(`${a.staff_id}:${a.att_date}`, a)
    return m
  }, [monthAttQ.data])

  const advByStaff = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of monthAdvQ.data ?? []) m.set(a.staff_id, (m.get(a.staff_id) ?? 0) + Number(a.amount_paise))
    return m
  }, [monthAdvQ.data])

  const invalidateAtt = () => {
    void qc.invalidateQueries({ queryKey: ['staff_attendance'] })
  }

  const upsertAtt = useMutation({
    mutationFn: async (p: { staffId: string; date: string; status: AttStatus | null; overtimePaise?: number; note?: string }) => {
      if (p.status === null) {
        await must(supabase.from('staff_attendance').delete().eq('staff_id', p.staffId).eq('att_date', p.date))
        return
      }
      const existing = p.date === attDate ? dayByStaff.get(p.staffId) : monthGrid.get(`${p.staffId}:${p.date}`)
      await must(supabase.from('staff_attendance').upsert({
        staff_id: p.staffId,
        att_date: p.date,
        status: p.status,
        overtime_paise: p.overtimePaise !== undefined ? p.overtimePaise : (existing?.overtime_paise ?? 0),
        note: p.note !== undefined ? (p.note.trim() || null) : (existing?.note ?? null),
        marked_by: profile?.user_id ?? null,
        marked_by_name: profile?.name ?? null,
        marked_at: new Date().toISOString(),
      }, { onConflict: 'staff_id,att_date' }))
    },
    onSuccess: invalidateAtt,
    onError: (e: Error) => setMsg({ kind: 'error', text: e.message }),
  })

  const markAllPresent = useMutation({
    mutationFn: async () => {
      const unmarked = staff.filter((s) => !dayByStaff.has(s.id))
      if (!unmarked.length) return
      await must(supabase.from('staff_attendance').upsert(
        unmarked.map((s) => ({
          staff_id: s.id,
          att_date: attDate,
          status: 'present' as AttStatus,
          overtime_paise: 0,
          marked_by: profile?.user_id ?? null,
          marked_by_name: profile?.name ?? null,
          marked_at: new Date().toISOString(),
        })),
        { onConflict: 'staff_id,att_date' },
      ))
    },
    onSuccess: () => { setMsg({ kind: 'success', text: `Marked remaining staff present for ${attDate}` }); invalidateAtt() },
    onError: (e: Error) => setMsg({ kind: 'error', text: e.message }),
  })

  const saveStaff = useMutation({
    mutationFn: async () => {
      if (!staffForm.name.trim()) throw new Error('Staff name is required')
      const payload = {
        name: staffForm.name.trim(),
        role: staffForm.role,
        phone: staffForm.phone.trim() || null,
        monthly_salary_paise: rupeesToPaise(Number(staffForm.salary) || 0),
      }
      if (staffModal.editing) {
        await must(supabase.from('staff_member').update(payload).eq('id', staffModal.editing.id))
      } else {
        const maxOrder = Math.max(100, ...staff.map((s) => s.sort_order))
        await must(supabase.from('staff_member').insert({ ...payload, sort_order: maxOrder + 10, active: true }))
      }
    },
    onSuccess: () => {
      setStaffModal({ open: false })
      setMsg({ kind: 'success', text: staffModal.editing ? 'Staff updated' : 'Staff added' })
      void qc.invalidateQueries({ queryKey: ['staff_member'] })
    },
    onError: (e: Error) => setMsg({ kind: 'error', text: e.message }),
  })

  const addAdvance = useMutation({
    mutationFn: async () => {
      const amt = rupeesToPaise(Number(advForm.amount) || 0)
      if (!advForm.staff_id || amt <= 0) throw new Error('Select staff and enter a valid amount')
      await must(supabase.from('staff_advance').insert({
        staff_id: advForm.staff_id,
        given_on: advForm.given_on,
        amount_paise: amt,
        note: advForm.note.trim() || null,
        created_by: profile?.user_id ?? null,
      }))
    },
    onSuccess: () => {
      setAdvOpen(false)
      setAdvForm({ staff_id: staff[0]?.id ?? '', given_on: today, amount: '', note: '' })
      setMsg({ kind: 'success', text: 'Advance recorded' })
      void qc.invalidateQueries({ queryKey: ['staff_advance'] })
    },
    onError: (e: Error) => setMsg({ kind: 'error', text: e.message }),
  })

  const delAdvance = useMutation({
    mutationFn: async (id: string) => {
      await must(supabase.from('staff_advance').delete().eq('id', id))
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['staff_advance'] }),
    onError: (e: Error) => setMsg({ kind: 'error', text: e.message }),
  })

  // Daily summary counts
  const dayStats = useMemo(() => {
    const c = { present: 0, half_day: 0, absent: 0, paid_leave: 0, holiday: 0, unmarked: 0 }
    for (const s of staff) {
      const st = dayByStaff.get(s.id)?.status
      if (st) c[st]++
      else c.unmarked++
    }
    return c
  }, [staff, dayByStaff])

  // Monthly payroll rows
  const payrollRows = useMemo(() => {
    return staff.map((s) => {
      let present = 0, half = 0, absent = 0, leave = 0, holiday = 0, otPaise = 0
      for (const d of monthDays) {
        const rec = monthGrid.get(`${s.id}:${d}`)
        if (!rec) continue
        otPaise += Number(rec.overtime_paise ?? 0)
        if (rec.status === 'present') present++
        else if (rec.status === 'half_day') half++
        else if (rec.status === 'absent') absent++
        else if (rec.status === 'paid_leave') leave++
        else if (rec.status === 'holiday') holiday++
      }
      const payableDays = present + leave + holiday + half * 0.5
      const perDay = s.monthly_salary_paise / workingDays
      const earnedPaise = Math.round(perDay * payableDays)
      const advPaise = advByStaff.get(s.id) ?? 0
      const netPaise = earnedPaise + otPaise - advPaise
      return { staff: s, present, half, absent, leave, holiday, payableDays, earnedPaise, otPaise, advPaise, netPaise }
    })
  }, [staff, monthDays, monthGrid, workingDays, advByStaff])

  const exportExcel = async () => {
    setExporting(true)
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      const rs = (p: number) => Number((p / 100).toFixed(2))
      const styleHead = (ws: InstanceType<typeof ExcelJS.Workbook>['worksheets'][number], cols: { header: string; key: string; width: number }[]) => {
        ws.columns = cols
        const head = ws.getRow(1)
        head.font = { bold: true, color: { argb: 'FFFFFFFF' } }
        head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF15803D' } }
        ws.views = [{ state: 'frozen', ySplit: 1 }]
      }

      // 1. Salary Sheet
      const wsSal = wb.addWorksheet('Salary Sheet')
      styleHead(wsSal, [
        { header: 'Staff', key: 'name', width: 22 },
        { header: 'Role', key: 'role', width: 12 },
        { header: 'Base Salary (₹)', key: 'base', width: 16 },
        { header: 'Present', key: 'present', width: 10 },
        { header: 'Half Day', key: 'half', width: 10 },
        { header: 'Leave / Hol', key: 'leave', width: 12 },
        { header: 'Absent', key: 'absent', width: 10 },
        { header: 'Payable Days', key: 'payable', width: 13 },
        { header: 'Earned (₹)', key: 'earned', width: 14 },
        { header: 'Overtime (₹)', key: 'ot', width: 14 },
        { header: 'Advances (₹)', key: 'adv', width: 14 },
        { header: 'Net Payable (₹)', key: 'net', width: 16 },
      ])
      wsSal.addRows(payrollRows.map((r) => ({
        name: r.staff.name,
        role: r.staff.role,
        base: rs(r.staff.monthly_salary_paise),
        present: r.present,
        half: r.half,
        leave: r.leave + r.holiday,
        absent: r.absent,
        payable: r.payableDays,
        earned: rs(r.earnedPaise),
        ot: rs(r.otPaise),
        adv: rs(r.advPaise),
        net: rs(r.netPaise),
      })))
      if (payrollRows.length) {
        const tot = wsSal.addRow({
          name: 'TOTAL',
          role: '',
          base: rs(payrollRows.reduce((a, r) => a + r.staff.monthly_salary_paise, 0)),
          present: payrollRows.reduce((a, r) => a + r.present, 0),
          half: payrollRows.reduce((a, r) => a + r.half, 0),
          leave: payrollRows.reduce((a, r) => a + r.leave + r.holiday, 0),
          absent: payrollRows.reduce((a, r) => a + r.absent, 0),
          payable: payrollRows.reduce((a, r) => a + r.payableDays, 0),
          earned: rs(payrollRows.reduce((a, r) => a + r.earnedPaise, 0)),
          ot: rs(payrollRows.reduce((a, r) => a + r.otPaise, 0)),
          adv: rs(payrollRows.reduce((a, r) => a + r.advPaise, 0)),
          net: rs(payrollRows.reduce((a, r) => a + r.netPaise, 0)),
        })
        tot.font = { bold: true }
      }

      // 2. Monthly Register (Calendar Grid)
      const wsReg = wb.addWorksheet('Monthly Register')
      styleHead(wsReg, [
        { header: 'Staff', key: 'name', width: 22 },
        ...monthDays.map((d) => ({ header: String(Number(d.slice(-2))), key: d, width: 5 })),
        { header: 'Payable', key: 'payable', width: 10 },
      ])
      for (const r of payrollRows) {
        const row: Record<string, string | number> = { name: r.staff.name, payable: r.payableDays }
        for (const d of monthDays) {
          const rec = monthGrid.get(`${r.staff.id}:${d}`)
          row[d] = rec ? STATUS_META[rec.status].short : ''
        }
        wsReg.addRow(row)
      }

      // 3. Advances
      const wsAdv = wb.addWorksheet('Advances')
      styleHead(wsAdv, [
        { header: 'Date', key: 'date', width: 14 },
        { header: 'Staff', key: 'staff', width: 22 },
        { header: 'Amount (₹)', key: 'amount', width: 15 },
        { header: 'Note', key: 'note', width: 32 },
      ])
      wsAdv.addRows((monthAdvQ.data ?? []).map((a) => ({
        date: a.given_on,
        staff: staffById.get(a.staff_id)?.name ?? '—',
        amount: rs(a.amount_paise),
        note: a.note ?? '',
      })))

      const buf = await wb.xlsx.writeBuffer()
      const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `KD-Foods-attendance-${month}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message })
    } finally {
      setExporting(false)
    }
  }

  return (
    <section className="stack-lg">
      <PageHeader
        title={isAdmin ? 'Attendance & Salary' : 'Attendance'}
        sub={isAdmin ? `Daily roll-call, half-days, advances, and salary calculation (${workingDays} working days/month).` : 'Daily roll-call and monthly attendance register.'}
        actions={isAdmin && (
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => void exportExcel()} disabled={exporting || !staff.length}>
              <Download size={16} aria-hidden="true" /> {exporting ? 'Exporting...' : 'Export Excel'}
            </button>
            <button type="button" onClick={() => { setAdvForm({ staff_id: staff[0]?.id ?? '', given_on: today, amount: '', note: '' }); setAdvOpen(true) }} disabled={!staff.length}>
              <Wallet size={16} aria-hidden="true" /> + Advance
            </button>
            <button type="button" className="primary" onClick={() => { setStaffForm({ name: '', role: 'driver', phone: '', salary: '' }); setStaffModal({ open: true }) }}>
              <UserPlus size={16} aria-hidden="true" /> Add staff
            </button>
          </div>
        )}
      />

      {msg && <Alert msg={msg} />}

      <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div className="segmented" role="tablist">
          <button type="button" role="tab" className="btn-sm" aria-selected={tab === 'daily'} onClick={() => setTab('daily')}>
            <Check size={14} aria-hidden="true" /> Daily Roll-Call
          </button>
          <button type="button" role="tab" className="btn-sm" aria-selected={tab === 'monthly'} onClick={() => setTab('monthly')}>
            <Calendar size={14} aria-hidden="true" /> {isAdmin ? 'Monthly & Salary' : 'Monthly Register'}
          </button>
          {isAdmin && (
            <button type="button" role="tab" className="btn-sm" aria-selected={tab === 'advances'} onClick={() => setTab('advances')}>
              <Wallet size={14} aria-hidden="true" /> Advances ({monthAdvQ.data?.length ?? 0})
            </button>
          )}
        </div>

        {tab === 'daily' ? (
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <input type="date" className="input" value={attDate} max={today} onChange={(e) => setAttDate(e.target.value || today)} aria-label="Attendance date" />
            <button type="button" className="btn-sm" onClick={() => markAllPresent.mutate()} disabled={markAllPresent.isPending || dayStats.unmarked === 0}>
              <CheckCheck size={14} aria-hidden="true" /> Mark all Present ({dayStats.unmarked})
            </button>
          </div>
        ) : (
          <input type="month" className="input" value={month} max={today.slice(0, 7)} onChange={(e) => setMonth(e.target.value || today.slice(0, 7))} aria-label="Month" />
        )}
      </div>

      {staffQ.isLoading && <Skeleton rows={6} />}

      {!staffQ.isLoading && staff.length === 0 && (
        <div className="card"><Empty icon={<Users size={26} />} title="No staff added yet" /></div>
      )}

      {!staffQ.isLoading && staff.length > 0 && tab === 'daily' && (
        <div className="card stack" style={{ gap: 10 }}>
          <div className="cell-sub">
            <b>{attDate}</b> · {dayStats.present} present · {dayStats.half_day} half-day · {dayStats.absent} absent · {dayStats.paid_leave} leave · {dayStats.unmarked} unmarked
          </div>
          <div className="table-wrap">
            <table className="dense table-stack" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th scope="col">Staff</th>
                  <th scope="col">Attendance</th>
                  {isAdmin && <th scope="col" style={{ width: 110 }}>OT (₹)</th>}
                  <th scope="col">Note</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => {
                  const rec = dayByStaff.get(s.id)
                  const st = rec?.status
                  const meta = st ? STATUS_META[st] : null
                  const otVal = otDrafts[s.id] ?? (rec?.overtime_paise ? String(rec.overtime_paise / 100) : '')
                  const noteVal = noteDrafts[s.id] ?? (rec?.note ?? '')
                  return (
                    <tr key={s.id} style={{ background: st === 'absent' ? '#fef2f2' : st === 'present' ? '#f0fdf4' : undefined }}>
                      <td className="lead" data-label="Staff">
                        <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                          <b>{s.name}</b>
                          <span className="cell-sub" style={{ textTransform: 'capitalize' }}>({s.role})</span>
                          {isAdmin && (
                            <button
                              type="button"
                              className="icon-btn"
                              title="Edit staff / salary"
                              onClick={() => {
                                setStaffForm({
                                  name: s.name,
                                  role: s.role,
                                  phone: s.phone ?? '',
                                  salary: s.monthly_salary_paise ? String(s.monthly_salary_paise / 100) : '',
                                })
                                setStaffModal({ open: true, editing: s })
                              }}
                            >
                              <Edit2 size={13} aria-hidden="true" />
                            </button>
                          )}
                        </div>
                        {(isAdmin || rec?.marked_by_name) && (
                          <div className="cell-sub">
                            {isAdmin ? (s.monthly_salary_paise > 0 ? `${formatPaise(s.monthly_salary_paise)}/mo` : 'Salary ₹0 (tap edit)') : ''}
                            {rec?.marked_by_name ? `${isAdmin ? ' · ' : ''}Marked by ${rec.marked_by_name}` : ''}
                          </div>
                        )}
                      </td>
                      <td data-label="Attendance">
                        <div className="row" style={{ gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                          {meta && (
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: meta.bg, color: meta.fg, marginRight: 4 }}>
                              {meta.label}
                            </span>
                          )}
                          <button type="button" className="btn-sm" aria-pressed={st === 'present'}
                            onClick={() => upsertAtt.mutate({ staffId: s.id, date: attDate, status: 'present' })}>
                            <Check size={12} aria-hidden="true" /> Present
                          </button>
                          <button type="button" className="btn-sm" aria-pressed={st === 'half_day'}
                            onClick={() => upsertAtt.mutate({ staffId: s.id, date: attDate, status: 'half_day' })}>
                            <Clock size={12} aria-hidden="true" /> Half
                          </button>
                          <button type="button" className="btn-sm" aria-pressed={st === 'absent'}
                            onClick={() => upsertAtt.mutate({ staffId: s.id, date: attDate, status: 'absent' })}>
                            <X size={12} aria-hidden="true" /> Absent
                          </button>
                          <button type="button" className="btn-sm" aria-pressed={st === 'paid_leave'}
                            onClick={() => upsertAtt.mutate({ staffId: s.id, date: attDate, status: 'paid_leave' })}>
                            Leave
                          </button>
                          {st && (
                            <button type="button" className="btn-sm" title="Clear"
                              onClick={() => upsertAtt.mutate({ staffId: s.id, date: attDate, status: null })}>
                              <RotateCcw size={12} aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </td>
                      {isAdmin && (
                        <td data-label="OT (₹)">
                          <input
                            className="input"
                            inputMode="decimal"
                            style={{ width: '100%', fontSize: 12, padding: '4px 6px' }}
                            placeholder="0"
                            value={otVal}
                            onChange={(e) => setOtDrafts((d) => ({ ...d, [s.id]: e.target.value.replace(/[^\d.]/g, '') }))}
                            onBlur={() => {
                              const nextP = rupeesToPaise(Number(otVal) || 0)
                              if (nextP !== (rec?.overtime_paise ?? 0)) {
                                upsertAtt.mutate({ staffId: s.id, date: attDate, status: st ?? 'present', overtimePaise: nextP })
                              }
                            }}
                          />
                        </td>
                      )}
                      <td data-label="Note">
                        <input
                          className="input"
                          style={{ width: '100%', fontSize: 12, padding: '4px 8px' }}
                          placeholder="Remark..."
                          value={noteVal}
                          onChange={(e) => setNoteDrafts((d) => ({ ...d, [s.id]: e.target.value }))}
                          onBlur={() => {
                            if (noteVal !== (rec?.note ?? '')) {
                              upsertAtt.mutate({ staffId: s.id, date: attDate, status: st ?? 'present', note: noteVal })
                            }
                          }}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!staffQ.isLoading && staff.length > 0 && tab === 'monthly' && (
        <div className="stack-lg">
          {isAdmin && <div className="card stack" style={{ gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 17 }}>Salary Sheet · {month}</h2>
            <div className="table-wrap table-scroll">
              <table className="dense table-stack">
                <thead>
                  <tr>
                    <th scope="col">Staff</th>
                    <th scope="col" className="num">Base</th>
                    <th scope="col" className="num">P</th>
                    <th scope="col" className="num">H</th>
                    <th scope="col" className="num">L</th>
                    <th scope="col" className="num">A</th>
                    <th scope="col" className="num">Payable</th>
                    <th scope="col" className="num">Earned</th>
                    <th scope="col" className="num">OT</th>
                    <th scope="col" className="num">Advance</th>
                    <th scope="col" className="num">Net Payable</th>
                  </tr>
                </thead>
                <tbody>
                  {payrollRows.map((r) => (
                    <tr key={r.staff.id}>
                      <td className="lead"><b>{r.staff.name}</b><div className="cell-sub">{r.staff.role}</div></td>
                      <td className="num">{formatPaise(r.staff.monthly_salary_paise)}</td>
                      <td className="num">{r.present}</td>
                      <td className="num">{r.half}</td>
                      <td className="num">{r.leave + r.holiday}</td>
                      <td className="num">{r.absent}</td>
                      <td className="num"><b>{r.payableDays}</b>/{workingDays}</td>
                      <td className="num">{formatPaise(r.earnedPaise)}</td>
                      <td className="num">{r.otPaise ? formatPaise(r.otPaise) : '—'}</td>
                      <td className="num" style={{ color: r.advPaise ? '#dc2626' : undefined }}>{r.advPaise ? `−${formatPaise(r.advPaise)}` : '—'}</td>
                      <td className="num"><b>{formatPaise(r.netPaise)}</b></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="lead"><b>TOTAL</b></td>
                    <td className="num"><b>{formatPaise(payrollRows.reduce((a, r) => a + r.staff.monthly_salary_paise, 0))}</b></td>
                    <td colSpan={5} />
                    <td className="num"><b>{formatPaise(payrollRows.reduce((a, r) => a + r.earnedPaise, 0))}</b></td>
                    <td className="num"><b>{formatPaise(payrollRows.reduce((a, r) => a + r.otPaise, 0))}</b></td>
                    <td className="num"><b>{formatPaise(payrollRows.reduce((a, r) => a + r.advPaise, 0))}</b></td>
                    <td className="num"><b>{formatPaise(payrollRows.reduce((a, r) => a + r.netPaise, 0))}</b></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>}

          <div className="card stack" style={{ gap: 8 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 17 }}>Monthly Register · {month}</h2>
              <div className="cell-sub">Tap any day cell to cycle: P (Present) → H (Half) → A (Absent) → L (Leave) → Clear</div>
            </div>
            <div className="table-wrap table-scroll">
              <table className="dense" style={{ fontSize: 11 }}>
                <thead>
                  <tr>
                    <th scope="col" style={{ minWidth: 120 }}>Staff</th>
                    {monthDays.map((d) => <th scope="col" key={d} className="num" style={{ padding: '4px 3px' }}>{Number(d.slice(-2))}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {staff.map((s) => (
                    <tr key={s.id}>
                      <th scope="row" style={{ whiteSpace: 'nowrap' }}>{s.name}</th>
                      {monthDays.map((d) => {
                        const rec = monthGrid.get(`${s.id}:${d}`)
                        const meta = rec ? STATUS_META[rec.status] : null
                        const curIdx = CYCLE_ORDER.indexOf(rec?.status ?? null)
                        const nextStatus = CYCLE_ORDER[(curIdx + 1) % CYCLE_ORDER.length]
                        return (
                          <td key={d} style={{ padding: 2, textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => upsertAtt.mutate({ staffId: s.id, date: d, status: nextStatus })}
                              title={`${s.name} · ${d}${meta ? ` (${meta.label})` : ''}`}
                              style={{
                                width: 24,
                                height: 24,
                                padding: 0,
                                borderRadius: 5,
                                border: '1px solid #e2e8f0',
                                fontSize: 10,
                                fontWeight: 700,
                                cursor: 'pointer',
                                background: meta ? meta.bg : '#f8fafc',
                                color: meta ? meta.fg : '#94a3b8',
                              }}
                            >
                              {meta ? meta.short : '·'}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {isAdmin && !staffQ.isLoading && tab === 'advances' && (
        <div className="card stack" style={{ gap: 8 }}>
          <div className="row-between">
            <h2 style={{ margin: 0, fontSize: 17 }}>Advances · {month}</h2>
            <button type="button" className="btn-sm" onClick={() => { setAdvForm({ staff_id: staff[0]?.id ?? '', given_on: today, amount: '', note: '' }); setAdvOpen(true) }}>
              <Plus size={14} aria-hidden="true" /> Record advance
            </button>
          </div>
          {!(monthAdvQ.data ?? []).length ? (
            <Empty icon={<Wallet size={24} />} title="No advances recorded this month" />
          ) : (
            <div className="table-wrap">
              <table className="dense table-stack" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Staff</th>
                    <th scope="col" className="num">Amount</th>
                    <th scope="col">Note</th>
                    <th scope="col" />
                  </tr>
                </thead>
                <tbody>
                  {(monthAdvQ.data ?? []).map((a) => (
                    <tr key={a.id}>
                      <td className="num" data-label="Date">{a.given_on}</td>
                      <td data-label="Staff"><b>{staffById.get(a.staff_id)?.name ?? '—'}</b></td>
                      <td className="num" data-label="Amount"><b>{formatPaise(a.amount_paise)}</b></td>
                      <td data-label="Note">{a.note || '—'}</td>
                      <td className="actions">
                        <button type="button" className="icon-btn" title="Delete advance" onClick={() => delAdvance.mutate(a.id)}>
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Sheet open={staffModal.open} title={staffModal.editing ? `Edit ${staffModal.editing.name}` : 'Add Staff Member'} onClose={() => setStaffModal({ open: false })}>
        <form className="stack" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); saveStaff.mutate() }}>
          <label className="field"><span>Name *</span>
            <input required value={staffForm.name} onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })} /></label>
          <label className="field"><span>Role</span>
            <select value={staffForm.role} onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })}>
              <option value="driver">Driver</option>
              <option value="helper">Helper</option>
              <option value="manager">Manager</option>
              <option value="godown">Godown</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="field"><span>Phone</span>
            <input type="tel" value={staffForm.phone} onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })} /></label>
          <label className="field"><span>Monthly Salary (₹)</span>
            <input inputMode="decimal" value={staffForm.salary} onChange={(e) => setStaffForm({ ...staffForm, salary: e.target.value.replace(/[^\d.]/g, '') })} placeholder="15000" /></label>
          <button type="submit" className="primary" disabled={saveStaff.isPending}>
            {saveStaff.isPending ? 'Saving...' : 'Save'}
          </button>
        </form>
      </Sheet>

      <Sheet open={advOpen} title="Record Salary Advance" onClose={() => setAdvOpen(false)}>
        <form className="stack" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); addAdvance.mutate() }}>
          <label className="field"><span>Staff *</span>
            <select value={advForm.staff_id} onChange={(e) => setAdvForm({ ...advForm, staff_id: e.target.value })}>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
            </select>
          </label>
          <label className="field"><span>Date</span>
            <input type="date" value={advForm.given_on} max={today} onChange={(e) => setAdvForm({ ...advForm, given_on: e.target.value || today })} /></label>
          <label className="field"><span>Amount (₹) *</span>
            <input inputMode="decimal" required value={advForm.amount} onChange={(e) => setAdvForm({ ...advForm, amount: e.target.value.replace(/[^\d.]/g, '') })} placeholder="1000" /></label>
          <label className="field"><span>Note</span>
            <input value={advForm.note} onChange={(e) => setAdvForm({ ...advForm, note: e.target.value })} placeholder="Cash advance / fuel / etc." /></label>
          <button type="submit" className="primary" disabled={addAdvance.isPending}>
            {addAdvance.isPending ? 'Saving...' : 'Save Advance'}
          </button>
        </form>
      </Sheet>
    </section>
  )
}
