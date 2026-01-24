import { NextRequest, NextResponse } from 'next/server'
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

// PUT /api/process-types/:id
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Admin'])
    const { id } = await params

    const body = await request.json()
    const { name, description, colorScheme, isActive } = body

    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (colorScheme !== undefined) {
      if (typeof colorScheme === 'object') {
        updateData.colorScheme = JSON.stringify(colorScheme)
      } else {
        updateData.colorScheme = colorScheme
      }
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
