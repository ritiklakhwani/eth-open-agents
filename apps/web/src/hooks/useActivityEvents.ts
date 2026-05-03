'use client'

// useActivityEvents — opens a socket.io connection to the Hub, joins the
// 'world' room, and exposes activity events filtered by pet + type.
//
// The Hub broadcasts events like:
//   { type: 'subscription-proposals', petId, proposals, timestamp }
//   { type: 'subscription-created',   petId, workflowId, subscriptionId, timestamp }
//   { type: 'mailbox-queued',         petId, workflowId, toPetId, timestamp }
//   { type: 'battle-progress',        petId, battleId, phase, detail, timestamp }
//   { type: 'battle-result',          petId, battleId, winner, text,
//                                     createTxHash?, settlementTxHash?, onChainStatus?, settlementError? }
//
// Modals subscribe with a (petId, type) filter and re-render when matching
// events arrive. Connection is shared per-petId via React state (one socket
// per modal instance is fine for our scale).

import { useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'

const HUB_URL = process.env.NEXT_PUBLIC_HUB_URL ?? 'http://localhost:3001'

export type ActivityType =
  | 'subscription-proposals'
  | 'subscription-created'
  | 'mailbox-queued'
  | 'battle-progress'
  | 'battle-result'

export interface ActivityEvent<T extends ActivityType = ActivityType> {
  type: T
  petId: number
  timestamp: number
  // Type-specific fields
  proposals?: Array<{ subscriptionId: number; name: string; amountUSDC: string; reason: string }>
  workflowId?: string
  subscriptionId?: number
  toPetId?: number
  battleId?: string
  phase?: string
  detail?: string
  metadata?: Record<string, unknown>
  winner?: number
  text?: string
  createTxHash?: string
  settlementTxHash?: string
  onChainStatus?: string
  settlementError?: string
}

export interface UseActivityEventsResult {
  events: ActivityEvent[]
  /** Whether the socket is currently connected. */
  connected: boolean
}

/**
 * Subscribe to Hub `activity` events for a pet. Optionally filter by type.
 *
 * Returns the chronological list of received events (capped to last 50). The
 * caller renders / merges them as needed.
 */
export function useActivityEvents(
  petId: number | null,
  filter?: ActivityType | ActivityType[],
): UseActivityEventsResult {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [connected, setConnected] = useState(false)
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    if (petId == null) return

    const socket = io(HUB_URL, { transports: ['websocket', 'polling'] })
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      socket.emit('join', { petId })
    })

    socket.on('disconnect', () => setConnected(false))

    socket.on('activity', (raw: ActivityEvent) => {
      // Filter by petId
      if (raw.petId !== petId) return
      // Filter by type
      if (filter) {
        const allowed = Array.isArray(filter) ? filter : [filter]
        if (!allowed.includes(raw.type)) return
      }
      setEvents((prev) => [...prev.slice(-49), raw])
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
    // We deliberately don't include `filter` in deps — the array would create
    // a new reference each render and cycle the connection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId])

  return { events, connected }
}
