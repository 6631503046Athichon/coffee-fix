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
    console.error('[Health Check] Database unreachable:', error instanceof Error ? error.message : error)

    return NextResponse.json(
      {
        status: 'degraded',
        database: 'disconnected',
        latencyMs,
        error: error instanceof Error ? error.message.substring(0, 200) : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    )
  }
}
