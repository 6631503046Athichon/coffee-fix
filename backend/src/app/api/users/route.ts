import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'
import { hashPassword } from '@/lib/auth'

// GET /api/users - List all users
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Admin'])

    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        roles: true,
        isActive: true,
        isSuperAdmin: true,
        createdAt: true,
        lastLogin: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ users })
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/users - Create new user
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Admin'])

    const body = await request.json()
    const { username, email, password, name, roles, isActive } = body

    // Validation
    if (!username && !email) {
      return NextResponse.json(
        { error: 'Username or email is required' },
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
        username: username || null,
        email: email || null,
        password: hashedPassword,
        name,
        roles: roles || [],
        isActive: isActive !== undefined ? isActive : true,
        mustChangePassword: true,
      },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        roles: true,
        isActive: true,
        createdAt: true,
      },
    })

    return NextResponse.json(
      { user: newUser, message: 'User created successfully' },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}

