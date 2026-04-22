import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'

// GET /api/process-types - List all process types
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)

    const where: Prisma.ProcessTypeWhereInput = {}
    
    // Filter by isActive if provided
    const isActive = request.nextUrl.searchParams.get('isActive')
    if (isActive !== null) {
      where.isActive = isActive === 'true'
    }

    const processTypes = await prisma.processType.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    // Parse colorScheme JSON
    const parsedProcessTypes = processTypes.map(pt => ({
      ...pt,
      colorScheme: typeof pt.colorScheme === 'string' ? JSON.parse(pt.colorScheme) : pt.colorScheme,
    }))

    return NextResponse.json({ processTypes: parsedProcessTypes })
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/process-types - Create new process type
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Admin'])

    const body = await request.json()
    const { name, description, colorScheme, isActive } = body

    // Validation
    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    if (!colorScheme || typeof colorScheme !== 'object') {
      return NextResponse.json(
        { error: 'Color scheme object is required' },
        { status: 400 }
      )
    }

    const processType = await prisma.processType.create({
      data: {
        name,
        description: description || null,
        colorScheme: JSON.stringify(colorScheme),
        isActive: isActive !== undefined ? isActive : true,
      },
    })

    return NextResponse.json(
      { 
        processType: {
          ...processType,
          colorScheme: typeof processType.colorScheme === 'string' ? JSON.parse(processType.colorScheme) : processType.colorScheme,
        },
        message: 'Process type created successfully' 
      },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}

