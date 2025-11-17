import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import bcrypt from 'bcryptjs'

/**
 * POST /api/auth/first-login-update
 * Update user credentials on first login
 * Allows changing username, email, and password
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

    // Get update data from request
    const { currentPassword, newUsername, newEmail, newPassword } = await request.json()

    // Verify current password
    if (!currentPassword) {
      return NextResponse.json(
        { error: 'Current password is required' },
        { status: 400 }
      )
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, currentUser.password)
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Current password is incorrect' },
        { status: 401 }
      )
    }

    // Prepare update data
    const updateData: any = {
      updatedAt: new Date()
    }

    // Update username if provided and required
    if (currentUser.mustChangeUsername && newUsername) {
      // Check if username already exists
      const existingUsername = await prisma.user.findUnique({
        where: { username: newUsername }
      })

      if (existingUsername && existingUsername.id !== currentUser.id) {
        return NextResponse.json(
          { error: 'Username already taken' },
          { status: 400 }
        )
      }

      updateData.username = newUsername
      updateData.mustChangeUsername = false
    }

    // Update email if provided and required
    if (currentUser.mustChangeEmail && newEmail) {
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(newEmail)) {
        return NextResponse.json(
          { error: 'Invalid email format' },
          { status: 400 }
        )
      }

      // Check if email already exists
      const existingEmail = await prisma.user.findUnique({
        where: { email: newEmail }
      })

      if (existingEmail && existingEmail.id !== currentUser.id) {
        return NextResponse.json(
          { error: 'Email already taken' },
          { status: 400 }
        )
      }

      updateData.email = newEmail
      updateData.mustChangeEmail = false
    }

    // Update password if provided and required
    if (currentUser.mustChangePassword && newPassword) {
      // Validate password strength
      if (newPassword.length < 8) {
        return NextResponse.json(
          { error: 'Password must be at least 8 characters long' },
          { status: 400 }
        )
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10)
      updateData.password = hashedPassword
      updateData.mustChangePassword = false
    }

    // Ensure all required changes are made
    if (currentUser.mustChangeUsername && !newUsername) {
      return NextResponse.json(
        { error: 'Username change is required' },
        { status: 400 }
      )
    }

    if (currentUser.mustChangeEmail && !newEmail) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    if (currentUser.mustChangePassword && !newPassword) {
      return NextResponse.json(
        { error: 'Password change is required' },
        { status: 400 }
      )
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: currentUser.id },
      data: updateData
    })

    return NextResponse.json({
      message: 'Profile updated successfully',
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        username: updatedUser.username,
        roles: updatedUser.roles,
        farmId: updatedUser.farmId,
        isActive: updatedUser.isActive,
        isSuperAdmin: updatedUser.isSuperAdmin,
        mustChangePassword: updatedUser.mustChangePassword,
        mustChangeUsername: updatedUser.mustChangeUsername,
        mustChangeEmail: updatedUser.mustChangeEmail,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
      }
    })

  } catch (error) {
    console.error('First login update error:', error)
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    )
  }
}
