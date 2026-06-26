'use client'
// Autocomplete intelligente per luoghi — usa Google Places se configurato,
// altrimenti Nominatim come fallback trasparente.

import { useState, useEffect, useRef, useCallback } from 'react'
import { fetchPlaceSuggestions, fetchPlaceDetails, type PlaceSuggestion } from '@/lib/placesAutocomplete'

interface Props {
  destination:   string
  value:         string
  onChange:      (v: string) => void
  onSelect:      (place: PlaceSuggestion) => void
  placeholder?:  string
  className?:    string
  inputStyle?:   React.CSSProperties
}

export function PlacesAutocomplete({
  destination, value, onChange, onSelect,
  placeholder = 'Es. Colosseo, Museo Egizio, Mercato della Boqueria…',
  className, inputStyle,
}: Props) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [loading,     setLoading]     = useState(false)
  const [open,        setOpen]        = useState(false)
  const [activeIdx,   setActiveIdx]   = useState(-1)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const wrapRef     = useRef<HTMLDivElement>(null)

  // Chiudi dropdown cliccando fuori
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const doFetch = useCallback(async (q: string) => {
    if (q.length < 2) { setSuggestions([]); setOpen(false); return }
    setLoading(true)
    const res = await fetchPlaceSuggestions(q, destination)
    setSuggestions(res)
    setOpen(res.length > 0)
    setLoading(false)
  }, [destination])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value)
    setActiveIdx(-1)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doFetch(e.target.value), 320)
  }

  async function handleSelect(s: PlaceSuggestion) {
    onChange(s.name)
    setOpen(false)
    setSuggestions([])
    setActiveIdx(-1)
    // Con Geoapify lat/lng sono già nel suggestion → fetchPlaceDetails ritorna subito
    const details = await fetchPlaceDetails(s.placeId, s)
    onSelect({ ...s, ...details })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || !suggestions.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, suggestions.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); handleSelect(suggestions[activeIdx]) }
    else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }} className={className}>
      <input
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        style={inputStyle}
      />

      {loading && (
        <span className="pac-loading">Cerca…</span>
      )}

      {open && suggestions.length > 0 && (
        <ul className="pac-dropdown" role="listbox">
          {suggestions.map((s, i) => (
            <li
              key={s.placeId}
              role="option"
              aria-selected={activeIdx === i}
              className={`pac-item${activeIdx === i ? ' pac-item-active' : ''}`}
              onMouseDown={() => handleSelect(s)}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <span className="pac-item-name">📍 {s.name}</span>
              <span className="pac-item-addr">{s.address}</span>
            </li>
          ))}
        </ul>
      )}

      <style jsx>{`
        .pac-loading {
          position: absolute; right: 8px; top: 50%;
          transform: translateY(-50%);
          font-size: 0.7rem; color: #9a9a94; pointer-events: none;
        }
        .pac-dropdown {
          position: absolute; top: calc(100% + 4px); left: 0; right: 0;
          z-index: 1200;
          background: #fff;
          border: 1px solid #e0e0db;
          border-radius: 10px;
          box-shadow: 0 6px 20px rgba(0,0,0,0.12);
          list-style: none; margin: 0; padding: 4px;
          max-height: 260px; overflow-y: auto;
        }
        .pac-item {
          display: flex; flex-direction: column; gap: 1px;
          padding: 8px 10px; border-radius: 7px; cursor: pointer;
          transition: background 0.1s;
        }
        .pac-item-active { background: #f0fbf7; }
        .pac-item:hover  { background: #f0fbf7; }
        .pac-item-name {
          font-size: 0.8375rem; font-weight: 600; color: #1a1a1a; line-height: 1.3;
        }
        .pac-item-addr {
          font-size: 0.72rem; color: #6b6b6b; line-height: 1.3;
        }
      `}</style>
    </div>
  )
}
