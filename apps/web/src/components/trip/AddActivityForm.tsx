'use client'
// src/components/trip/AddActivityForm.tsx
import { PlacesAutocomplete } from '@/components/ui/PlacesAutocomplete'
import { TimeInput } from '@/components/ui/TimeInput'
import type { PlaceSuggestion } from '@/lib/placesAutocomplete'

interface Props {
  destination:  string          // città del viaggio, per il contesto Places
  title: string
  setTitle: (v: string) => void
  time: string
  setTime: (v: string) => void
  duration: string
  setDuration: (v: string) => void
  notes: string
  setNotes: (v: string) => void
  location: string
  setLocation: (v: string) => void
  setLat: (v: number | null) => void
  setLng: (v: number | null) => void
  isPending: boolean
  onSave: () => void
  onCancel: () => void
}

export function AddActivityForm({
  destination,
  title, setTitle,
  time, setTime,
  duration, setDuration,
  notes, setNotes,
  location, setLocation,
  setLat, setLng,
  isPending,
  onSave,
  onCancel,
}: Props) {

  function handlePlaceSelect(place: PlaceSuggestion) {
    setTitle(place.name)
    if (place.address) setLocation(place.address)
    setLat(place.lat ?? null)
    setLng(place.lng ?? null)
  }

  return (
    <div className="form-card">
      {/* Campo titolo con autocomplete Places */}
      <PlacesAutocomplete
        destination={destination}
        value={title}
        onChange={v => { setTitle(v); setLat(null); setLng(null) }}
        onSelect={handlePlaceSelect}
        placeholder="Cosa farete? (es. Colosseo, cena al porto…)"
        inputStyle={{
          width: '100%', padding: '6px 8px',
          border: '1px solid #1D9E75', borderRadius: 8,
          fontSize: '0.9rem', fontWeight: 500, color: '#1a1a1a',
          background: '#fff', boxSizing: 'border-box', fontFamily: 'inherit',
        }}
      />

      <div className="form-row">
        <TimeInput value={time} onChange={setTime} />
        <span className="form-hint">Orario</span>
        <input
          className="form-dur"
          type="number"
          min={5}
          step={5}
          value={duration}
          onChange={e => setDuration(e.target.value)}
          placeholder="min"
        />
        <span className="form-hint">Durata</span>
      </div>
      <input
        className="form-location"
        value={location}
        onChange={e => setLocation(e.target.value)}
        placeholder="📍 Indirizzo (auto-compilato selezionando un suggerimento)"
      />
      <textarea
        className="form-notes"
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Note, link…"
        rows={2}
      />
      <div className="form-actions">
        <button className="form-cancel" onClick={onCancel}>
          Annulla
        </button>
        <button
          className="form-save"
          onClick={onSave}
          disabled={isPending || !title.trim()}
        >
          {isPending ? '…' : '+ Aggiungi'}
        </button>
      </div>

      <style jsx>{`
        .form-card {
          display: flex; flex-direction: column; gap: 8px;
          background: #fff; border: 1px solid #1D9E75; border-radius: 12px;
          padding: 12px; margin: 4px 0 8px;
          box-shadow: 0 0 0 3px rgba(29,158,117,0.08);
        }
        .form-row { display: flex; align-items: center; gap: 8px; }
        .form-hint { font-size: 0.75rem; color: #9a9a94; flex-shrink: 0; }
        .form-dur {
          width: 62px; flex-shrink: 0; padding: 5px 6px;
          border: 1px solid #e0e0db; border-radius: 8px;
          font-size: 0.875rem; color: #1a1a1a; background: #fafaf8;
          font-family: inherit; text-align: center;
        }
        .form-dur:focus { outline: none; border-color: #1D9E75; }
        .form-location {
          width: 100%; padding: 6px 8px;
          border: 1px solid #e0e0db; border-radius: 8px;
          font-size: 0.8rem; color: #1a1a1a; background: #fafaf8;
          box-sizing: border-box; font-family: inherit;
        }
        .form-location:focus { outline: none; border-color: #1D9E75; }
        .form-notes {
          width: 100%; padding: 6px 8px;
          border: 1px solid #e0e0db; border-radius: 8px;
          font-size: 0.8rem; color: #1a1a1a; background: #fafaf8;
          resize: none; box-sizing: border-box; font-family: inherit; line-height: 1.4;
        }
        .form-notes:focus { outline: none; border-color: #1D9E75; }
        .form-actions { display: flex; gap: 8px; justify-content: flex-end; }
        .form-cancel {
          padding: 5px 12px; border-radius: 8px; border: 1px solid #e0e0db;
          background: #f8f7f4; font-size: 0.8125rem; cursor: pointer;
          color: #3a3a3a; font-family: inherit;
        }
        .form-save {
          padding: 5px 14px; border-radius: 8px; border: none;
          background: #1D9E75; color: #fff; font-size: 0.8125rem;
          font-weight: 600; cursor: pointer; font-family: inherit;
        }
        .form-save:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </div>
  )
}
