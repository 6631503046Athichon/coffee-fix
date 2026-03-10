import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, handleApiError } from '@/lib/middleware'

export const dynamic = 'force-dynamic'

// GET /api/farms/:id/collaborators
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const user = await requireAuth(request)

    const farm = await prisma.farm.findUnique({ where: { id }, select: { ownerId: true } })
    if (!farm) {
      return NextResponse.json({ error: 'Farm not found' }, { status: 404 })
    }

    // Owner, collaborator, or admin can view collaborators
    const isAdmin = user.roles.includes('Admin')
    if (!isAdmin && farm.ownerId !== user.id) {
      const isMember = await prisma.farmCollaborator.findUnique({
        where: { farmId_userId: { farmId: id, userId: user.id } },
      })
      if (!isMember) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const collaborators = await prisma.farmCollaborator.findMany({
      where: { farmId: id },
      include: {
        user: { select: { id: true, name: true, email: true, roles: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({ collaborators })
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/farms/:id/collaborators - Add collaborator
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const user = await requireAuth(request)

    const farm = await prisma.farm.findUnique({ where: { id }, select: { ownerId: true } })
    if (!farm) {
      return NextResponse.json({ error: 'Farm not found' }, { status: 404 })
    }

    // Only owner or admin can add collaborators
    const isAdmin = user.roles.includes('Admin')
    if (!isAdmin && farm.ownerId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { userId, role } = body

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    // Can't add owner as collaborator
    if (userId === farm.ownerId) {
      return NextResponse.json({ error: 'Farm owner cannot be added as collaborator' }, { status: 400 })
    }

    // Check target user exists and is a Farmer
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, roles: true, isActive: true },
    })
    if (!targetUser || !targetUser.isActive) {
      return NextResponse.json({ error: 'User not found or inactive' }, { status: 404 })
    }

    const validRoles = ['Worker', 'Caretaker', 'Manager']
    const collaboratorRole = validRoles.includes(role) ? role : 'Worker'

    const collaborator = await prisma.farmCollaborator.upsert({
      where: { farmId_userId: { farmId: id, userId } },
      update: { role: collaboratorRole },
      create: { farmId: id, userId, role: collaboratorRole },
      include: {
        user: { select: { id: true, name: true, email: true, roles: true } },
      },
    })

    return NextResponse.json({ collaborator }, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}

// DELETE /api/farms/:id/collaborators - Remove collaborator
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const user = await requireAuth(request)

    const farm = await prisma.farm.findUnique({ where: { id }, select: { ownerId: true } })
    if (!farm) {
      return NextResponse.json({ error: 'Farm not found' }, { status: 404 })
    }

    // Only owner or admin can remove collaborators
    const isAdmin = user.roles.includes('Admin')
    if (!isAdmin && farm.ownerId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    if (!userId) {
      return NextResponse.json({ error: 'userId query param is required' }, { status: 400 })
    }

    await prisma.farmCollaborator.deleteMany({
      where: { farmId: id, userId },
    })

    return NextResponse.json({ message: 'Collaborator removed' })
  } catch (error) {
    return handleApiError(error)
  }
}
