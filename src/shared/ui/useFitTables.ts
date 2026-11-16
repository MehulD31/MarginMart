import { useEffect } from 'react'

/**
 * Laptop tables scroll inside their own box (see .table-wrap in index.css). The box must end inside the window, otherwise its
 * left-right scrollbar sits below the screen again. This sizes every .table-wrap to "from where it starts to the bottom of the
 * window" when the page opens, when the window is resized, and when a table appears. Phones (under 960px) show cards: untouched.
 */
export function useFitTables() {
  useEffect(() => {
    let raf = 0
    const fit = () => {
      raf = 0
      const laptop = window.matchMedia('(min-width: 960px)').matches
      for (const el of document.querySelectorAll<HTMLElement>('.table-wrap')) {
        if (!laptop || el.closest('dialog')) { el.style.maxHeight = ''; continue }
        const top = el.getBoundingClientRect().top + window.scrollY
        // leave room for the pager under the table and a little air; never smaller than ~6 rows
        el.style.maxHeight = `${Math.max(260, Math.round(window.innerHeight - top - 96))}px`
      }
    }
    const queue = () => { if (!raf) raf = requestAnimationFrame(fit) }
    const mo = new MutationObserver(queue)
    mo.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', queue)
    queue()
    return () => { mo.disconnect(); window.removeEventListener('resize', queue); if (raf) cancelAnimationFrame(raf) }
  }, [])
}
