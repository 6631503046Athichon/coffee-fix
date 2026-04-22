import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'

// GET /api/process-types/:id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request)
    const { id } = await params

    const processType = await prisma.processType.findUnique({
      where: { id },
    })

    if (!processType) {
      return NextResponse.json(
        { error: 'Process type not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      processType: {
        ...processType,
        colorScheme: typeof processType.colorScheme === 'string' 
          ? JSON.parse(processType.colorScheme) 
          : processType.colorScheme,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}

async function updateProcessType(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Admin'])
    const { id } = await params

    const body = await request.json()
    const { name, description, colorScheme, isActive } = body
    const existingProcessType = await prisma.processType.findUnique({
      where: { id },
      select: { id: true },
    })

    if (!existingProcessType) {
      return NextResponse.json(
        { error: 'Process type not found' },
        { status: 404 }
      )
    }

    const updateData: Prisma.ProcessTypeUpdateInput = {}
    if (name !== undefined) {
      const normalizedName = typeof name === 'string' ? name.trim() : ''
      if (!normalizedName) {
        return NextResponse.json(
          { error: 'Name cannot be empty' },
          { status: 400 }
        )
      }
      updateData.name = normalizedName
    }
    if (description !== undefined) {
      updateData.description = typeof description === 'string' ? description.trim() || null : null
    }
    if (colorScheme !== undefined) {
      if (!colorScheme || typeof colorScheme !== 'object') {
        return NextResponse.json(
          { error: 'Color scheme object is required' },
          { status: 400 }
        )
      }
      updateData.colorScheme = JSON.stringify(colorScheme)
    }
    if (isActive !== undefined) updateData.isActive = isActive

    const updatedProcessType = await prisma.processType.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({
      processType: {
        ...updatedProcessType,
        colorScheme: typeof updatedProcessType.colorScheme === 'string'
          ? JSON.parse(updatedProcessType.colorScheme)
          : updatedProcessType.colorScheme,
      },
    })
  } catch (error) {
    return handleApiError(error)
  }
}

// PUT /api/process-types/:id
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return updateProcessType(request, context)
}

// PATCH /api/process-types/:id
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return updateProcessType(request, context)
}

// DELETE /api/process-types/:id
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Admin'])
    const { id } = await params

    await prisma.processType.delete({
      where: { id },
    })

    return NextResponse.json({ message: 'Process type deleted successfully' })
  } catch (error) {
    return handleApiError(error)
  }
}
