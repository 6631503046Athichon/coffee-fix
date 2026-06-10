import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'
import { hashPassword, verifyPassword } from '@/lib/auth'

// GET /api/users/:id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const currentUser = await requireAuth(request)

    // Users can view their own profile, admins can view any
    if (currentUser.id !== id && !currentUser.roles.includes('Admin')) {
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
    const isAdmin = currentUser.roles.includes('Admin')

    if (!isOwnProfile && !isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { name, email, username, roles, isActive, password, currentPassword } = body

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
          return NextResponse.json(
            { error: 'Current password is incorrect' },
            { status: 401 }
          )
        }
      }

      const updateData: Prisma.UserUpdateInput = {}
      if (name !== undefined) updateData.name = name
      if (email !== undefined) updateData.email = email
      if (username !== undefined) updateData.username = username
      if (password) {
        updateData.password = await hashPassword(password)
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

      return NextResponse.json({ user: updatedUser })
    }

    // Admin updates
    // First, get the target user to check their role/permissions
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
    if (password) {
      updateData.password = await hashPassword(password)
      updateData.mustChangePassword = true
      // SECURITY: Never store plaintext passwords
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

    return NextResponse.json({ user: updatedUser })
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

