// ============================================================
// src/components/trip/LivePresence.tsx
// Mostra chi sta guardando il viaggio in tempo reale
// Usa Supabase Realtime Presence
// ============================================================
'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PresenceUser } from '@/types/database'

interface Props {
  tripId: string
  currentUser: {
    id: string
    username: string
    avatar_url: string | null
  }
}

export function LivePresence({ tripId, currentUser }: Props) {
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([])
  const supabase = createClient()

  const updatePresence = useCallback(() => {
    const channel = supabase.channel(`trip-presence:${tripId}`, {
      config: { presence: { key: currentUser.id } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceUser>()
        const seen = new Set<string>()
        const users = Object.values(state)
          .flat()
          .map(u => u as unknown as PresenceUser)
          .filter(u => {
            if (seen.has(u.user_id)) return false
            seen.add(u.user_id)
            return true
          })
        setOnlineUsers(users)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: currentUser.id,
            username: currentUser.username,
            avatar_url: currentUser.avatar_url,
            online_at: new Date().toISOString(),
          })
        }
      })

    return () => {
      channel.unsubscribe()
    }
  }, [tripId, currentUser, supabase])

  useEffect(() => {
    const cleanup = updatePresence()
    return cleanup
  }, [updatePresence])

  if (onlineUsers.length === 0) return null

  return (
    <div className="presence-bar">
      <div className="presence-dot" aria-hidden="true" />
      <span className="presence-label">
        {onlineUsers.length === 1
          ? 'Solo tu'
          : `${onlineUsers.length} online ora`}
      </span>
      <div className="presence-avatars">
        {onlineUsers.slice(0, 5).map((u) => (
          <div
            key={u.user_id}
            className="presence-avatar"
            title={u.username}
          >
            {u.avatar_url ? (
              <img src={u.avatar_url} alt={u.username} />
            ) : (
              u.username[0].toUpperCase()
            )}
          </div>
        ))}
        {onlineUsers.length > 5 && (
          <div className="presence-avatar presence-more">
            +{onlineUsers.length - 5}
          </div>
        )}
      </div>

      <style jsx>{`
        .presence-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0.5rem 1rem;
          background: #E1F5EE;
          border-radius: 99px;
          width: fit-content;
        }
        .presence-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #1D9E75;
          animation: pulse 2s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }
        .presence-label {
          font-size: 0.75rem;
          font-weight: 500;
          color: #0F6E56;
        }
        .presence-avatars {
          display: flex;
        }
        .presence-avatar {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #1D9E75;
          border: 2px solid #E1F5EE;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.6rem;
          font-weight: 600;
          color: #fff;
          margin-left: -4px;
          overflow: hidden;
        }
        .presence-avatar:first-child { margin-left: 0; }
        .presence-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .presence-more { background: #9FE1CB; color: #0F6E56; }
      `}</style>
    </div>
  )
}
