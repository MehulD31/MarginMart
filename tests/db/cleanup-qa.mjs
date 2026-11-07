// Removes leftover "QA DEL" test records (from a failed UI test run) through admin_delete, so audit + stock rules apply.
// Run: node tests/db/cleanup-qa.mjs
import { call, login, rest } from './lib.mjs'

const tok = await login('8871565551', '1234')
const jobs = [
  ['purchase', 'purchase?select=id,invoice_no&invoice_no=like.QA-%25', 'invoice_no'],
  ['route', 'route?select=id,name&name=like.QA%25', 'name'],
  ['vehicle', 'vehicle?select=id,name&name=like.QA%25', 'name'],
  ['pack', 'pack?select=id,name_en&name_en=like.QA%25', 'name_en'],
  ['user', 'profiles?select=user_id,name&name=like.QA%25', 'name', 'user_id'],
  ['supplier', 'supplier?select=id,name&name=like.QA%25', 'name'],
  ['join_request', 'join_requests?select=id,shop_name&shop_name=like.QA%25', 'shop_name'],
  ['scheme', 'scheme?select=id,note&note=like.QA%25', 'note'],
]
let n = 0
// orders of QA shops first, so their logins have no history left
for (const s of (await rest('shop?select=id,name&or=(name.like.QA%20*,name.like.TEST%20*)', tok)) ?? []) {
  for (const o of (await rest(`orders?select=id&shop_id=eq.${s.id}`, tok)) ?? []) {
    const r = await call('admin_delete', { p_kind: 'order', p_id: o.id }, tok)
    console.log(r.status < 300 ? '  deleted' : '  FAILED ', 'order', s.name, r.status < 300 ? '' : JSON.stringify(r.body)); n++
  }
}
for (const [kind, path, label, key = 'id'] of jobs) {
  for (const row of (await rest(path, tok)) ?? []) {
    const r = await call('admin_delete', { p_kind: kind, p_id: row[key] }, tok)
    console.log(r.status < 300 ? '  deleted' : '  FAILED ', kind, row[label], r.status < 300 ? '' : JSON.stringify(r.body))
    n++
  }
}
console.log(n ? `\n${n} leftover(s) handled` : 'nothing to clean')
