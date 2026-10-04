import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import {
  requireAuth,
  requireRole,
  handleApiError,
  forgetCachedAuth,
  refreshSessionCookie,
} from '@/lib/middleware'
import { hashPassword, verifyPassword } from '@/lib/auth'
import { isAdminUser } from '@/lib/saleOrders'
import { passwordSchema, updateUserSchema } from '@/lib/validations/user'

// PUT body: the profile fields, a new password, and the current password a
// user must give to change their own sign-in details. Usernames follow
// usernameSchema (letters, digits, _ and - only), so one can never hold '@'
// and match another user's email at sign-in.
const updateUserBodySchema = z.object({
  ...updateUserSchema.shape,
  password: passwordSchema.optional(),
  currentPassword: z.string().optional(),
})

// GET /api/users/:id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const currentUser = await requireAuth(request)

    // Users can view their own profile, admins can view any
    if (currentUser.id !== id && !isAdminUser(currentUser)) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        roles: true,
        isActive: true,
        isSuperAdmin: true,
        createdAt: true,
        updatedAt: true,
        lastLogin: true,
      },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ user })
  } catch (error) {
    return handleApiError(error)
  }
}

// PUT /api/users/:id
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const currentUser = await requireAuth(request)

    // Users can update their own profile (limited fields), admins can update any
    const isOwnProfile = currentUser.id === id
    const isAdmin = isAdminUser(currentUser)

    if (!isOwnProfile && !isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      body = null
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      )
    }

    const targetUser = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        email: true,
        roles: true,
        isSuperAdmin: true,
      },
    })

    if (!targetUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // The edit form sends the username and email back even when they are
    // unchanged. Accounts made before these rules may hold values the schema
    // now rejects, so an unchanged value is neither re-checked nor written.
    const fields = { ...(body as Record<string, unknown>) }
    if (fields.username === targetUser.username) delete fields.username
    if (fields.email === targetUser.email) delete fields.email

    const parsed = updateUserBodySchema.safeParse(fields)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
        { status: 400 }
      )
    }
    const { name, email, username, roles, isActive, password, currentPassword } = parsed.data

    // Duplicate email/username pre-flight check.
    //
    // Hoisted out of the admin branch so non-admins changing their own
    // email/username also get a clean 409 instead of a P2002 leaking
    // through `handleApiError`. We use `findUnique` on the unique columns
    // here (rather than the old `findFirst(... id: { not: id })`) so the
    // lookup hits the unique index — Postgres returns at most one row, and
    // we just compare `.id` to ignore the current user.
    if (typeof email === 'string' && email.length > 0) {
      const conflict = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      })
      if (conflict && conflict.id !== id) {
        return NextResponse.json(
          { error: 'Email already exists' },
          { status: 409 }
        )
      }
    }

    if (typeof username === 'string' && username.length > 0) {
      const conflict = await prisma.user.findUnique({
        where: { username },
        select: { id: true },
      })
      if (conflict && conflict.id !== id) {
        return NextResponse.json(
          { error: 'Username already exists' },
          { status: 409 }
        )
      }
    }

    // Non-admins editing their own profile can change name/email/username and
    // (optionally) their password — but ANY sensitive change (email,
    // username, password) requires re-proving the current password. This
    // blocks the classic "session-hijack → silently swap email then trigger
    // password reset" account-takeover chain.
    if (isOwnProfile && !isAdmin) {
      const wantsSensitiveChange =
        email !== undefined || username !== undefined || password !== undefined

      if (wantsSensitiveChange) {
        if (typeof currentPassword !== 'string' || currentPassword.length === 0) {
          return NextResponse.json(
            { error: 'Current password is required to change email, username, or password' },
            { status: 400 }
          )
        }
        const me = await prisma.user.findUnique({
          where: { id },
          select: { password: true },
        })
        if (!me) {
          return NextResponse.json(
            { error: 'User not found' },
            { status: 404 }
          )
        }
        const ok = await verifyPassword(currentPassword, me.password)
        if (!ok) {
          // 400, not 401: the client treats any 401 as an expired session.
          return NextResponse.json(
            { error: 'Current password is incorrect' },
            { status: 400 }
          )
        }
      }

      const updateData: Prisma.UserUpdateInput = {}
      if (name !== undefined) updateData.name = name
      if (email !== undefined) updateData.email = email
      if (username !== undefined) updateData.username = username
      if (password !== undefined) {
        updateData.password = await hashPassword(password)
        // Signs out every other session (requireAuth refuses tokens issued
        // before it); this one gets a fresh cookie below.
        updateData.passwordChangedAt = new Date()
      }

      const updatedUser = await prisma.user.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          username: true,
          email: true,
          name: true,
          roles: true,
          isActive: true,
          updatedAt: true,
        },
      })

      const response = NextResponse.json({ user: updatedUser })
      if (password === undefined) return response
      forgetCachedAuth(id)
      return refreshSessionCookie(response, updatedUser)
    }

    // Admin updates
    // Check admin hierarchy - only Super Admin can modify other admins
    const targetIsAdmin = targetUser.roles.includes('Admin')
    const targetIsSuperAdmin = targetUser.isSuperAdmin

    if (!currentUser.isSuperAdmin) {
      // Regular admin cannot modify Super Admin
      if (targetIsSuperAdmin) {
        return NextResponse.json(
          { error: 'Cannot modify the super admin account without super admin privileges' },
          { status: 403 }
        )
      }
      // Regular admin cannot modify other admins
      if (targetIsAdmin && currentUser.id !== id) {
        return NextResponse.json(
          { error: 'Cannot modify another admin account without super admin privileges' },
          { status: 403 }
        )
      }
    }

    const updateData: Prisma.UserUpdateInput = {}
    if (name !== undefined) updateData.name = name
    if (email !== undefined) updateData.email = email
    if (username !== undefined) updateData.username = username
    if (roles !== undefined) updateData.roles = roles
    if (isActive !== undefined) updateData.isActive = isActive
    if (password !== undefined) {
      updateData.password = await hashPassword(password)
      // A password an Admin sets for someone else is known to the Admin, so
      // that user must pick their own at next sign-in. An Admin changing
      // their own password chose it themselves: no setup step.
      if (currentUser.id !== id) updateData.mustChangePassword = true
      // SECURITY: Never store plaintext passwords
      // An Admin's reset signs the user out everywhere: requireAuth refuses
      // tokens issued before passwordChangedAt.
      updateData.passwordChangedAt = new Date()
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        roles: true,
        isActive: true,
        updatedAt: true,
      },
    })

    const response = NextResponse.json({ user: updatedUser })
    if (password === undefined) return response
    forgetCachedAuth(id)
    // An Admin who changed their own password keeps this session.
    return currentUser.id === id ? refreshSessionCookie(response, updatedUser) : response
  } catch (error) {
    return handleApiError(error)
  }
}

// DELETE /api/users/:id
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const currentUser = await requireAuth(request)
    requireRole(currentUser, ['Admin'])

    // Prevent deleting own account
    if (currentUser.id === id) {
      return NextResponse.json(
        { error: 'Cannot delete your own account' },
        { status: 400 }
      )
    }

    // Get target user to check their role/permissions
    const targetUser = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        roles: true,
        isSuperAdmin: true,
      },
    })

    if (!targetUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Check admin hierarchy for deletion
    const targetIsAdmin = targetUser.roles.includes('Admin')
    const targetIsSuperAdmin = targetUser.isSuperAdmin

    // Cannot delete Super Admin
    if (targetIsSuperAdmin) {
      return NextResponse.json(
        { error: 'Cannot delete the super admin account' },
        { status: 403 }
      )
    }

    // Only Super Admin can delete other admins
    if (targetIsAdmin && !currentUser.isSuperAdmin) {
      return NextResponse.json(
        { error: 'Cannot delete another admin account without super admin privileges' },
        { status: 403 }
      )
    }

    await prisma.user.delete({
      where: { id },
    })

    return NextResponse.json({ message: 'User deleted successfully' })
  } catch (error) {
    return handleApiError(error)
  }
}

