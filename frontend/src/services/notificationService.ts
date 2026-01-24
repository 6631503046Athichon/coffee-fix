import { api } from './api'
import { handleApiErrorWithFallback } from '../utils/errorHandler'

// This type must match the backend's NotificationItem export
export type NotificationType = 'FARM_REQUEST_PENDING' | 'FARM_REQUEST_REVIEWED'

export interface NotificationItem {
  id: string
  type: NotificationType
  title: string
  message: string
  createdAt: string
  href?: string
  meta?: Record<string, any>
}

// The response from our service will include the client-side calculated unreadCount
export interface NotificationsResponse {
  notifications: NotificationItem[]
  unreadCount: number
}

const READ_KEY_PREFIX = 'coffee_lab_notifications_read:'

function getReadSet(userId: string): Set<string> {
  if (!userId) return new Set<string>()
  try {
    const raw = localStorage.getItem(`${READ_KEY_PREFIX}${userId}`)
    if (!raw) return new Set<string>()
    const arr = JSON.parse(raw)
    return new Set<string>(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set<string>()
  }
}

function saveReadSet(userId: string, set: Set<string>) {
  if (!userId) return
  localStorage.setItem(`${READ_KEY_PREFIX}${userId}`, JSON.stringify([...set]))
}

/**
 * Fetches notifications from the backend and calculates the unread count
 * based on the read status stored in localStorage.
 */
export async function fetchNotifications(userId: string): Promise<NotificationsResponse> {
  try {
    // The backend returns all relevant notifications; client determines what's 'unread'.
    const response = await api.get<{ notifications: NotificationItem[] }>('/notifications')

    const readSet = getReadSet(userId)

    const unreadCount = response.notifications.filter(n => !readSet.has(n.id)).length

    return {
      notifications: response.notifications,
      unreadCount,
    }
  } catch (error) {
    return handleApiErrorWithFallback<NotificationsResponse>(error, {
      operation: 'fetch notifications',
      fallbackValue: { notifications: [], unreadCount: 0 },
    })
  }
}

/**
 * Marks a single notification as read in localStorage.
 */
export function markNotificationRead(userId: string, notificationId: string) {
  const set = getReadSet(userId)
  set.add(notificationId)
  saveReadSet(userId, set)
}

/**
 * Marks all provided notifications as read in localStorage.
 */
export function markAllNotificationsRead(userId: string, notifications: NotificationItem[]) {
  const set = getReadSet(userId)
  notifications.forEach(n => set.add(n.id))
  saveReadSet(userId, set)
}
