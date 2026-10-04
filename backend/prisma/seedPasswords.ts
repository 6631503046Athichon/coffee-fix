// Passwords for the accounts seed.ts creates. They come from the environment
// and never from the source: the repository is public, and the production
// database has these accounts, so a password written here would be one
// anybody can read. There is deliberately no built-in fallback - a missing
// variable stops the seed before it writes anything.
//
// Each role reads its own variable, or SEED_DEFAULT_PASSWORD when that is
// not set. See the comment block at the top of seed.ts.

export const SEED_PASSWORD_ROLES = [
  'Admin',
  'Farmer',
  'Processor',
  'Roaster',
  'HeadJudge',
  'Cupper',
] as const

export type SeedPasswordRole = (typeof SEED_PASSWORD_ROLES)[number]

export const SEED_DEFAULT_PASSWORD_VAR = 'SEED_DEFAULT_PASSWORD'

/** SEED_ADMIN_PASSWORD, SEED_HEADJUDGE_PASSWORD, ... */
export const seedPasswordVar = (role: SeedPasswordRole) =>
  `SEED_${role.toUpperCase()}_PASSWORD`

const present = (value: string | undefined): value is string =>
  typeof value === 'string' && value.trim() !== ''

/**
 * One password per role, read from `env`. Throws, naming every variable
 * that is missing, when a role has neither its own variable nor
 * SEED_DEFAULT_PASSWORD. Blank values count as missing.
 */
export function resolveSeedPasswords(
  env: Record<string, string | undefined> = process.env
): Record<SeedPasswordRole, string> {
  const fallback = env[SEED_DEFAULT_PASSWORD_VAR]
  const missing: string[] = []
  const passwords = {} as Record<SeedPasswordRole, string>

  for (const role of SEED_PASSWORD_ROLES) {
    const own = env[seedPasswordVar(role)]
    if (present(own)) {
      passwords[role] = own
    } else if (present(fallback)) {
      passwords[role] = fallback
    } else {
      missing.push(seedPasswordVar(role))
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Seed passwords are not set: ${missing.join(', ')}. ` +
        `Set ${SEED_DEFAULT_PASSWORD_VAR} (used for every role) or the per-role ` +
        'variables in the env file you pass to the seed, e.g. ' +
        'npx tsx --env-file=.env prisma/seed.ts. Nothing was written.'
    )
  }

  return passwords
}
