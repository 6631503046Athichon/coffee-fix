import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'
import { hashPassword } from '@/lib/auth'
import { generateUsername, generatePassword } from '@/lib/credentialGenerator'

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
    const { name, roles, isActive, autoGenerate = true } = body

    // Validation
    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    if (!roles || roles.length === 0) {
      return NextResponse.json(
        { error: 'At least one role is required' },
        { status: 400 }
      )
    }

    // Auto-generate credentials based on first role
    let username: string
    let password: string
    let plainPassword: string | undefined

    if (autoGenerate) {
      // Generate username based on primary role
      const primaryRole = roles[0]
      username = await generateUsername(primaryRole, prisma)

      // Generate random password
      plainPassword = generatePassword(12)
      password = await hashPassword(plainPassword)
    } else {
      // Manual credentials (for backward compatibility)
      const { username: manualUsername, password: manualPassword } = body

      if (!manualUsername || !manualPassword) {
        return NextResponse.json(
          { error: 'Username and password are required when autoGenerate is false' },
          { status: 400 }
        )
      }

      username = manualUsername
      password = await hashPassword(manualPassword)
    }

    // Check if username already exists
    const existingUser = await prisma.user.findUnique({
      where: { username }
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'Username already exists' },
        { status: 409 }
      )
    }

    // Create user with flags requiring first login changes
    const newUser = await prisma.user.create({
      data: {
        username,
        email: null, // Will be set on first login
        password,
        name,
        roles: roles || [],
        isActive: isActive !== undefined ? isActive : true,
        mustChangePassword: true,
        mustChangeUsername: true,
        mustChangeEmail: true,
      },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        roles: true,
        isActive: true,
        isSuperAdmin: true,
        mustChangePassword: true,
        mustChangeUsername: true,
        mustChangeEmail: true,
        createdAt: true,
      },
    })

    // Return generated credentials to admin
    const response: any = {
      user: newUser,
      message: 'User created successfully'
    }

    if (autoGenerate && plainPassword) {
      response.credentials = {
        username,
        password: plainPassword,
        message: 'Save these credentials! User must change them on first login.'
      }
    }

    return NextResponse.json(response, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}

