import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'

/**
 * Generate a unique username based on role
 * Format: {role_lowercase}_{number}
 * Example: farmer_001, admin_012
 */
export async function generateUsername(
  role: string,
  db: PrismaClient
): Promise<string> {
  const rolePrefix = role.toLowerCase()

  // Find all existing usernames with this role prefix
  const existingUsers = await db.user.findMany({
    where: {
      username: {
        startsWith: `${rolePrefix}_`
      }
    },
    select: {
      username: true
    },
    orderBy: {
      username: 'desc'
    }
  })

  // Extract numbers and find the highest
  let maxNumber = 0
  for (const user of existingUsers) {
    if (user.username) {
      const match = user.username.match(new RegExp(`^${rolePrefix}_(\\d+)$`))
      if (match) {
        const num = parseInt(match[1], 10)
        if (num > maxNumber) {
          maxNumber = num
        }
      }
    }
  }

  // Generate next username
  const nextNumber = maxNumber + 1
  const paddedNumber = nextNumber.toString().padStart(3, '0')
  return `${rolePrefix}_${paddedNumber}`
}

/**
 * Generate a cryptographically secure random password
 * Default length: 12 characters
 * Contains: uppercase, lowercase, numbers, and special characters
 */
export function generatePassword(length: number = 12): string {
  // Define character sets
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const lowercase = 'abcdefghijklmnopqrstuvwxyz'
  const numbers = '0123456789'
  const specials = '!@#$%^&*'

  const allChars = uppercase + lowercase + numbers + specials

  // Ensure at least one character from each set
  let password = ''
  password += uppercase[crypto.randomInt(0, uppercase.length)]
  password += lowercase[crypto.randomInt(0, lowercase.length)]
  password += numbers[crypto.randomInt(0, numbers.length)]
  password += specials[crypto.randomInt(0, specials.length)]

  // Fill the rest with random characters
  for (let i = password.length; i < length; i++) {
    password += allChars[crypto.randomInt(0, allChars.length)]
  }

  // Shuffle the password to avoid predictable pattern
  return password
    .split('')
    .sort(() => crypto.randomInt(0, 3) - 1)
    .join('')
}
