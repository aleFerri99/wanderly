'use client'

import { useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { DayWithActivities, Activity } from '@/types/database'

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
    if (!data.length) return

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

  useEffect(() => {
    const channel = supabase
      .channel(`timeline:${tripId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'days', filter: `trip_id=eq.${tripId}` }, refetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities', filter: `trip_id=eq.${tripId}` }, refetch)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [tripId, supabase, refetch])
}