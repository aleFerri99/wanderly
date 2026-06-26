'use client'

import { useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { DayWithActivities, Activity } from '@repo/shared/types/database'

interface Props {
  tripId: string
  onUpdate: (days: DayWithActivities[]) => void
}

export function useTimelineRealtime({ tripId, onUpdate }: Props) {
  const supabase = createClient()
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate

  const refetch = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rawData } = await (supabase as any)
      .from('days')
      .select(`*, activities(*)`)
      .eq('trip_id', tripId)
      .order('position', { ascending: true })

    const data = (rawData ?? []) as DayWithActivities[]

    const normalized = data.map(day => ({
      ...day,
      activities: Array.from(
        new Map((day.activities ?? []).map((a: Activity) => [a.id, a])).values()
      ).sort((a: Activity, b: Activity) => {
        if (a.time_start && b.time_start) return a.time_start.localeCompare(b.time_start)
        if (a.time_start) return -1
        if (b.time_start) return 1
        return a.position - b.position
      })
    }))

    onUpdateRef.current(normalized as DayWithActivities[])
  }, [tripId, supabase])

  // Debounce: una raffica di eventi (es. "aggiungi tutti i suggerimenti" →
  // N insert) collassa in UN solo refetch invece di N refetch dell'intero albero
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const debouncedRefetch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { refetch() }, 350)
  }, [refetch])

  useEffect(() => {
    const channel = supabase
      .channel(`timeline:${tripId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'days', filter: `trip_id=eq.${tripId}` }, debouncedRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities', filter: `trip_id=eq.${tripId}` }, debouncedRefetch)
      .subscribe()

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      supabase.removeChannel(channel)
    }
  }, [tripId, supabase, debouncedRefetch])
}