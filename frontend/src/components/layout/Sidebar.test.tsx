import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ClipboardList, Flame, Lightbulb, Receipt, Users } from 'lucide-react'
import { UserRole } from '../../types'
import Sidebar from './Sidebar'

// The roaster part of App's nav list.
const navItems = [
  { name: 'Roaster Workbench', href: '/roaster', icon: Flame, roles: [UserRole.Roaster, UserRole.Admin], section: 'roaster' },
  { name: 'Roast Logbook', href: '/roast-logbook', icon: ClipboardList, roles: [UserRole.Roaster, UserRole.Admin], section: 'roaster' },
  { name: 'Sales', href: '/sales', icon: Receipt, roles: [UserRole.Roaster, UserRole.Admin], section: 'roaster' },
  { name: 'Customer Management', href: '/customers', icon: Users, roles: [UserRole.Admin, UserRole.Roaster], section: 'roaster' },
  { name: 'Quality Insights', href: '/insights', icon: Lightbulb, roles: [UserRole.Roaster], section: 'roaster' },
]

const renderSidebar = (roles: UserRole[]) =>
  render(
    <MemoryRouter>
      <Sidebar navItems={navItems} currentUserRoles={roles} isMobileOpen={false} onMobileClose={() => {}} />
    </MemoryRouter>,
  )

describe('Sidebar', () => {
  it('shows a roaster-only account its workbench, logbook, sales and customers', () => {
    renderSidebar([UserRole.Roaster])

    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Roaster Workbench',
      'Roast Logbook',
      'Sales',
      'Customer Management',
    ])
    expect(screen.queryByRole('link', { name: 'Quality Insights' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sales' })).toHaveAttribute('href', '/sales')
  })

  it('does not narrow the list for an admin', () => {
    renderSidebar([UserRole.Admin])
    expect(screen.getByRole('link', { name: 'Sales' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Customer Management' })).toBeInTheDocument()
  })
})
