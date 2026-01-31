import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, handleApiError } from '@/lib/middleware'
import QRCode from 'qrcode'

export const dynamic = 'force-dynamic'

// GET /api/green-bean-lots/:id/qr?format=png|svg&size=200
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request)
    const { id } = await params

    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format') || 'png'
    const size = parseInt(searchParams.get('size') || '200', 10)

    // Validate size
    const validSize = Math.min(Math.max(size, 100), 1000)

    const lot = await prisma.greenBeanLot.findUnique({
      where: { id },
      select: { publicTraceId: true }
    })

    if (!lot) {
      return NextResponse.json(
        { error: 'Green bean lot not found' },
        { status: 404 }
      )
    }

    if (!lot.publicTraceId) {
      return NextResponse.json(
        { error: 'Public trace ID not generated yet. Please generate it first.' },
        { status: 400 }
      )
    }

    // Build public URL - use FRONTEND_URL for the public trace page
    const baseUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5173'
    const publicUrl = `${baseUrl}/trace/${lot.publicTraceId}`

    if (format === 'svg') {
      const svg = await QRCode.toString(publicUrl, {
        type: 'svg',
        margin: 1,
        width: validSize
      })
      return new NextResponse(svg, {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Content-Disposition': `inline; filename="qr-${lot.publicTraceId}.svg"`,
          'Cache-Control': 'public, max-age=3600'
        }
      })
    } else {
      const pngBuffer = await QRCode.toBuffer(publicUrl, {
        type: 'png',
        margin: 1,
        width: validSize
      })
      return new NextResponse(pngBuffer, {
        headers: {
          'Content-Type': 'image/png',
          'Content-Disposition': `inline; filename="qr-${lot.publicTraceId}.png"`,
          'Cache-Control': 'public, max-age=3600'
        }
      })
    }
  } catch (error) {
    return handleApiError(error)
  }
}
