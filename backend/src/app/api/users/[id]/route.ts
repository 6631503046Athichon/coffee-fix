import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'
import { hashPassword } from '@/lib/auth'

// GET /api/users/:id
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const currentUser = await requireAuth(request)
    
    // Users can view their own profile, admins can view any
    if (currentUser.id !== params.id && !currentUser.roles.includes('Admin')) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    const user = await prisma.user.findUnique({
      where: { id: params.id },
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
  { params }: { params: { id: string } }
) {
  try {
    const currentUser = await requireAuth(request)
    
    // Users can update their own profile (limited fields), admins can update any
    const isOwnProfile = currentUser.id === params.id
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
        where: { id: params.id },
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
    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (email !== undefined) updateData.email = email
    if (username !== undefined) updateData.username = username
    if (roles !== undefined) updateData.roles = roles
    if (isActive !== undefined) updateData.isActive = isActive
    if (password) {
      updateData.password = await hashPassword(password)
      updateData.mustChangePassword = true
      updateData.temporaryPassword = password // Store for admin view until user changes it
    }

    const updatedUser = await prisma.user.update({
      where: { id: params.id },
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
  { params }: { params: { id: string } }
) {
  try {
    const currentUser = await requireAuth(request)
    requireRole(currentUser, ['Admin'])

    // Prevent deleting own account
    if (currentUser.id === params.id) {
      return NextResponse.json(
        { error: 'Cannot delete your own account' },
        { status: 400 }
      )
    }

    await prisma.user.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ message: 'User deleted successfully' })
  } catch (error) {
    return handleApiError(error)
  }
}

