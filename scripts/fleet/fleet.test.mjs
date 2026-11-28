import { describe, expect, it } from 'vitest'
import { alertsFor, isNewPoint, isNight, nightKey, parseRvd } from './fleet.mjs'

const rvd = { data: { battery: { soc: 73 }, distance: { odo: 245, today: 30.66, range: 150 }, location: { coordinate: { latitude: 21.2322, longitude: 81.4049 }, heading: 0 },
  lua: { location: 1795856312 }, speed: 0, imei: '866738083071272', meta: { registration_number: 'CG07DJ1091', vehicle_type: 'Turbo' },
  states: { connectivity_state: { value: 'Offline' }, vehicle_state: { value: 'Sleep' } } } }
const at = (iso) => new Date(iso)

describe('fleet', () => {
  it('parses an Euler reading', () => {
    const r = parseRvd(rvd, { euler_id: 'x' })
    expect(r).toMatchObject({ imei: '866738083071272', reg_no: 'CG07DJ1091', model: 'Turbo', lat: 21.2322, lng: 81.4049, soc: 73, range_km: 150, km_today: 30.66, state: 'Sleep', online: false, euler_id: 'x' })
    expect(r.seen_at).toBe(new Date(1795856312000).toISOString())
  })
  it('night is 22:00-06:00 IST and one night has one key', () => {
    expect(isNight(at('2026-11-28T16:31:00Z'))).toBe(true)     // 22:01 IST
    expect(isNight(at('2026-11-28T00:29:00Z'))).toBe(true)     // 05:59 IST
    expect(isNight(at('2026-11-28T06:30:00Z'))).toBe(false)    // 12:00 IST
    expect(nightKey(at('2026-11-28T16:31:00Z'))).toBe('2026-11-28')
    expect(nightKey(at('2026-11-28T20:00:00Z'))).toBe('2026-11-28')   // 01:30 IST on the 29th = night of the 28th
    expect(nightKey(at('2026-11-29T00:00:00Z'))).toBe('2026-11-28')   // 05:30 IST next morning = same night
  })
  it('low battery and night moves alert, normal day does not', () => {
    const base = { imei: '1', reg_no: 'CG07DJ1091', lat: 21, lng: 81 }
    expect(alertsFor({ ...base, soc: 60, speed: 30 }, at('2026-11-28T06:30:00Z'))).toEqual([])
    const lowNight = alertsFor({ ...base, soc: 15, range_km: 30, speed: 25 }, at('2026-11-28T17:30:00Z'))
    expect(lowNight.map((a) => a.job)).toEqual(['fleet-low-battery', 'fleet-night-move'])
    expect(lowNight[0].key).toBe('1:2026-11-28')
    expect(lowNight[1].text).toContain('maps.google.com/?q=21,81')
  })
  it('stores a point only for a new position time', () => {
    const row = { seen_at: '2026-11-28T10:00:00.000Z', lat: 1, lng: 2 }
    expect(isNewPoint(null, row)).toBe(true)
    expect(isNewPoint('2026-11-28T10:00:00.000Z', row)).toBe(false)
    expect(isNewPoint(null, { ...row, lat: null })).toBe(false)
  })
})
