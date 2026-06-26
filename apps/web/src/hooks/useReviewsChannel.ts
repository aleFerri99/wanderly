'use client'
// Canale Realtime UNICO per trip per le recensioni.
// Invece di un canale per ogni ActivityCard, tutte le ReviewSection di uno
// stesso viaggio condividono una sola sottoscrizione (ref-counted): quando
// arriva un cambio su `reviews`, viene smistato solo ai listener il cui
// activity_id/day_id corrisponde alla riga modificata.
//
// Nota: richiede REPLICA IDENTITY FULL su reviews perché i payload DELETE
// includano activity_id/day_id (vedi migration 026).

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

type Col = 'activity_id' | 'day_id'
interface Listener { col: Col; val: string; cb: () => void }
interface Entry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  channel:   any
  listeners: Set<Listener>
}

const registry = new Map<string, Entry>()

export function useReviewsChannel(
  tripId: string,
  col:    Col,
  val:    string | undefined,
  cb:     () => void,
) {
  // Ref per chiamare sempre l'ultima callback senza rieseguire l'effetto
  const cbRef = useRef(cb)
  cbRef.current = cb

  useEffect(() => {
    if (!val) return
    const supabase = createClient()

    let entry = registry.get(tripId)
    if (!entry) {
      const channel = supabase
        .channel(`reviews-trip:${tripId}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'reviews',
          filter: `trip_id=eq.${tripId}`,
        }, (payload: { new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
          const row = payload.new ?? payload.old ?? {}
          const e = registry.get(tripId)
          if (!e) return
          for (const l of e.listeners) {
            if (row[l.col] === l.val) l.cb()
          }
        })
        .subscribe()
      entry = { channel, listeners: new Set() }
      registry.set(tripId, entry)
    }

    const listener: Listener = { col, val, cb: () => cbRef.current() }
    entry.listeners.add(listener)

    return () => {
      const e = registry.get(tripId)
      if (!e) return
      e.listeners.delete(listener)
      if (e.listeners.size === 0) {
        supabase.removeChannel(e.channel)
        registry.delete(tripId)
      }
    }
  }, [tripId, col, val])
}
