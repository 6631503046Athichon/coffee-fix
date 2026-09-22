import { useLayoutEffect, useRef } from 'react'

/** Height of the items themselves, read without disturbing the min-height already set. */
const contentHeight = (el: HTMLElement) => {
  const last = el.lastElementChild
  return last ? last.getBoundingClientRect().bottom - el.getBoundingClientRect().top : 0
}

/**
 * Height a full page would take, worked out from the rows on screen: how many
 * columns the grid has, how far apart two rows sit, and how many rows a full
 * page would add.
 */
const estimateFullPage = (el: HTMLElement, content: number, pageSize?: number) => {
  const items = Array.from(el.children) as HTMLElement[]
  if (!pageSize || items.length === 0 || items.length >= pageSize) return content

  const firstTop = items[0].offsetTop
  const columns = items.filter((item) => item.offsetTop === firstTop).length || 1
  const rowsShown = Math.ceil(items.length / columns)
  const rowsFull = Math.ceil(pageSize / columns)
  if (rowsFull <= rowsShown) return content

  const rowStride =
    rowsShown > 1 && items[columns]
      ? items[columns].offsetTop - items[0].offsetTop
      : items[0].offsetHeight + (parseFloat(window.getComputedStyle(el).rowGap) || 0)
  return content + (rowsFull - rowsShown) * rowStride
}

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
 * Only the last page can be short, so any other page is measured as a full one.
 * Landing straight on the last page leaves nothing to remember, which happens
 * whenever a tab switch remounts the list on the page it was left on, so the
 * full height is estimated from the rows that are showing.
 *
 * A resize can change the number of columns, which makes a remembered height
 * wrong, so resizing re-measures from whatever page is showing.
 *
 * Usage: put the returned ref on the element that directly wraps the items.
 */
export function useStablePageHeight<T extends HTMLElement>(
  currentPage: number,
  totalPages: number,
  itemCount: number,
  /** Items on a full page. Without it a short page cannot be extrapolated. */
  pageSize?: number,
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
      if (remeasure) fullPageHeight.current = 0

      const content = contentHeight(el)
      const reserved =
        currentPage < totalPages
          ? content
          : fullPageHeight.current > 0
            ? Math.max(fullPageHeight.current, content)
            : Math.max(content, estimateFullPage(el, content, pageSize))

      fullPageHeight.current = reserved
      el.style.minHeight = `${Math.ceil(reserved)}px`
    }

    apply(false)
    const onResize = () => apply(true)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [currentPage, totalPages, itemCount, pageSize])

  return ref
}

/**
 * Keeps a box from getting shorter when its content is swapped, such as tab
 * panels holding cards of different heights. Without it the page shrinks, the
 * scroller clamps `scrollTop` and the view jumps upwards on every switch.
 *
 * The floor is the tallest content seen so far and never goes below `floorPx`.
 * A resize can change the column count, so it re-measures from what is showing.
 */
export function useHeightFloor<T extends HTMLElement>(floorPx: number, deps: unknown[]) {
  const ref = useRef<T>(null)
  const tallest = useRef(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const apply = (remeasure: boolean) => {
      const content = contentHeight(el)
      tallest.current = remeasure ? content : Math.max(tallest.current, content)
      el.style.minHeight = `${Math.ceil(Math.max(floorPx, tallest.current))}px`
    }

    apply(false)
    const onResize = () => apply(true)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floorPx, ...deps])

  return ref
}
