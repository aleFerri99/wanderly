'use client'

import { useState, useEffect, useTransition, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { addActivity } from '@/app/trip/[id]/timeline/actions'
import { refreshTripSuggestions } from '@/app/trip/[id]/suggestions/actions'
import type { DayWithActivities } from '@repo/shared/types/database'

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
    date:       string | null   // YYYY-MM-DD consigliata dall'agente
  } | null
  created_at: string
}

interface Props {
  tripId:        string
  currentUserId: string
  days:          DayWithActivities[]   // lista giorni per trovare il day_id dalla data
}

// ── Identità visiva degli agenti AI (spec D) ──────────────────
const AGENT: Record<string, {
  name: string; avatar: string
  gradient: string; accent: string; accentBg: string
}> = {
  weather_alert: {
    name: 'Il Meteorologo', avatar: '🌦️',
    gradient: 'linear-gradient(135deg,rgba(13,148,136,.12),rgba(6,182,212,.06))',
    accent: 'var(--md-tertiary,#0D9488)', accentBg: 'var(--md-tertiary-container,#CCFBF1)',
  },
  reschedule: {
    name: 'Travel Planner', avatar: '✈️',
    gradient: 'linear-gradient(135deg,rgba(124,58,237,.1),rgba(139,92,246,.05))',
    accent: 'var(--md-primary,#7C3AED)', accentBg: 'var(--md-primary-container,#EDE9FE)',
  },
  swap_indoor: {
    name: 'Travel Planner', avatar: '🏛️',
    gradient: 'linear-gradient(135deg,rgba(124,58,237,.1),rgba(139,92,246,.05))',
    accent: 'var(--md-primary,#7C3AED)', accentBg: 'var(--md-primary-container,#EDE9FE)',
  },
  new_activity: {
    name: 'Travel Planner', avatar: '✨',
    gradient: 'linear-gradient(135deg,rgba(217,119,6,.1),rgba(245,158,11,.05))',
    accent: 'var(--md-secondary,#D97706)', accentBg: 'var(--md-secondary-container,#FEF3C7)',
  },
  activity_suggestion: {
    name: 'AI Wanderly', avatar: '💡',
    gradient: 'linear-gradient(135deg,rgba(124,58,237,.08),rgba(13,148,136,.06))',
    accent: 'var(--md-primary,#7C3AED)', accentBg: 'var(--md-primary-container,#EDE9FE)',
  },
}
const DEFAULT_AGENT = AGENT.activity_suggestion

function priorityLevel(p: number): 'high' | 'medium' | 'low' {
  if (p >= 7) return 'high'
  if (p >= 4) return 'medium'
  return 'low'
}

function parseBody(raw: string): { body: string; groupFit: string | null } {
  const marker = '{{group_fit}}'
  const idx = raw.indexOf(marker)
  if (idx === -1) return { body: raw, groupFit: null }
  return { body: raw.slice(0, idx).trim(), groupFit: raw.slice(idx + marker.length).trim() }
}

export function SuggestionsPanel({ tripId, currentUserId, days }: Props) {
  const supabase = createClient()
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [hasProfiles, setHasProfiles] = useState<boolean | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [refreshing, setRefreshing] = useState(false)
  const [addingAll, setAddingAll] = useState(false)

  // load esposta fuori dall'useEffect per poterla richiamare manualmente
  const load = useCallback(async () => {
    setLoading(true)
    // Controlla se esiste almeno un profilo viaggiatore per questo viaggio
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (supabase as any)
      .from('traveler_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('trip_id', tripId)
    setHasProfiles((count ?? 0) > 0)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('trip_suggestions')
      .select('*')
      .eq('trip_id', tripId)
      .order('priority', { ascending: false })
    setSuggestions((data ?? []) as Suggestion[])
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId])

  useEffect(() => {
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
    await load()
    setRefreshing(false)
  }

  function findDayForDate(date: string | null, timeStart: string | null = null): DayWithActivities | null {
    if (!date || days.length === 0) return days[0] ?? null
    const matches = days.filter(d => {
      if (!d.date) return false
      if (!d.date_end || d.date_end <= d.date) return d.date === date
      return d.date <= date && date <= d.date_end
    })
    if (matches.length === 0) return days[0] ?? null
    if (matches.length === 1) return matches[0]
    // Giorno di transizione: stessa data coperta da più tappe consecutive.
    // Le attività serali (≥15:00) appartengono alla tappa di arrivo (ultima in lista).
    // Le attività mattutine (<15:00) appartengono alla tappa di partenza (prima in lista).
    const hour = timeStart ? parseInt(timeStart.split(':')[0], 10) : 12
    return hour >= 15 ? matches[matches.length - 1] : matches[0]
  }

  async function handleAddAll() {
    if (days.length === 0) return
    const toAdd = suggestions.filter(s => s.activity_data && !added.has(s.id))
    if (!toAdd.length) return
    setAddingAll(true)
    for (const s of toAdd) {
      const actDate  = s.activity_data!.date ?? null
      const targetDay = findDayForDate(actDate, s.activity_data!.time_start ?? null)
      if (!targetDay) continue
      await addActivity(
        tripId, targetDay.id,
        s.activity_data!.title, s.activity_data!.time_start,
        s.activity_data!.notes, s.activity_data!.location,
        actDate, 999,
      )
      setAdded(prev => new Set([...prev, s.id]))
    }
    setAddingAll(false)
  }

  function handleAddActivity(s: Suggestion) {
    if (!s.activity_data || days.length === 0) return
    const actDate  = s.activity_data.date ?? null
    const targetDay = findDayForDate(actDate, s.activity_data.time_start ?? null)
    if (!targetDay) return

    startTransition(async () => {
      await addActivity(
        tripId,
        targetDay.id,
        s.activity_data!.title,
        s.activity_data!.time_start,
        s.activity_data!.notes,
        s.activity_data!.location,
        actDate,   // ← activity_date per collocarla nella data giusta nelle multi-day
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
          .sp-loading { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 2rem; color: var(--md-on-surface-variant,#52525B); font-size: 0.875rem; }
          .sp-spinner { width: 24px; height: 24px; border: 3px solid var(--md-surface-container,#EEECF8); border-top-color: var(--md-primary,#7C3AED); border-radius: 50%; animation: spin 0.7s linear infinite; }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    )
  }

  if (hasProfiles === false) {
    return (
      <div className="sp-gate">
        <div className="sp-gate-icon">🧠</div>
        <h3 className="sp-gate-title">Profilo gruppo mancante</h3>
        <p className="sp-gate-body">
          Prima di generare suggerimenti personalizzati, lo{' '}
          <strong>Psicologo AI</strong> deve analizzare i profili di tutti i membri del gruppo.
        </p>
        <a href={`?tab=gruppo`} className="sp-gate-btn">
          Vai allo Psicologo →
        </a>
        <style jsx>{`
          .sp-gate { background: var(--md-surface,#FAFAFA); border-radius: var(--md-radius-xl,24px); border: 2px dashed var(--md-primary-container,#EDE9FE); padding: 2.5rem 1.25rem; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 12px; }
          .sp-gate-icon { font-size: 2.75rem; }
          .sp-gate-title { font-size: 1rem; font-weight: 700; color: var(--md-on-surface,#18181B); margin: 0; }
          .sp-gate-body { font-size: 0.875rem; color: var(--md-on-surface-variant,#52525B); margin: 0; line-height: 1.55; max-width: 280px; }
          .sp-gate-btn { display: inline-block; margin-top: 4px; padding: 0.75rem 1.5rem; background: var(--md-primary,#7C3AED); color: #fff; border-radius: var(--md-radius-full); font-size: 0.875rem; font-weight: 700; text-decoration: none; box-shadow: var(--md-elevation-1); }
          .sp-gate-btn:hover { opacity: 0.9; }
        `}</style>
      </div>
    )
  }

  const addableCount = suggestions.filter(s => s.activity_data && !added.has(s.id)).length

  return (
    <div className="sp-wrap">
      <div className="sp-header">
        <div className="sp-title-row">
          <h2 className="sp-title">Suggerimenti AI</h2>
          {suggestions.length > 0 && (
            <span className="sp-count">{suggestions.length}</span>
          )}
        </div>
        <div className="sp-header-actions">
          {addableCount > 0 && days.length > 0 && (
            <button
              className="sp-add-all"
              onClick={handleAddAll}
              disabled={addingAll || isPending}
              title="Aggiungi tutti i suggerimenti all'itinerario"
            >
              {addingAll ? '⏳ Aggiunta…' : `+ Aggiungi tutti (${addableCount})`}
            </button>
          )}
          <button
            className="sp-refresh"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Aggiorna analisi meteo ora"
          >
            {refreshing ? '⏳' : '🔄'} Aggiorna
          </button>
        </div>
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
            const agent    = AGENT[s.type] ?? DEFAULT_AGENT
            const isAdded  = added.has(s.id)
            const isUrgent = s.priority >= 7
            const { body, groupFit } = parseBody(s.body)
            return (
              <div
                key={s.id}
                className="sp-card"
                style={{ background: `var(--md-surface,#FAFAFA) ${agent.gradient}` }}
              >
                {/* ── Identità agente ── */}
                <div className="sp-agent-bar">
                  <span className="sp-agent-avatar" style={{ background: agent.accentBg }}>{agent.avatar}</span>
                  <span className="sp-agent-name" style={{ color: agent.accent }}>{agent.name}</span>
                  {isUrgent && <span className="sp-urgent">⚡ Urgente</span>}
                </div>

                <h3 className="sp-card-title">{s.title}</h3>
                <p className="sp-card-body">{body}</p>
                {groupFit && (
                  <div className="sp-group-fit">
                    <span className="sp-group-fit-icon">👥</span>
                    <span className="sp-group-fit-text">{groupFit}</span>
                  </div>
                )}

                {s.activity_data && days.length > 0 && (
                  <button
                    className={`sp-add-btn ${isAdded ? 'sp-add-done' : ''}`}
                    style={isAdded ? undefined : { borderColor: agent.accent, color: agent.accent }}
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
        /* ── Wrapper ── */
        .sp-wrap { display: flex; flex-direction: column; gap: 0.875rem; }

        /* ── Header ── */
        .sp-header { display: flex; align-items: center; justify-content: space-between; }
        .sp-title-row { display: flex; align-items: center; gap: 8px; }
        .sp-title { font-size: 1rem; font-weight: 700; color: var(--md-on-surface, #18181B); margin: 0; }
        .sp-count { background: var(--md-primary, #7C3AED); color: #fff; font-size: 0.7rem; font-weight: 700; padding: 2px 8px; border-radius: var(--md-radius-full); }

        /* Header actions group */
        .sp-header-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

        /* Aggiungi tutti — M3 Filled Tonal Button */
        .sp-add-all {
          background: var(--md-primary-container, #EDE9FE);
          color: var(--md-primary, #7C3AED);
          border: none; border-radius: var(--md-radius-full); padding: 6px 14px;
          font-size: 0.8rem; font-weight: 700; cursor: pointer; font-family: inherit;
          transition: background 0.15s; white-space: nowrap;
        }
        .sp-add-all:hover:not(:disabled) { background: #DDD6FE; }
        .sp-add-all:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Refresh — M3 Outlined Button */
        .sp-refresh {
          background: none; border: 1.5px solid var(--md-outline-variant, #D4D4D8);
          border-radius: var(--md-radius-full); padding: 6px 14px;
          font-size: 0.8rem; font-weight: 600; color: var(--md-primary, #7C3AED);
          cursor: pointer; font-family: inherit; transition: all 0.15s;
        }
        .sp-refresh:hover:not(:disabled) { background: var(--md-primary-container, #EDE9FE); border-color: var(--md-primary, #7C3AED); }
        .sp-refresh:disabled { opacity: 0.5; cursor: not-allowed; }

        /* ── Empty state ── */
        .sp-empty { background: var(--md-surface, #FAFAFA); border-radius: var(--md-radius-xl, 24px); border: 2px dashed var(--md-outline-variant, #D4D4D8); padding: 2.5rem 1.25rem; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 10px; }
        .sp-empty-icon { font-size: 2.5rem; }
        .sp-empty p { font-size: 0.9rem; color: var(--md-on-surface, #18181B); margin: 0; font-weight: 600; }
        .sp-empty-hint { font-size: 0.8rem !important; color: var(--md-on-surface-variant, #52525B) !important; font-weight: 400 !important; line-height: 1.5; }
        .sp-refresh-btn { padding: 0.75rem 1.5rem; background: var(--md-primary, #7C3AED); color: #fff; border: none; border-radius: var(--md-radius-full); font-size: 0.875rem; font-weight: 700; cursor: pointer; font-family: inherit; box-shadow: var(--md-elevation-1); }
        .sp-refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        /* ── Suggestion cards con glow agente ── */
        .sp-list { display: flex; flex-direction: column; gap: 0.875rem; }
        .sp-card {
          border-radius: var(--md-radius-xl, 24px);
          box-shadow: var(--md-elevation-1);
          padding: 1rem 1rem 0.875rem;
          display: flex; flex-direction: column; gap: 8px;
          transition: box-shadow 0.2s;
        }
        .sp-card:hover { box-shadow: var(--md-elevation-2); }

        /* Agent identity bar */
        .sp-agent-bar { display: flex; align-items: center; gap: 8px; }
        .sp-agent-avatar { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.875rem; flex-shrink: 0; }
        .sp-agent-name { font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; }
        .sp-urgent { margin-left: auto; font-size: 0.7rem; font-weight: 700; background: var(--md-error-container, #FEE2E2); color: var(--md-error, #DC2626); padding: 2px 8px; border-radius: var(--md-radius-full); flex-shrink: 0; }
        /* Card content */
        .sp-card-title { font-size: 0.9375rem; font-weight: 700; color: var(--md-on-surface, #18181B); margin: 0; }
        .sp-card-body  { font-size: 0.825rem; color: var(--md-on-surface-variant, #52525B); margin: 0; line-height: 1.55; }
        .sp-group-fit  { display: flex; align-items: flex-start; gap: 6px; background: var(--md-surface-container-low,#F4F4F5); border-radius: var(--md-radius-m,12px); padding: 7px 10px; margin-top: 2px; }
        .sp-group-fit-icon { font-size: 0.875rem; flex-shrink: 0; line-height: 1.4; }
        .sp-group-fit-text { font-size: 0.775rem; color: var(--md-on-surface-variant,#52525B); line-height: 1.45; font-style: italic; }

        /* M3 Tonal Outlined Button */
        .sp-add-btn {
          padding: 7px 16px; border: 1.5px solid; border-radius: var(--md-radius-full);
          font-size: 0.8rem; font-weight: 700; cursor: pointer; font-family: inherit;
          background: transparent;
          transition: background 0.15s, opacity 0.15s;
          margin-top: 4px; align-self: flex-start;
        }
        .sp-add-btn:hover:not(:disabled) { opacity: 0.8; }
        .sp-add-done { background: var(--md-surface-container, #EEECF8) !important; color: var(--md-on-surface-variant, #52525B) !important; border-color: var(--md-outline-variant, #D4D4D8) !important; cursor: default !important; }
        .sp-add-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .sp-footer { font-size: 0.7rem; color: var(--md-outline, #A1A1AA); text-align: center; margin: 0; }
      `}</style>
    </div>
  )
}
