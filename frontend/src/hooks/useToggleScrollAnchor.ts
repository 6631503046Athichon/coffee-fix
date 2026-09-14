import { useCallback, useLayoutEffect, useRef } from 'react'

/**
 * Keeps a clicked expand/collapse header at the same spot on screen.
 *
 * Toggling a section changes the height of the page scroller (the app's
 * `<main>`). The browser reacts by clamping or anchoring `scrollTop`, and
 * near the bottom of the page that reads as the whole page shrinking and
 * jumping. Usage:
 *
 * - call `remember(el)` with the clicked header before changing state,
 * - pass that state as `dep`,
 * - render `<div ref={spacerRef} />` as the last element of the page.
 *
 * When the page becomes too short to keep the header in place, the spacer
 * holds the missing height. It is re-sized on every toggle, so it shrinks
 * back to zero once the page is tall enough again.
 */
export function useToggleScrollAnchor(dep: unknown) {
  const anchorRef = useRef<{ el: HTMLElement; top: number } | null>(null)
  const spacerRef = useRef<HTMLDivElement>(null)

  const remember = useCallback((el: HTMLElement) => {
    anchorRef.current = { el, top: el.getBoundingClientRect().top }
  }, [])

  useLayoutEffect(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    anchorRef.current = null
    const scroller = anchor.el.closest('main')
    if (!scroller) return

    const target =
      scroller.scrollTop + anchor.el.getBoundingClientRect().top - anchor.top
    const spacer = spacerRef.current
    if (spacer) {
      // Size the spacer so the page is just tall enough to scroll to
      // `target`. scrollHeight never reads below clientHeight, so measure
      // the content height from the spacer's own position instead.
      const scrollerTop = scroller.getBoundingClientRect().top + scroller.clientTop
      const contentBottom =
        spacer.getBoundingClientRect().bottom - scrollerTop + scroller.scrollTop
      const heightWithoutSpacer =
        contentBottom -
        spacer.offsetHeight +
        parseFloat(getComputedStyle(scroller).paddingBottom)
      const needed = scroller.clientHeight + target - heightWithoutSpacer
      spacer.style.height = `${Math.max(0, needed)}px`
    }
    scroller.scrollTop = target
  }, [dep])

  return { remember, spacerRef }
}
