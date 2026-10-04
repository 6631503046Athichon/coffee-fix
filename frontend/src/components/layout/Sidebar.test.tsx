import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ClipboardList, Droplets, Flame, Lightbulb, Package, Receipt, Sprout, Users } from 'lucide-react'
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

// D8: multi-role accounts. The roaster focus above is for roaster accounts;
// it must not take away the pages a user's other roles give them.
describe('Sidebar for multi-role accounts', () => {
  const fullNav = [
    { name: 'Farmer Dashboard', href: '/farmer-dashboard', icon: Sprout, roles: [UserRole.Farmer, UserRole.Admin], section: 'farmer' },
    { name: 'Harvest Lots', href: '/harvest-lots', icon: Package, roles: [UserRole.Farmer, UserRole.Admin], section: 'farmer' },
    { name: 'Processor Workbench', href: '/processor', icon: Droplets, roles: [UserRole.Processor, UserRole.Admin], section: 'processor' },
    { name: 'Quality Insights', href: '/insights', icon: Lightbulb, roles: [UserRole.Processor], section: 'processor' },
    ...navItems,
  ]

  const renderFull = (roles: UserRole[]) =>
    render(
      <MemoryRouter>
        <Sidebar navItems={fullNav} currentUserRoles={roles} isMobileOpen={false} onMobileClose={() => {}} />
      </MemoryRouter>,
    )

  const links = () => screen.getAllByRole('link').map((link) => link.getAttribute('href'))

  it('a Farmer+Roaster keeps the farmer pages next to the roaster workspace', () => {
    renderFull([UserRole.Farmer, UserRole.Roaster])
    expect(links()).toEqual(['/farmer-dashboard', '/harvest-lots', '/roaster', '/roast-logbook', '/sales', '/customers'])
  })

  it('a Processor+Roaster keeps the processor pages, Quality Insights once, under Processor', () => {
    renderFull([UserRole.Processor, UserRole.Roaster])
    expect(links()).toEqual(['/processor', '/insights', '/roaster', '/roast-logbook', '/sales', '/customers'])
  })

  it('a roaster-only account still gets only the roaster workspace', () => {
    renderFull([UserRole.Roaster])
    expect(links()).toEqual(['/roaster', '/roast-logbook', '/sales', '/customers'])
  })

  it('a Farmer+Processor sees both sections', () => {
    renderFull([UserRole.Farmer, UserRole.Processor])
    expect(links()).toEqual(['/farmer-dashboard', '/harvest-lots', '/processor', '/insights'])
  })
})
