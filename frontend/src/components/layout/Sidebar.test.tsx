import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ClipboardList, Droplets, Flame, Lightbulb, Package, Receipt, Sprout, Tag, Users } from 'lucide-react'
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
  it('shows a roaster-only account its workbench, logbook, sales, customers and Quality Insights', () => {
    renderSidebar([UserRole.Roaster])

    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Roaster Workbench',
      'Roast Logbook',
      'Sales',
      'Customer Management',
      'Quality Insights',
    ])
    // The /insights route lets a Roaster in, so the sidebar offers it.
    expect(screen.getByRole('link', { name: 'Quality Insights' })).toHaveAttribute('href', '/insights')
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
    expect(links()).toEqual(['/farmer-dashboard', '/harvest-lots', '/roaster', '/roast-logbook', '/sales', '/customers', '/insights'])
  })

  it('a Processor+Roaster keeps the processor pages, Quality Insights once, under Processor', () => {
    renderFull([UserRole.Processor, UserRole.Roaster])
    expect(links()).toEqual(['/processor', '/insights', '/roaster', '/roast-logbook', '/sales', '/customers'])
  })

  it('a roaster-only account still gets only the roaster workspace, Quality Insights under Roaster', () => {
    renderFull([UserRole.Roaster])
    expect(links()).toEqual(['/roaster', '/roast-logbook', '/sales', '/customers', '/insights'])
    expect(screen.getAllByRole('link', { name: 'Quality Insights' })).toHaveLength(1)
  })

  it('a Farmer+Processor sees both sections', () => {
    renderFull([UserRole.Farmer, UserRole.Processor])
    expect(links()).toEqual(['/farmer-dashboard', '/harvest-lots', '/processor', '/insights'])
  })
})

// Quality Insights is listed under Processor, Quality & Cupping (Admin) and
// Roaster, as in App's nav list: whatever the mix of roles, it shows once.
describe('Sidebar Quality Insights entry', () => {
  const insightsNav = [
    { name: 'Processor Workbench', href: '/processor', icon: Droplets, roles: [UserRole.Processor, UserRole.Admin], section: 'processor' },
    { name: 'Quality Insights', href: '/insights', icon: Lightbulb, roles: [UserRole.Processor], section: 'processor' },
    { name: 'Quality Insights', href: '/insights', icon: Lightbulb, roles: [UserRole.Admin], section: 'cupping' },
    ...navItems,
  ]

  const renderInsightsNav = (roles: UserRole[]) =>
    render(
      <MemoryRouter>
        <Sidebar navItems={insightsNav} currentUserRoles={roles} isMobileOpen={false} onMobileClose={() => {}} />
      </MemoryRouter>,
    )

  it.each([
    [[UserRole.Roaster]],
    [[UserRole.Processor]],
    [[UserRole.Processor, UserRole.Roaster]],
    [[UserRole.Admin]],
    [[UserRole.Admin, UserRole.Processor]],
    [[UserRole.Admin, UserRole.Roaster]],
  ])('shows it once for %j', (roles) => {
    renderInsightsNav(roles)
    expect(screen.getAllByRole('link', { name: 'Quality Insights' })).toHaveLength(1)
  })

  it('keeps it under Quality & Cupping for an admin', () => {
    renderInsightsNav([UserRole.Admin, UserRole.Roaster])
    const section = screen.getByText('Quality & Cupping').closest('div')!.parentElement!
    expect(section).toContainElement(screen.getByRole('link', { name: 'Quality Insights' }))
  })

  it('is not offered to a farmer', () => {
    renderInsightsNav([UserRole.Farmer])
    expect(screen.queryByRole('link', { name: 'Quality Insights' })).not.toBeInTheDocument()
  })
})

// A super admin counts as an Admin whatever roles the account lists, as the
// backend treats them: the Administration section must not disappear when
// the account does not also carry the Admin role.
describe('Sidebar for a super admin', () => {
  const adminNav = [
    { name: 'Farmer Dashboard', href: '/farmer-dashboard', icon: Sprout, roles: [UserRole.Farmer, UserRole.Admin], section: 'farmer' },
    { name: 'Processor Workbench', href: '/processor', icon: Droplets, roles: [UserRole.Processor, UserRole.Admin], section: 'processor' },
    ...navItems,
    { name: 'User Management', href: '/users', icon: Users, roles: [UserRole.Admin], section: 'admin' },
    { name: 'Activity Types', href: '/activity-types', icon: Tag, roles: [UserRole.Admin], section: 'admin' },
  ]

  const renderAdminNav = (roles: UserRole[], isSuperAdmin?: boolean) =>
    render(
      <MemoryRouter>
        <Sidebar
          navItems={adminNav}
          currentUserRoles={roles}
          isSuperAdmin={isSuperAdmin}
          isMobileOpen={false}
          onMobileClose={() => {}}
        />
      </MemoryRouter>,
    )

  it('shows the Administration pages to a super admin without the Admin role', () => {
    renderAdminNav([UserRole.Processor], true)
    expect(screen.getByText('Administration')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'User Management' })).toHaveAttribute('href', '/users')
    expect(screen.getByRole('link', { name: 'Activity Types' })).toBeInTheDocument()
    // and everything else an Admin sees
    expect(screen.getByRole('link', { name: 'Farmer Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sales' })).toBeInTheDocument()
  })

  it('does not narrow a super admin who also roasts to the roaster workspace', () => {
    renderAdminNav([UserRole.Roaster], true)
    expect(screen.getByRole('link', { name: 'User Management' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Processor Workbench' })).toBeInTheDocument()
  })

  it('still hides them from the same roles without super admin', () => {
    renderAdminNav([UserRole.Processor])
    expect(screen.queryByText('Administration')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'User Management' })).not.toBeInTheDocument()
  })
})
