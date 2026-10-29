import { useState } from 'react'

/** Client-side paging. Goes back to page 1 whenever the list changes size (new search or filter). */
export function usePaged<T>(items: T[], size = 25) {
  const [state, setState] = useState({ page: 1, total: items.length })
  const page = state.total === items.length ? state.page : 1
  const pages = Math.max(1, Math.ceil(items.length / size))
  const current = Math.min(page, pages)
  return {
    rows: items.slice((current - 1) * size, current * size),
    page: current, pages, total: items.length, from: items.length ? (current - 1) * size + 1 : 0, to: Math.min(current * size, items.length),
    setPage: (p: number) => setState({ page: Math.max(1, Math.min(p, pages)), total: items.length }),
  }
}
export type Paged = ReturnType<typeof usePaged>
