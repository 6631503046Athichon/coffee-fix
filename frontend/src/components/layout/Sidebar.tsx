
import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { LucideIcon, Coffee, X, Menu, Sprout, Factory, FlaskConical, Flame, Shield } from 'lucide-react';
import { UserRole } from '../../types';

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  roles: UserRole[];
  badge?: number;
  section?: string;
}

interface NavSection {
  id: string;
  label: string;
  icon: LucideIcon;
  roles: UserRole[];
}

interface SidebarProps {
  navItems: NavItem[];
  currentUserRoles: UserRole[];
}

// Define section order and metadata
const SECTIONS: NavSection[] = [
  { id: 'farmer', label: 'Farmer', icon: Sprout, roles: [UserRole.Farmer, UserRole.Admin] },
  { id: 'processor', label: 'Processor', icon: Factory, roles: [UserRole.Processor, UserRole.Admin] },
  { id: 'cupping', label: 'Quality & Cupping', icon: FlaskConical, roles: [UserRole.Processor, UserRole.Roaster, UserRole.HeadJudge, UserRole.Cupper, UserRole.Admin] },
  { id: 'roaster', label: 'Roaster', icon: Flame, roles: [UserRole.Roaster, UserRole.Admin] },
  { id: 'admin', label: 'Administration', icon: Shield, roles: [UserRole.Admin, UserRole.Processor, UserRole.Roaster] },
];

const Sidebar: React.FC<SidebarProps> = ({ navItems, currentUserRoles }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Filter nav items: show if user has ANY of the required roles
  const filteredNavItems = navItems.filter(item =>
    item.roles.some(role => currentUserRoles.includes(role))
  );

  // Group items by section
  const groupedItems = SECTIONS.map(section => {
    const items = filteredNavItems.filter(item => item.section === section.id);
    const hasAccess = section.roles.some(role => currentUserRoles.includes(role));
    return { section, items, hasAccess };
  }).filter(group => group.items.length > 0 && group.hasAccess);

  // Close mobile menu when screen size changes
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
  }, [isMobileMenuOpen]);

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-3 bg-blue-600 rounded-lg shadow-sm hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-label="Toggle menu"
      >
        {isMobileMenuOpen ? (
          <X className="h-6 w-6 text-white" />
        ) : (
          <Menu className="h-6 w-6 text-white" />
        )}
      </button>

      {/* Backdrop overlay for mobile */}
      {isMobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        w-64 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col
        fixed lg:relative inset-y-0 left-0 z-40
        transform transition-transform duration-300 ease-in-out
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200">
          <div className="flex items-center flex-1">
            <Coffee className="h-8 w-8 text-blue-600" />
            <h1 className="ml-3 text-xl font-bold text-gray-900">Coffee Lab</h1>
          </div>
          {/* Close button for mobile - only inside sidebar */}
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="lg:hidden p-2 hover:bg-gray-100 rounded-lg transition-colors group focus:outline-none focus:ring-2 focus:ring-gray-400"
            aria-label="Close menu"
          >
            <X className="h-5 w-5 text-gray-500 group-hover:text-gray-900 transition-colors" />
          </button>
        </div>
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          {groupedItems.map((group, groupIndex) => (
            <div key={group.section.id} className={groupIndex > 0 ? 'mt-4' : ''}>
              {/* Section Header */}
              <div className="flex items-center gap-2 px-3 py-2 mb-1">
                <group.section.icon className="h-4 w-4 text-gray-400" />
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {group.section.label}
                </span>
                <div className="flex-1 h-px bg-gray-200 ml-2"></div>
              </div>

              {/* Section Items */}
              <div className="space-y-1">
                {group.items.map((item) => (
                  <NavLink
                    key={item.name}
                    to={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                        isActive
                          ? 'bg-blue-50 text-blue-600'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      }`
                    }
                  >
                    <div className="flex items-center">
                      <item.icon className="h-5 w-5 mr-3" />
                      <span>{item.name}</span>
                    </div>
                    {item.badge && item.badge > 0 && (
                      <span className="relative inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold leading-none text-white bg-red-600 rounded-full min-w-[20px]">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping"></span>
                        <span className="relative">{item.badge > 99 ? '99+' : item.badge}</span>
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
};

export default Sidebar;
