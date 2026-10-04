// The backend's passwordSchema (backend/src/lib/validations/user.ts), which
// reset-password and the other password-change routes enforce, so a form can
// say what is wrong before the request is sent.

export const PASSWORD_MIN_LENGTH = 8

/** The policy in one line, for hints next to a new-password field. */
export const PASSWORD_POLICY_HINT =
  'At least 8 characters, with an uppercase letter, a lowercase letter and a number.'

/** The first rule the password breaks, or null when it meets the policy. */
export const passwordPolicyProblem = (password: string): string | null => {
  if (password.length < PASSWORD_MIN_LENGTH) return 'Password must be at least 8 characters long'
  if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter'
  if (!/[a-z]/.test(password)) return 'Password must contain a lowercase letter'
  if (!/[0-9]/.test(password)) return 'Password must contain a number'
  return null
}
