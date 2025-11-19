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

    // Get query parameters for filtering
    const searchParams = request.nextUrl.searchParams
    const search = searchParams.get('search')
    const role = searchParams.get('role')
    const status = searchParams.get('status')

    // Build where clause
    const where: any = {}

    // Search by name, email, or username
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } },
      ]
    }

    // Filter by role
    if (role) {
      where.roles = { has: role }
    }

    // Filter by active status
    if (status === 'active') {
      where.isActive = true
    } else if (status === 'inactive') {
      where.isActive = false
    }

    const users = await prisma.user.findMany({
      where,
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
        temporaryPassword: true,
        mustChangePassword: true,
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
    const { name, email, roles, isActive, autoGenerate = true } = body

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

    // Validate email if provided
    if (email) {
      const existingEmail = await prisma.user.findFirst({
        where: { email }
      })
      if (existingEmail) {
        return NextResponse.json(
          { error: 'Email already exists' },
          { status: 409 }
        )
      }
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

    // Create user with flags based on credential mode
    const newUser = await prisma.user.create({
      data: {
        username,
        email: email || null, // Use provided email or null
        password,
        name,
        roles: roles || [],
        isActive: isActive !== undefined ? isActive : true,
        // Only require changes for auto-generated credentials
        mustChangePassword: autoGenerate,
        mustChangeUsername: autoGenerate,
        mustChangeEmail: autoGenerate && !email, // Don't require email change if already provided
        temporaryPassword: plainPassword || null, // Store for admin view until user changes it
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

