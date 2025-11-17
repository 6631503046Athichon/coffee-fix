import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { UserRole } from '@prisma/client'

/**
 * POST /api/users/transfer-ownership
 * Transfer super admin ownership to another admin user
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const token = request.cookies.get('token')?.value || request.headers.get('authorization')?.replace('Bearer ', '')

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const decoded = verifyToken(token)
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Get current user
    const currentUser = await prisma.user.findUnique({
      where: { id: decoded.userId }
    })

    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Verify current user is super admin
    if (!currentUser.isSuperAdmin) {
      return NextResponse.json(
        { error: 'Only super admin can transfer ownership' },
        { status: 403 }
      )
    }

    // Get target user ID from request
    const { targetUserId } = await request.json()

    if (!targetUserId) {
      return NextResponse.json(
        { error: 'Target user ID is required' },
        { status: 400 }
      )
    }

    // Cannot transfer to self
    if (targetUserId === currentUser.id) {
      return NextResponse.json(
        { error: 'Cannot transfer ownership to yourself' },
        { status: 400 }
      )
    }

    // Get target user
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId }
    })

    if (!targetUser) {
      return NextResponse.json(
        { error: 'Target user not found' },
        { status: 404 }
      )
    }

    // Verify target user is active
    if (!targetUser.isActive) {
      return NextResponse.json(
        { error: 'Cannot transfer ownership to inactive user' },
        { status: 400 }
      )
    }

    // Verify target user is an admin
    if (!targetUser.roles.includes(UserRole.Admin)) {
      return NextResponse.json(
        { error: 'Target user must be an Admin' },
        { status: 400 }
      )
    }

    // Perform transfer in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Remove super admin from current user
      await tx.user.update({
        where: { id: currentUser.id },
        data: {
          isSuperAdmin: false
        }
      })

      // Make target user super admin
      const newSuperAdmin = await tx.user.update({
        where: { id: targetUserId },
        data: {
          isSuperAdmin: true
        }
      })

      return newSuperAdmin
    })

    return NextResponse.json({
      message: 'Ownership transferred successfully',
      newSuperAdmin: {
        id: result.id,
        name: result.name,
        username: result.username,
        email: result.email
      }
    })

  } catch (error) {
    console.error('Transfer ownership error:', error)
    return NextResponse.json(
      { error: 'Failed to transfer ownership' },
      { status: 500 }
    )
  }
}
