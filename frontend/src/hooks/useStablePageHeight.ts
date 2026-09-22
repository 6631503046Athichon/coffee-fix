import { useLayoutEffect, useRef } from 'react'

/**
 * Stops a paged list from shrinking on a short last page.
 *
 * When the list gets shorter, the page scroller (the app's `<main>`) clamps
 * `scrollTop` and the screen jumps upwards. Holding the height of a full page
 * keeps the scroller's height unchanged while paging.
 *
 * The content height is read from the last item's position, never by clearing
 * `min-height` first: clearing it shrinks the page for one forced layout, and
 * that alone is enough for the browser to clamp the scroll position.
 *
 * Page 1 is always a full page, so the reserved height is taken from it. A
 * resize can change the number of columns, which makes a remembered height
 * wrong, so resizing re-measures from whatever page is showing.
 *
 * Usage: put the returned ref on the element that directly wraps the items.
 */
export function useStablePageHeight<T extends HTMLElement>(
  currentPage: number,
  totalPages: number,
  itemCount: number,
) {
  const ref = useRef<T>(null)
  const fullPageHeight = useRef(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const apply = (remeasure: boolean) => {
      if (totalPages <= 1) {
        fullPageHeight.current = 0
        el.style.minHeight = ''
        return
      }
      const last = el.lastElementChild
      const content = last
        ? last.getBoundingClientRect().bottom - el.getBoundingClientRect().top
        : 0
      fullPageHeight.current =
        remeasure || currentPage === 1 ? content : Math.max(fullPageHeight.current, content)
      el.style.minHeight = `${Math.ceil(fullPageHeight.current)}px`
    }

    apply(false)
    const onResize = () => apply(true)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [currentPage, totalPages, itemCount])

  return ref
}
