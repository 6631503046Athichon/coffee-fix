import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { INITIAL_APP_DATA } from '../../constants'
import { DataContext } from '../../hooks/useDataContext'
import { UserRole } from '../../types'
import type { User } from '../../types'
import TraceabilityHub from './TraceabilityHub'

// The sidebar and the route let a super admin in as an Admin whatever roles
// the account lists; the hub's own check sent them to the farmer dashboard.

let auth: { currentUser: User | null } = { currentUser: null }
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => auth }))

const renderHub = (user: User) => {
  auth = { currentUser: user }
  return render(
    <MemoryRouter initialEntries={['/traceability']}>
      <DataContext.Provider
        value={{ data: INITIAL_APP_DATA, setData: () => {}, refreshData: async () => {}, isEditing: false, setIsEditing: () => {} }}
      >
        <Routes>
          <Route path="/traceability" element={<TraceabilityHub />} />
          <Route path="/farmer-dashboard" element={<p>FARMER DASHBOARD</p>} />
        </Routes>
      </DataContext.Provider>
    </MemoryRouter>,
  )
}

describe('Traceability Hub access', () => {
  it.each([
    ['a super admin who only holds Farmer', { id: 'u-super', name: 'Owner', roles: [UserRole.Farmer], isSuperAdmin: true }],
    ['an Admin', { id: 'u-admin', name: 'Admin', roles: [UserRole.Admin] }],
    ['a Processor', { id: 'u-proc', name: 'Processor', roles: [UserRole.Processor] }],
  ])('lets %s stay on the hub', (_label, user) => {
    renderHub(user as User)
    expect(screen.getByRole('heading', { name: 'Traceability Curation Hub' })).toBeInTheDocument()
    expect(screen.queryByText('FARMER DASHBOARD')).not.toBeInTheDocument()
  })

  it('still sends a Farmer to their dashboard', () => {
    renderHub({ id: 'u-farmer', name: 'Farmer', roles: [UserRole.Farmer] })
    expect(screen.getByText('FARMER DASHBOARD')).toBeInTheDocument()
  })
})
