/**
 * prisma/seed.ts used to hard-code the demo passwords (one per role) in a
 * public repository, for accounts that exist on production. They now come
 * from SEED_<ROLE>_PASSWORD or SEED_DEFAULT_PASSWORD, and a missing one stops
 * the seed with a message naming it - never a built-in fallback.
 */

import { describe, test, expect } from '@jest/globals'
import { readFileSync } from 'fs'
import path from 'path'
import {
  SEED_PASSWORD_ROLES,
  resolveSeedPasswords,
  seedPasswordVar,
} from '../prisma/seedPasswords'

const ALL_ROLE_VARS = [
  'SEED_ADMIN_PASSWORD',
  'SEED_FARMER_PASSWORD',
  'SEED_PROCESSOR_PASSWORD',
  'SEED_ROASTER_PASSWORD',
  'SEED_HEADJUDGE_PASSWORD',
  'SEED_CUPPER_PASSWORD',
]

describe('resolveSeedPasswords', () => {
  test('one variable per role, named SEED_<ROLE>_PASSWORD', () => {
    expect(SEED_PASSWORD_ROLES.map(seedPasswordVar)).toEqual(ALL_ROLE_VARS)
  })

  test('with nothing set it throws, naming every missing variable', () => {
    expect(() => resolveSeedPasswords({})).toThrow(/Seed passwords are not set/)
    try {
      resolveSeedPasswords({})
    } catch (error) {
      const message = (error as Error).message
      for (const name of ALL_ROLE_VARS) expect(message).toContain(name)
      expect(message).toContain('SEED_DEFAULT_PASSWORD')
    }
  })

  test('blank values count as missing', () => {
    expect(() =>
      resolveSeedPasswords({ SEED_DEFAULT_PASSWORD: '   ', SEED_ADMIN_PASSWORD: '' })
    ).toThrow(/SEED_ADMIN_PASSWORD/)
  })

  test('SEED_DEFAULT_PASSWORD covers every role', () => {
    const passwords = resolveSeedPasswords({ SEED_DEFAULT_PASSWORD: 'Dflt-pass-9' })
    for (const role of SEED_PASSWORD_ROLES) expect(passwords[role]).toBe('Dflt-pass-9')
  })

  test('a per-role variable overrides the default for that role only', () => {
    const passwords = resolveSeedPasswords({
      SEED_DEFAULT_PASSWORD: 'Dflt-pass-9',
      SEED_ADMIN_PASSWORD: 'Adm-pass-7',
      SEED_CUPPER_PASSWORD: 'Cup-pass-3',
    })
    expect(passwords.Admin).toBe('Adm-pass-7')
    expect(passwords.Cupper).toBe('Cup-pass-3')
    expect(passwords.Farmer).toBe('Dflt-pass-9')
    expect(passwords.HeadJudge).toBe('Dflt-pass-9')
  })

  test('per-role variables alone are enough when every role has one', () => {
    const env = Object.fromEntries(ALL_ROLE_VARS.map((name, i) => [name, `role-pass-${i}`]))
    const passwords = resolveSeedPasswords(env)
    expect(passwords.Processor).toBe('role-pass-2')
    expect(passwords.Roaster).toBe('role-pass-3')
  })

  test('without a default, only the roles left without a value are reported', () => {
    expect(() =>
      resolveSeedPasswords({ SEED_ADMIN_PASSWORD: 'Adm-pass-7', SEED_FARMER_PASSWORD: 'Frm-pass-1' })
    ).toThrow(
      'Seed passwords are not set: SEED_PROCESSOR_PASSWORD, SEED_ROASTER_PASSWORD, SEED_HEADJUDGE_PASSWORD, SEED_CUPPER_PASSWORD.'
    )
  })
})

describe('prisma/seed.ts', () => {
  const source = readFileSync(path.join(__dirname, '..', 'prisma', 'seed.ts'), 'utf8')

  test('hashes no string literal as a password', () => {
    expect(source).not.toMatch(/hashPassword\(\s*["'`]/)
  })

  test('no longer contains the old demo passwords', () => {
    expect(source).not.toMatch(/(admin|farmer|processor|roaster|headjudge|cupper)123/)
  })

  test('reads the passwords before its first database write', () => {
    const resolveAt = source.indexOf('resolveSeedPasswords()')
    const firstWrite = source.search(/prisma\.\w+\.(upsert|create|update)/)
    expect(resolveAt).toBeGreaterThan(-1)
    expect(resolveAt).toBeLessThan(firstWrite)
  })
})
