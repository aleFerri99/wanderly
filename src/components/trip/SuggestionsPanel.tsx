'use client'

import { useState, useEffect, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { addActivity } from '@/app/trip/[id]/timeline/actions'
import { refreshTripSuggestions } from '@/app/trip/[id]/suggestions/actions'

interface Suggestion {
  id:            string
  type:          string
  title:         string
  body:          string
  priority:      number
  activity_data: {
    title:      string
    notes:      string | null
    location:   string | null
    time_start: string | null
  } | null
  created_at: string
}

interface Props {
  tripId:        string
  currentUserId: string
  defaultDayId?: string   // day_id dove aggiungere le attività suggerite
}

const TYPE_ICON: Record<string, string> = {
  weather_alert:     '🌤️',
  reschedule:        '🔄',
  swap_indoor:       '🏛️',
  new_activity:      '✨',
  activity_suggestion: '💡',
}

const TYPE_LABEL: Record<string, string> = {
  weather_alert:     'Meteo',
  reschedule:        'Ripianifica',
  swap_indoor:       'Alternativa indoor',
  new_activity:      'Nuova attività',
  activity_suggestion: 'Suggerimento',
}

const PRIORITY_COLOR: Record<string, string> = {
  high:   '#b91c1c',
  medium: '#BA7517',
  low:    '#1D9E75',
}

function priorityLevel(p: number): 'high' | 'medium' | 'low' {
  if (p >= 7) return 'high'
  if (p >= 4) return 'medium'
  return 'low'
}

export function SuggestionsPanel({ tripId, currentUserId, defaultDayId }: Props) {
  const supabase = createClient()
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('trip_suggestions')
        .select('*')
        .eq('trip_id', tripId)
        .order('priority', { ascending: false })
      setSuggestions((data ?? []) as Suggestion[])
      setLoading(false)
    }
    load()

    // Realtime: aggiornamento automatico quando il cron genera nuovi suggerimenti
    const channel = supabase
      .channel(`suggestions:${tripId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'trip_suggestions',
        filter: `trip_id=eq.${tripId}`,
      }, load)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId])

  async function handleRefresh() {
    setRefreshing(true)
    await refreshTripSuggestions(tripId)
    setRefreshing(false)
  }

  function handleAddActivity(s: Suggestion) {
    if (!defaultDayId || !s.activity_data) return
    startTransition(async () => {
      await addActivity(
        tripId,
        defaultDayId,
        s.activity_data!.title,
        s.activity_data!.time_start,
        s.activity_data!.notes,
        s.activity_data!.location,
        null,
        999,
      )
      setAdded(prev => new Set([...prev, s.id]))
    })
  }

  if (loading) {
    return (
      <div className="sp-loading">
        <div className="sp-spinner" />
        <span>Caricamento suggerimenti AI…</span>
        <style jsx>{`
          .sp-loading { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 2rem; color: #9a9a94; font-size: 0.875rem; }
          .sp-spinner { width: 24px; height: 24px; border: 3px solid #e8e8e4; border-top-color: #1D9E75; border-radius: 50%; animation: spin 0.7s linear infinite; }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    )
  }

  return (
    <div className="sp-wrap">
      <div className="sp-header">
        <div className="sp-title-row">
          <h2 className="sp-title">Suggerimenti AI</h2>
          {suggestions.length > 0 && (
            <span className="sp-count">{suggestions.length}</span>
          )}
        </div>
        <button
          className="sp-refresh"
          onClick={handleRefresh}
          disabled={refreshing}
          title="Aggiorna analisi meteo ora"
        >
          {refreshing ? '⏳' : '🔄'} Aggiorna
        </button>
      </div>

      {suggestions.length === 0 ? (
        <div className="sp-empty">
          <div className="sp-empty-icon">✨</div>
          <p>Nessun suggerimento attivo.</p>
          <p className="sp-empty-hint">
            I suggerimenti vengono generati automaticamente ogni giorno alle 12:00
            o quando il meteo cambia per le destinazioni del tuo viaggio.
          </p>
          <button className="sp-refresh-btn" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? 'Analisi in corso…' : 'Genera suggerimenti ora'}
          </button>
        </div>
      ) : (
        <div className="sp-list">
          {suggestions.map(s => {
            const level = priorityLevel(s.priority)
            const isAdded = added.has(s.id)
            return (
              <div key={s.id} className={`sp-card sp-card-${level}`}>
                <div className="sp-card-header">
                  <span className="sp-icon">{TYPE_ICON[s.type] ?? '💡'}</span>
                  <div className="sp-card-meta">
                    <span className="sp-type-label">{TYPE_LABEL[s.type] ?? s.type}</span>
                    {s.priority >= 7 && <span className="sp-urgent">Urgente</span>}
                  </div>
                </div>
                <h3 className="sp-card-title">{s.title}</h3>
                <p className="sp-card-body">{s.body}</p>

                {s.activity_data && defaultDayId && (
                  <button
                    className={`sp-add-btn ${isAdded ? 'sp-add-done' : ''}`}
                    onClick={() => handleAddActivity(s)}
                    disabled={isPending || isAdded}
                  >
                    {isAdded ? '✓ Aggiunta all\'itinerario' : '+ Aggiungi all\'itinerario'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      <p className="sp-footer">
        Suggerimenti generati da AI · Ultimo aggiornamento:{' '}
        {suggestions[0]
          ? new Date(suggestions[0].created_at).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
          : 'N/D'}
      </p>

      <style jsx>{`
        .sp-wrap { display: flex; flex-direction: column; gap: 0.75rem; }
        .sp-header { display: flex; align-items: center; justify-content: space-between; }
        .sp-title-row { display: flex; align-items: center; gap: 8px; }
        .sp-title { font-size: 0.9375rem; font-weight: 600; color: #1a1a1a; margin: 0; }
        .sp-count { background: #1D9E75; color: #fff; font-size: 0.7rem; font-weight: 700; padding: 2px 7px; border-radius: 99px; }
        .sp-refresh { background: none; border: 1px solid #e0e0db; border-radius: 8px; padding: 4px 10px; font-size: 0.775rem; color: #6b6b6b; cursor: pointer; font-family: inherit; transition: background 0.15s; }
        .sp-refresh:hover:not(:disabled) { background: #f8f7f4; }
        .sp-refresh:disabled { opacity: 0.6; cursor: not-allowed; }

        .sp-empty { background: #fff; border-radius: 16px; border: 1px dashed #d0d0cb; padding: 2rem 1.25rem; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 8px; }
        .sp-empty-icon { font-size: 2rem; }
        .sp-empty p { font-size: 0.9rem; color: #3a3a3a; margin: 0; font-weight: 500; }
        .sp-empty-hint { font-size: 0.8rem; color: #9a9a94; line-height: 1.5; }
        .sp-refresh-btn { padding: 0.65rem 1.25rem; background: #1D9E75; color: #fff; border: none; border-radius: 10px; font-size: 0.875rem; font-weight: 600; cursor: pointer; font-family: inherit; margin-top: 4px; }
        .sp-refresh-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .sp-list { display: flex; flex-direction: column; gap: 0.75rem; }
        .sp-card { background: #fff; border-radius: 14px; border: 1px solid #e8e8e4; padding: 1rem; display: flex; flex-direction: column; gap: 6px; }
        .sp-card-high   { border-left: 3px solid #b91c1c; }
        .sp-card-medium { border-left: 3px solid #BA7517; }
        .sp-card-low    { border-left: 3px solid #1D9E75; }
        .sp-card-header { display: flex; align-items: center; gap: 8px; }
        .sp-icon { font-size: 1.125rem; }
        .sp-card-meta { display: flex; align-items: center; gap: 6px; }
        .sp-type-label { font-size: 0.7rem; font-weight: 700; color: #9a9a94; text-transform: uppercase; letter-spacing: 0.05em; }
        .sp-urgent { font-size: 0.65rem; font-weight: 700; background: #fef2f2; color: #b91c1c; padding: 1px 6px; border-radius: 99px; }
        .sp-card-title { font-size: 0.9rem; font-weight: 600; color: #1a1a1a; margin: 0; }
        .sp-card-body { font-size: 0.825rem; color: #4a4a4a; margin: 0; line-height: 1.5; }
        .sp-add-btn { padding: 6px 12px; background: #E1F5EE; color: #0F6E56; border: 1px solid #9FE1CB; border-radius: 8px; font-size: 0.8rem; font-weight: 600; cursor: pointer; font-family: inherit; transition: background 0.15s; margin-top: 4px; align-self: flex-start; }
        .sp-add-btn:hover:not(:disabled) { background: #9FE1CB; }
        .sp-add-done { background: #f0f0ec; color: #9a9a94; border-color: #e0e0db; cursor: default; }
        .sp-add-btn:disabled { opacity: 0.7; cursor: not-allowed; }

        .sp-footer { font-size: 0.7rem; color: #b0b0aa; text-align: center; margin: 0; }
      `}</style>
    </div>
  )
}
