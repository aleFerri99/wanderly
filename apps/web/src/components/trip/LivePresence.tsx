// ============================================================
// src/components/trip/LivePresence.tsx
// Mostra chi sta guardando il viaggio in tempo reale
// Usa Supabase Realtime Presence
// ============================================================
'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PresenceUser } from '@repo/shared/types/database'

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
        /* M3 Surface Container pill — coerente con il design system */
        .presence-bar {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 5px 12px 5px 8px;
          background: var(--md-surface-container, #EEECF8);
          border-radius: var(--md-radius-full);
        }
        /* Dot pulsante in tertiary (teal) */
        .presence-dot {
          width: 7px; height: 7px;
          border-radius: 50%;
          background: var(--md-tertiary, #0D9488);
          flex-shrink: 0;
          animation: lp-pulse 2s ease-in-out infinite;
        }
        @keyframes lp-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.45; transform: scale(0.8); }
        }
        .presence-label {
          font-size: 0.75rem; font-weight: 600;
          color: var(--md-on-surface-variant, #52525B);
        }
        .presence-avatars { display: flex; }
        .presence-avatar {
          width: 22px; height: 22px;
          border-radius: 50%;
          background: var(--md-primary, #7C3AED);
          border: 2px solid var(--md-surface-container, #EEECF8);
          display: flex; align-items: center; justify-content: center;
          font-size: 0.6rem; font-weight: 700; color: #fff;
          margin-left: -5px; overflow: hidden; flex-shrink: 0;
        }
        .presence-avatar:first-child { margin-left: 0; }
        .presence-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .presence-more {
          background: var(--md-surface-container-high, #E4E1F5);
          color: var(--md-on-surface-variant, #52525B);
        }
      `}</style>
    </div>
  )
}
