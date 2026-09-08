import { UserRole } from '../types'

/**
 * Resolve the default dashboard route for a user based on their roles.
 * Order matters — earlier roles win when a user has multiple roles.
 *
 * Roles are compared case-insensitively and trimmed: they arrive from the
 * backend as plain strings, not as `UserRole` members, so a stray casing
 * difference used to drop a user onto the farmer dashboard.
 */
export const getDashboardPathByRole = (roles: UserRole[]): string => {
  const normalized = roles.map((role) => String(role).trim().toLowerCase())
  const has = (role: UserRole) => normalized.includes(role.toLowerCase())

  if (has(UserRole.Processor)) return '/processor'
  if (has(UserRole.Roaster)) return '/roaster'
  if (has(UserRole.Cupper) || has(UserRole.HeadJudge)) return '/cupping'
  if (has(UserRole.Farmer) || has(UserRole.Admin)) return '/farmer-dashboard'
  return '/farmer-dashboard'
}
