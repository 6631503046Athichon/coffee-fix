import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { hashPassword, generateToken } from '@/lib/auth'
import { handleApiError } from '@/lib/middleware'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, username, password, name, roles } = body

    // Validation
    if (!email && !username) {
      return NextResponse.json(
        { error: 'Email or username is required' },
        { status: 400 }
      )
    }

    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      )
    }

    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          email ? { email } : {},
          username ? { username } : {},
        ].filter(obj => Object.keys(obj).length > 0),
      },
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email or username already exists' },
        { status: 409 }
      )
    }

    // Hash password
    const hashedPassword = await hashPassword(password)

    // Create user
    const newUser = await prisma.user.create({
      data: {
        email: email || null,
        username: username || null,
        password: hashedPassword,
        name,
        roles: roles || [],
        isActive: true,
        mustChangePassword: false,
      },
    })

    // Generate token
    const token = generateToken({
      userId: newUser.id,
      email: newUser.email || undefined,
      username: newUser.username || undefined,
      roles: newUser.roles,
    })

    // Create response
    const response = NextResponse.json(
      {
        user: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          username: newUser.username,
          roles: newUser.roles,
          farmId: newUser.farmId,
          isActive: newUser.isActive,
          isSuperAdmin: newUser.isSuperAdmin,
          mustChangePassword: newUser.mustChangePassword,
          createdAt: newUser.createdAt,
          updatedAt: newUser.updatedAt,
        },
        token, // Include token in response for localStorage fallback
        message: 'Registration successful',
      },
      { status: 201 }
    )

    // Set HTTP-only cookie
    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    })

    return response
  } catch (error) {
    return handleApiError(error)
  }
}

