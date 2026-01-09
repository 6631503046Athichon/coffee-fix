import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAuth, handleApiError } from '@/lib/middleware'

// This route depends on auth cookies/headers, so it must be dynamic.
export const dynamic = 'force-dynamic'

export type NotificationType = 'FARM_REQUEST_PENDING' | 'FARM_REQUEST_REVIEWED'

export interface NotificationItem {
  id: string
  type: NotificationType
  title: string
  message: string
  createdAt: string
  // Optional: link for frontend routing
  href?: string
  // Optional extra context
  meta?: Record<string, any>
}

// GET /api/notifications
// Returns notifications derived from existing data (farm requests), no new DB tables required.
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)

    const isAdmin = user.roles.includes('Admin')

    const notifications: NotificationItem[] = []

    if (isAdmin) {
      // Admin: show pending farm requests (action needed)
      const pending = await prisma.farmRequest.findMany({
        where: { status: 'Pending' },
        include: {
          requester: {
            select: { id: true, name: true },
          },
        },
        orderBy: { requestDate: 'desc' },
        take: 20,
      })

      for (const fr of pending) {
        notifications.push({
          id: `farm-request:${fr.id}`,
          type: 'FARM_REQUEST_PENDING',
          title: 'Farm request pending approval',
          message: `${fr.requester?.name || 'A user'} requested farm: ${fr.farmName}`,
          createdAt: fr.requestDate.toISOString(),
          href: '/admin/farm-management',
          meta: {
            farmRequestId: fr.id,
            farmName: fr.farmName,
            requesterId: fr.requesterId,
            requesterName: fr.requester?.name || null,
          },
        })
      }
    } else {
      // Farmer (or non-admin): show updates on their own requests (approved/rejected)
      const mineReviewed = await prisma.farmRequest.findMany({
        where: {
          requesterId: user.id,
          status: { in: ['Approved', 'Rejected'] },
        },
        include: {
          reviewer: {
            select: { id: true, name: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      })

      for (const fr of mineReviewed) {
        const statusText = fr.status === 'Approved' ? 'approved' : 'rejected'
        notifications.push({
          id: `farm-request:${fr.id}`,
          type: 'FARM_REQUEST_REVIEWED',
          title: `Your farm request was ${statusText}`,
          message: `Farm: ${fr.farmName}${fr.reviewer?.name ? ` (reviewed by ${fr.reviewer.name})` : ''}`,
          createdAt: fr.updatedAt.toISOString(),
          href: '/farmer/farm-management',
          meta: {
            farmRequestId: fr.id,
            farmName: fr.farmName,
            status: fr.status,
            reviewerName: fr.reviewer?.name || null,
          },
        })
      }
    }

    // Sort latest first
    notifications.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))

    // NOTE: We don't persist "read" state yet. Frontend will maintain read state in localStorage.
    return NextResponse.json({
      notifications,
      unreadCount: notifications.length,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
