import { UserRole } from '../types'

/**
 * Resolve the default dashboard route for a user based on their roles.
 * Order matters — earlier roles win when a user has multiple roles.
 */
export const getDashboardPathByRole = (roles: UserRole[]): string => {
  if (roles.includes(UserRole.Processor)) return '/processor'
  if (roles.includes(UserRole.Roaster)) return '/roaster'
  if (roles.includes(UserRole.Cupper) || roles.includes(UserRole.HeadJudge)) return '/cupping'
  if (roles.includes(UserRole.Farmer) || roles.includes(UserRole.Admin)) return '/farmer-dashboard'
  return '/farmer-dashboard'
}
