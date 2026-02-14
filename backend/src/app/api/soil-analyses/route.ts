import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, requireRole, handleApiError } from '@/lib/middleware'

// GET /api/soil-analyses - List all soil analyses
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)

    const where: any = {}
    
    // Filter by farmId if provided
    const farmId = request.nextUrl.searchParams.get('farmId')
    if (farmId) {
      where.farmId = farmId
    }

    // Farmers can only see their own farms' soil analyses
    if (user.roles.includes('Farmer') && !user.roles.includes('Admin')) {
      const farms = await prisma.farm.findMany({
        where: { ownerId: user.id },
        select: { id: true },
      })
      where.farmId = { in: farms.map(f => f.id) }
    }

    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '100', 10), 200)

    const soilAnalyses = await prisma.soilAnalysis.findMany({
      where,
      take: limit,
      include: {
        farm: {
          select: {
            id: true,
            farmName: true,
            location: true,
          },
        },
        createdByUser: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { testDate: 'desc' },
    })

    return NextResponse.json({ soilAnalyses })
  } catch (error) {
    return handleApiError(error)
  }
}

// POST /api/soil-analyses - Create new soil analysis
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    requireRole(user, ['Farmer', 'Processor', 'Admin'])

    const body = await request.json()
    const {
      farmId,
      farmPlotLocation,
      testDate,
      labName,
      certificateNumber,
      pH,
      phosphorus,
      potassium,
      nitrogen,
      calcium,
      magnesium,
      organicMatter,
      sulfur,
      zinc,
      iron,
      manganese,
      copper,
      boron,
      notes,
      recommendations,
      attachmentUrl,
      createdByRole,
    } = body

    // Validation
    if (!farmId || !farmPlotLocation || !testDate || pH === undefined || 
        phosphorus === undefined || potassium === undefined || 
        nitrogen === undefined || calcium === undefined || magnesium === undefined) {
      return NextResponse.json(
        { error: 'Farm ID, farm plot location, test date, and all core nutrients (pH, P, K, N, Ca, Mg) are required' },
        { status: 400 }
      )
    }

    const soilAnalysis = await prisma.soilAnalysis.create({
      data: {
        farmId,
        farmPlotLocation,
        testDate: new Date(testDate),
        labName: labName || null,
        certificateNumber: certificateNumber || null,
        pH: parseFloat(pH),
        phosphorus: parseFloat(phosphorus),
        potassium: parseFloat(potassium),
        nitrogen: parseFloat(nitrogen),
        calcium: parseFloat(calcium),
        magnesium: parseFloat(magnesium),
        organicMatter: organicMatter ? parseFloat(organicMatter) : null,
        sulfur: sulfur ? parseFloat(sulfur) : null,
        zinc: zinc ? parseFloat(zinc) : null,
        iron: iron ? parseFloat(iron) : null,
        manganese: manganese ? parseFloat(manganese) : null,
        copper: copper ? parseFloat(copper) : null,
        boron: boron ? parseFloat(boron) : null,
        notes: notes || null,
        recommendations: recommendations || null,
        createdBy: user.id,
        createdByRole: createdByRole || user.roles[0] || 'Farmer',
        attachmentUrl: attachmentUrl || null,
      },
      include: {
        farm: {
          select: {
            id: true,
            farmName: true,
            location: true,
          },
        },
        createdByUser: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    return NextResponse.json(
      { soilAnalysis, message: 'Soil analysis created successfully' },
      { status: 201 }
    )
  } catch (error) {
    return handleApiError(error)
  }
}

