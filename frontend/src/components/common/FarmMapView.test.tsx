import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { vi } from 'vitest'
import type { Farm } from '../../types'
import FarmMapView from './FarmMapView'

// Leaflet is loaded from a CDN at runtime, so the tests install a minimal
// stand-in on window.L. Each marker gets a real DOM node for its popup and
// fills it the way Leaflet's Popup does: a string goes through innerHTML,
// an element is appended as-is.
const installFakeLeaflet = () => {
  const popups: HTMLElement[] = []
  const fill = (container: HTMLElement, content: unknown) => {
    if (typeof content === 'string') {
      container.innerHTML = content
    } else {
      container.replaceChildren(content as Node)
    }
  }
  const map = {
    setView: vi.fn(() => map),
    removeLayer: vi.fn(),
    fitBounds: vi.fn(),
    invalidateSize: vi.fn(),
    remove: vi.fn(),
  }
  window.L = {
    map: vi.fn(() => map),
    tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
    divIcon: vi.fn(() => ({})),
    featureGroup: function () {
      return { getBounds: () => ({ pad: () => ({}) }) }
    },
    marker: vi.fn(() => {
      const container = document.createElement('div')
      container.className = 'leaflet-popup-content'
      document.body.appendChild(container)
      popups.push(container)
      const marker = {
        addTo: () => marker,
        bindPopup: (content: unknown) => {
          fill(container, content)
          return marker
        },
        setPopupContent: (content: unknown) => {
          fill(container, content)
          return marker
        },
        setIcon: vi.fn(),
        on: vi.fn(),
      }
      return marker
    }),
  }
  return popups
}

const EditFarmPage = () => {
  const { id } = useParams()
  return <p>Edit farm {id}</p>
}

const renderMap = (farms: Farm[], selectedFarmId: string | null = null) => {
  const ui = (selected: string | null) => (
    <MemoryRouter initialEntries={['/farms']}>
      <Routes>
        <Route path="/farms" element={<FarmMapView farms={farms} selectedFarmId={selected} />} />
        <Route path="/farmer-farms/edit/:id" element={<EditFarmPage />} />
      </Routes>
    </MemoryRouter>
  )
  const result = render(ui(selectedFarmId))
  return { ...result, select: (id: string | null) => result.rerender(ui(id)) }
}

const hostileFarm: Farm = {
  id: 'farm-1',
  name: '<img src=x onerror="window.__farmXss=1">',
  location: '<img src=y onerror=alert(1)>Doi Chang',
  farmerName: 'Somchai',
  ownerName: '<script>window.__farmXss=1</script>Somchai',
  varieties: ['<b>Geisha</b>', 'Typica'],
  latitude: 19.8123,
  longitude: 99.5567,
}

const inlineHandlerAttributes = (root: HTMLElement) =>
  Array.from(root.querySelectorAll('*')).flatMap(el =>
    Array.from(el.attributes)
      .filter(attr => attr.name.toLowerCase().startsWith('on'))
      .map(attr => `${el.tagName.toLowerCase()}[${attr.name}]`)
  )

describe('FarmMapView popup', () => {
  let popups: HTMLElement[]

  beforeEach(() => {
    popups = installFakeLeaflet()
  })

  afterEach(() => {
    popups.forEach(popup => popup.remove())
    delete (window as { L?: unknown }).L
    delete (window as { __farmXss?: unknown }).__farmXss
  })

  const expectRenderedAsText = (popup: HTMLElement) => {
    expect(popup.querySelector('img, script, b')).toBeNull()
    expect(within(popup).getByRole('heading', { name: hostileFarm.name })).toBeInTheDocument()
    expect(popup.textContent).toContain(hostileFarm.location)
    expect(popup.textContent).toContain(hostileFarm.ownerName)
    expect(popup.textContent).toContain('<b>Geisha</b>, Typica')
    expect(popup.textContent).toContain('GPS: 19.8123, 99.5567')
    expect(inlineHandlerAttributes(popup)).toEqual([])
    expect((window as { __farmXss?: unknown }).__farmXss).toBeUndefined()
  }

  it('renders farm fields containing markup as plain text', () => {
    renderMap([hostileFarm])

    expect(popups).toHaveLength(1)
    expectRenderedAsText(popups[0])
  })

  it('keeps the popup escaped after the selection changes', () => {
    const { select } = renderMap([hostileFarm])

    select(hostileFarm.id)

    expect(popups).toHaveLength(1)
    expectRenderedAsText(popups[0])
  })

  it('opens the farm when the details button is clicked', () => {
    renderMap([hostileFarm])

    fireEvent.click(within(popups[0]).getByRole('button', { name: 'ดูรายละเอียด Farm' }))

    expect(screen.getByText('Edit farm farm-1')).toBeInTheDocument()
  })

  it('opens the right farm after the popup is rebuilt', () => {
    const second: Farm = { ...hostileFarm, id: 'farm-2', name: 'Second', latitude: 18.5, longitude: 98.9 }
    const { select } = renderMap([hostileFarm, second])

    select('farm-2')
    fireEvent.click(within(popups[1]).getByRole('button', { name: 'ดูรายละเอียด Farm' }))

    expect(screen.getByText('Edit farm farm-2')).toBeInTheDocument()
  })
})
