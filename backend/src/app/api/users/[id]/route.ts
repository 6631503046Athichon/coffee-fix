import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'
import { hashPassword } from '@/lib/auth'

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
    const { name, email, username, roles, isActive, password } = body

    // Non-admins can only update their own name
    if (isOwnProfile && !isAdmin) {
      const updateData: any = {}
      if (name) updateData.name = name
      if (email) updateData.email = email
      if (username) updateData.username = username

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
          { error: 'ไม่สามารถแก้ไขข้อมูล Super Admin ได้ ต้องใช้สิทธิ์ Super Admin' },
          { status: 403 }
        )
      }
      // Regular admin cannot modify other admins
      if (targetIsAdmin && currentUser.id !== id) {
        return NextResponse.json(
          { error: 'ไม่สามารถแก้ไขข้อมูล Admin คนอื่นได้ ต้องใช้สิทธิ์ Super Admin' },
          { status: 403 }
        )
      }
    }

    // Check for duplicate email/username before updating
    if (email !== undefined && email) {
      const existingUser = await prisma.user.findFirst({
        where: {
          email: email,
          id: { not: id }, // Exclude current user
        },
      })
      if (existingUser) {
        return NextResponse.json(
          { error: 'Email already exists' },
          { status: 409 }
        )
      }
    }

    if (username !== undefined && username) {
      const existingUser = await prisma.user.findFirst({
        where: {
          username: username,
          id: { not: id }, // Exclude current user
        },
      })
      if (existingUser) {
        return NextResponse.json(
          { error: 'Username already exists' },
          { status: 409 }
        )
      }
    }

    const updateData: any = {}
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
        { error: 'ไม่สามารถลบ Super Admin ได้' },
        { status: 403 }
      )
    }

    // Only Super Admin can delete other admins
    if (targetIsAdmin && !currentUser.isSuperAdmin) {
      return NextResponse.json(
        { error: 'ไม่สามารถลบ Admin คนอื่นได้ ต้องใช้สิทธิ์ Super Admin' },
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

