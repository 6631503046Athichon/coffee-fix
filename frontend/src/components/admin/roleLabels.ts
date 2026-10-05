import { UserRole } from '../../types'

/**
 * What each role is called on screen. Filters, chips and checkboxes show
 * these; the values sent to the API stay the enum values ("HeadJudge").
 */
export const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.Farmer]: 'Farmer',
  [UserRole.Processor]: 'Processor',
  [UserRole.Roaster]: 'Roaster',
  [UserRole.HeadJudge]: 'Head Judge',
  [UserRole.Cupper]: 'Cupper',
  [UserRole.Admin]: 'Admin',
}

/** The on-screen name of a role; an unknown value is shown as it is. */
export const roleLabel = (role: string): string => ROLE_LABELS[role as UserRole] ?? role
