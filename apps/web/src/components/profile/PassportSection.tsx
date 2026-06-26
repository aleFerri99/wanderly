'use client'
// PassportSection — N.2: stats + mappa + lista paesi visitati

import { useState, useEffect, useCallback, useTransition } from 'react'
import dynamic from 'next/dynamic'
import {
  getPassportData,
  syncPassportFromTrips,
  addCountryManually,
  removeCountry,
  type PassportData,
} from '@/app/profile/passport-actions'
import { COUNTRIES, COUNTRIES_BY_CODE, TOTAL_COUNTRIES } from '@repo/shared/countries'

// Mappa caricata solo client-side — evita SSR di react-simple-maps
const WorldPassportMap = dynamic(
  () => import('./WorldPassportMap').then(m => m.WorldPassportMap),
  { ssr: false, loading: () => <div className="map-skeleton" /> }
)

export function PassportSection() {
  const [data,        setData]        = useState<PassportData | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const [showSearch,  setShowSearch]  = useState(false)
  const [isPending,   startTransition] = useTransition()
  const [feedback,    setFeedback]    = useState<string | null>(null)

  const load = useCallback(async () => {
    const d = await getPassportData()
    setData(d)
    setLoading(false)
  }, [])

  useEffect(() => {
    // Lazy sync (N.3): controlla viaggi terminati all'apertura del Passaporto
    syncPassportFromTrips().then(() => load())
  }, [load])

  function showFeedback(msg: string) {
    setFeedback(msg)
    setTimeout(() => setFeedback(null), 2500)
  }

  function handleAdd(code: string) {
    startTransition(async () => {
      const res = await addCountryManually(code)
      if (res.error) { showFeedback('⚠️ ' + res.error); return }
      showFeedback(`✅ ${COUNTRIES_BY_CODE.get(code)?.flag ?? ''} Aggiunto!`)
      setSearch(''); setShowSearch(false)
      await load()
    })
  }

  function handleRemove(code: string) {
    startTransition(async () => {
      await removeCountry(code)
      await load()
    })
  }

  function handleMapClick(code: string) {
    if (!data) return
    const visited = data.countries.some(c => c.country_code === code)
    if (!visited) {
      // Click su un paese non visitato → propone di aggiungerlo
      const country = COUNTRIES_BY_CODE.get(code)
      if (country && confirm(`Aggiungere ${country.flag} ${country.name} al tuo passaporto?`)) {
        handleAdd(code)
      }
    }
  }

  const visitedCodes = new Set(data?.countries.map(c => c.country_code) ?? [])

  // Paesi filtrati per la ricerca
  const searchResults = search.length >= 2
    ? COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.code.toLowerCase() === search.toLowerCase()
      ).filter(c => !visitedCodes.has(c.code))
      .slice(0, 8)
    : []

  if (loading) {
    return (
      <div className="pp-loading">
        <div className="pp-spinner" />
        <span>Caricamento passaporto…</span>
      </div>
    )
  }

  const count = data?.count ?? 0
  const pct   = data?.percentage ?? 0

  return (
    <div className="pp-wrap">
      {/* ── Header stats ── */}
      <div className="pp-stats-card">
        <div className="pp-stats-top">
          <span className="pp-globe">🌍</span>
          <div className="pp-stats-text">
            <h3 className="pp-title">Il tuo Passaporto</h3>
            <p className="pp-subtitle">
              <strong>{count}</strong> / {TOTAL_COUNTRIES} paesi  ·  <strong>{pct}%</strong> del mondo
            </p>
          </div>
        </div>
        <div className="pp-progress-track">
          <div className="pp-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <p className="pp-progress-label">
          {pct === 0  ? 'Inizia la tua avventura! 🗺️'
           : pct < 10 ? 'Esploratore alle prime armi 🌱'
           : pct < 25 ? 'Viaggiatore in crescita ✈️'
           : pct < 50 ? 'Globetrotter! 🌐'
           : pct < 75 ? 'Esploratore seriale 🔥'
           : pct < 100? 'Quasi tutto il mondo! 🏆'
           : 'Hai visitato il mondo intero! 🎉'}
        </p>
      </div>

      {/* ── Mappa interattiva ── */}
      <WorldPassportMap
        visitedCodes={visitedCodes}
        onCountryClick={handleMapClick}
      />

      {/* ── Feedback ── */}
      {feedback && <div className="pp-feedback">{feedback}</div>}

      {/* ── Aggiungi paese manualmente ── */}
      <div className="pp-add-section">
        {showSearch ? (
          <div className="pp-search-wrap">
            <input
              className="pp-search-input"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Cerca un paese… (es. Francia, Giappone)"
              autoFocus
            />
            {searchResults.length > 0 && (
              <div className="pp-search-results">
                {searchResults.map(c => (
                  <button
                    key={c.code}
                    className="pp-search-result"
                    onClick={() => handleAdd(c.code)}
                    disabled={isPending}
                  >
                    <span className="pp-result-flag">{c.flag}</span>
                    <span className="pp-result-name">{c.name}</span>
                    <span className="pp-result-code">{c.code}</span>
                  </button>
                ))}
              </div>
            )}
            <button className="pp-cancel" onClick={() => { setShowSearch(false); setSearch('') }}>
              Annulla
            </button>
          </div>
        ) : (
          <button className="pp-add-btn" onClick={() => setShowSearch(true)}>
            + Aggiungi paese visitato
          </button>
        )}
      </div>

      {/* ── Lista paesi visitati ── */}
      {(data?.countries.length ?? 0) > 0 && (
        <div className="pp-country-list">
          <h4 className="pp-list-title">Paesi visitati</h4>
          {data!.countries.map(c => {
            const info     = COUNTRIES_BY_CODE.get(c.country_code)
            const dateStr  = c.visited_at
              ? new Date(c.visited_at + 'T00:00:00').toLocaleDateString('it-IT', { month: 'short', year: 'numeric' })
              : null
            return (
              <div key={c.country_code} className="pp-country-row">
                <span className="pp-country-flag">{info?.flag ?? '🌐'}</span>
                <div className="pp-country-info">
                  <span className="pp-country-name">{info?.name ?? c.country_code}</span>
                  <div className="pp-country-meta">
                    {c.source === 'trip'
                      ? <span className="pp-badge pp-badge-trip">✈️ viaggio</span>
                      : <span className="pp-badge pp-badge-manual">✏️ manuale</span>
                    }
                    {dateStr && <span className="pp-country-date">{dateStr}</span>}
                  </div>
                </div>
                <button
                  className="pp-remove-btn"
                  onClick={() => handleRemove(c.country_code)}
                  disabled={isPending}
                  title="Rimuovi"
                >
                  ✕
                </button>
              </div>
            )
          })}
        </div>
      )}

      <style jsx>{`
        .pp-wrap  { display: flex; flex-direction: column; gap: 1rem; }

        /* Loading */
        .pp-loading { display: flex; align-items: center; gap: 10px; padding: 2rem; color: var(--md-on-surface-variant,#52525B); font-size: 0.875rem; justify-content: center; }
        .pp-spinner { width: 20px; height: 20px; border: 3px solid var(--md-surface-container,#EEECF8); border-top-color: var(--md-primary,#7C3AED); border-radius: 50%; animation: spin 0.7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .map-skeleton { width: 100%; height: 240px; background: var(--md-surface-container-low,#F4F4F5); border-radius: var(--md-radius-xl,24px); animation: pulse 1.5s ease-in-out infinite; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }

        /* Stats card */
        .pp-stats-card { background: var(--md-surface,#FAFAFA); border-radius: var(--md-radius-xl,24px); box-shadow: var(--md-elevation-1); padding: 1.25rem; display: flex; flex-direction: column; gap: 0.875rem; }
        .pp-stats-top  { display: flex; align-items: center; gap: 12px; }
        .pp-globe      { font-size: 2.25rem; line-height: 1; flex-shrink: 0; }
        .pp-stats-text { flex: 1; min-width: 0; }
        .pp-title      { font-size: 1rem; font-weight: 700; color: var(--md-on-surface,#18181B); margin: 0 0 2px; }
        .pp-subtitle   { font-size: 0.875rem; color: var(--md-on-surface-variant,#52525B); margin: 0; }
        .pp-subtitle strong { color: var(--md-primary,#7C3AED); }

        /* Progress bar */
        .pp-progress-track { height: 10px; background: var(--md-surface-container,#EEECF8); border-radius: var(--md-radius-full); overflow: hidden; }
        .pp-progress-fill  { height: 100%; background: linear-gradient(90deg, var(--md-primary,#7C3AED), var(--md-tertiary,#0D9488)); border-radius: var(--md-radius-full); transition: width 0.6s cubic-bezier(0.22,1,.36,1); min-width: 4px; }
        .pp-progress-label { font-size: 0.775rem; color: var(--md-on-surface-variant,#52525B); margin: 0; text-align: center; }

        /* Feedback */
        .pp-feedback { background: var(--md-tertiary-container,#CCFBF1); color: var(--md-tertiary,#0D9488); border-radius: var(--md-radius-m,12px); padding: 10px 14px; font-size: 0.875rem; font-weight: 600; text-align: center; }

        /* Add button & search */
        .pp-add-btn { width: 100%; padding: 0.875rem; background: var(--md-primary-container,#EDE9FE); color: var(--md-primary,#7C3AED); border: 1.5px solid var(--md-primary,#7C3AED); border-radius: var(--md-radius-full); font-size: 0.9rem; font-weight: 700; cursor: pointer; font-family: inherit; transition: background 0.15s; }
        .pp-add-btn:hover { background: var(--md-primary,#7C3AED); color: #fff; }
        .pp-search-wrap { display: flex; flex-direction: column; gap: 8px; }
        .pp-search-input { width: 100%; padding: 12px 16px; border: 2px solid var(--md-primary,#7C3AED); border-radius: var(--md-radius-xl,24px); font-size: 0.9375rem; font-family: inherit; background: var(--md-surface,#FAFAFA); color: var(--md-on-surface,#18181B); box-sizing: border-box; }
        .pp-search-input:focus { outline: none; box-shadow: 0 0 0 3px rgba(124,58,237,0.15); }
        .pp-search-results { background: var(--md-surface,#FAFAFA); border-radius: var(--md-radius-l,16px); box-shadow: var(--md-elevation-2); overflow: hidden; }
        .pp-search-result { width: 100%; display: flex; align-items: center; gap: 10px; padding: 10px 14px; border: none; background: none; cursor: pointer; font-family: inherit; transition: background 0.1s; text-align: left; }
        .pp-search-result:hover { background: var(--md-surface-container-low,#F4F4F5); }
        .pp-result-flag { font-size: 1.25rem; flex-shrink: 0; }
        .pp-result-name { flex: 1; font-size: 0.9rem; font-weight: 500; color: var(--md-on-surface,#18181B); }
        .pp-result-code { font-size: 0.7rem; color: var(--md-outline,#A1A1AA); font-weight: 700; }
        .pp-cancel { align-self: center; padding: 7px 20px; background: none; border: 1.5px solid var(--md-outline-variant,#D4D4D8); border-radius: var(--md-radius-full); font-size: 0.875rem; font-weight: 600; color: var(--md-on-surface-variant,#52525B); cursor: pointer; font-family: inherit; }

        /* Country list */
        .pp-country-list { background: var(--md-surface,#FAFAFA); border-radius: var(--md-radius-xl,24px); box-shadow: var(--md-elevation-1); overflow: hidden; }
        .pp-list-title { font-size: 0.8125rem; font-weight: 700; color: var(--md-on-surface-variant,#52525B); text-transform: uppercase; letter-spacing: 0.06em; padding: 1rem 1rem 0.5rem; margin: 0; }
        .pp-country-row { display: flex; align-items: center; gap: 10px; padding: 10px 1rem; border-top: 1px solid var(--md-outline-variant,#D4D4D8); }
        .pp-country-row:first-of-type { border-top: none; }
        .pp-country-flag { font-size: 1.5rem; flex-shrink: 0; }
        .pp-country-info { flex: 1; min-width: 0; }
        .pp-country-name { font-size: 0.9rem; font-weight: 600; color: var(--md-on-surface,#18181B); display: block; }
        .pp-country-meta { display: flex; align-items: center; gap: 6px; margin-top: 2px; }
        .pp-badge { font-size: 0.65rem; font-weight: 700; padding: 2px 7px; border-radius: var(--md-radius-full); }
        .pp-badge-trip   { background: var(--md-primary-container,#EDE9FE); color: var(--md-primary,#7C3AED); }
        .pp-badge-manual { background: var(--md-surface-container,#EEECF8); color: var(--md-on-surface-variant,#52525B); }
        .pp-country-date { font-size: 0.7rem; color: var(--md-outline,#A1A1AA); }
        .pp-remove-btn { width: 28px; height: 28px; border-radius: 50%; border: none; background: transparent; cursor: pointer; color: var(--md-outline,#A1A1AA); font-size: 0.75rem; display: flex; align-items: center; justify-content: center; transition: background 0.15s, color 0.15s; flex-shrink: 0; }
        .pp-remove-btn:hover { background: var(--md-error-container,#FEE2E2); color: var(--md-error,#DC2626); }
        .pp-remove-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      `}</style>
    </div>
  )
}
