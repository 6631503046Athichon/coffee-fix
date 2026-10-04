import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * GET /api/health
 * Lightweight health check - tests database connectivity.
 * No authentication required (for monitoring/load balancer probes).
 */
export async function GET() {
  const start = Date.now()

  try {
    await prisma.$queryRaw`SELECT 1`
    const latencyMs = Date.now() - start

    return NextResponse.json({
      status: 'ok',
      database: 'connected',
      latencyMs,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    const latencyMs = Date.now() - start
    // The reason stays in the server log. Anyone can call this route, and the
    // driver's text can name the database host, user or pool (audit F28).
    console.error('[Health Check] Database unreachable:', error instanceof Error ? error.message : error)

    return NextResponse.json(
      {
        status: 'degraded',
        database: 'disconnected',
        latencyMs,
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    )
  }
}
