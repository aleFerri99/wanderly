'use client'

import { useState, useTransition } from 'react'
import { createFromTemplate } from './actions'
import type { ExportTrip } from '@/app/trip/[id]/export/actions'
import { DateInput } from '@/components/ui/DateInput'

type DayDates = Record<number, { date: string | null; date_end: string | null }>

export function ImportWizard() {
  const [template, setTemplate] = useState<ExportTrip | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [tripName, setTripName] = useState('')
  const [destination, setDestination] = useState('')
  const [globalStart, setGlobalStart] = useState('')
  const [dayDates, setDayDates] = useState<DayDates>({})
  const [isPending, startTransition] = useTransition()
  const [step, setStep] = useState<'upload' | 'remap'>('upload')

  // ── Parsing del file ──────────────────────────────────────
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setParseError(null)
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const json = JSON.parse(ev.target?.result as string) as ExportTrip
        if (json.wanderly_version !== '1.0' || !json.days) {
          setParseError('File non riconosciuto. Usa un file esportato da Wanderly.')
          return
        }
        setTemplate(json)
        setTripName(json.name)
        setDestination(json.destination ?? '')
        // Inizializza le date dei giorni dai valori del template
        const initial: DayDates = {}
        json.days.forEach((d, i) => { initial[i] = { date: d.date, date_end: d.date_end } })
        setDayDates(initial)
        setGlobalStart(json.start_date ?? '')
        setStep('remap')
      } catch {
        setParseError('File JSON non valido.')
      }
    }
    reader.readAsText(file)
  }

  // ── Shift automatico di tutte le date dal globalStart ────
  function applyGlobalShift(newStart: string) {
    setGlobalStart(newStart)
    if (!template?.start_date || !newStart) return
    const orig = new Date(template.start_date + 'T00:00:00')
    const next = new Date(newStart + 'T00:00:00')
    const offset = Math.round((next.getTime() - orig.getTime()) / 86400000)
    const shifted: DayDates = {}
    template.days.forEach((d, i) => {
      shifted[i] = {
        date:     d.date     ? shiftDate(d.date, offset)     : null,
        date_end: d.date_end ? shiftDate(d.date_end, offset) : null,
      }
    })
    setDayDates(shifted)
  }

  function shiftDate(date: string, offsetDays: number): string {
    const d = new Date(date + 'T00:00:00')
    d.setDate(d.getDate() + offsetDays)
    return d.toISOString().split('T')[0]
  }

  function setDayDate(idx: number, field: 'date' | 'date_end', val: string) {
    setDayDates(prev => ({ ...prev, [idx]: { ...prev[idx], [field]: val || null } }))
  }

  function handleImport() {
    if (!template) return
    startTransition(async () => {
      await createFromTemplate(template, tripName, destination, dayDates)
    })
  }

  // ── Upload step ───────────────────────────────────────────
  if (step === 'upload') {
    return (
      <div className="iw-wrap">
        <h1 className="iw-title">Importa itinerario</h1>
        <p className="iw-desc">
          Carica un file <code>.json</code> esportato da Wanderly per creare una copia del viaggio con nuove date.
        </p>

        <label className="iw-dropzone">
          <input type="file" accept=".json,application/json" onChange={handleFile} className="iw-file-input" />
          <span className="iw-drop-icon">📂</span>
          <span className="iw-drop-label">Seleziona file JSON</span>
          <span className="iw-drop-hint">esportato da Wanderly</span>
        </label>

        {parseError && <p className="iw-error">{parseError}</p>}

        <style jsx>{`
          .iw-wrap { display: flex; flex-direction: column; gap: 1.25rem; }
          .iw-title { font-size: 1.25rem; font-weight: 700; color: #1a1a1a; margin: 0; }
          .iw-desc { font-size: 0.9rem; color: #6b6b6b; margin: 0; line-height: 1.5; }
          .iw-desc code { background: #f0f0ec; padding: 1px 5px; border-radius: 4px; font-size: 0.85em; }
          .iw-dropzone { display: flex; flex-direction: column; align-items: center; gap: 6px; background: #fff; border: 2px dashed #d0d0cb; border-radius: 16px; padding: 2rem 1.25rem; cursor: pointer; transition: border-color 0.15s; }
          .iw-dropzone:hover { border-color: #1D9E75; }
          .iw-file-input { display: none; }
          .iw-drop-icon { font-size: 2rem; }
          .iw-drop-label { font-size: 0.9375rem; font-weight: 600; color: #1a1a1a; }
          .iw-drop-hint { font-size: 0.8rem; color: #9a9a94; }
          .iw-error { font-size: 0.875rem; color: #b91c1c; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 0.75rem 1rem; margin: 0; }
        `}</style>
      </div>
    )
  }

  // ── Remap step ────────────────────────────────────────────
  return (
    <div className="iw-wrap">
      <button className="iw-back" onClick={() => setStep('upload')}>← Torna all&apos;upload</button>
      <h1 className="iw-title">Configura le nuove date</h1>
      <p className="iw-desc">
        Imposta le nuove date per ogni tappa. Le attività con una data specifica verranno spostate automaticamente.
      </p>

      {/* Info viaggio */}
      <div className="iw-card">
        <div className="iw-section-title">Dettagli viaggio</div>
        <div className="iw-field">
          <label>Nome viaggio</label>
          <input value={tripName} onChange={e => setTripName(e.target.value)} placeholder={template?.name} />
        </div>
        <div className="iw-field">
          <label>Destinazione</label>
          <input value={destination} onChange={e => setDestination(e.target.value)} placeholder={template?.destination ?? ''} />
        </div>

        {template?.start_date && (
          <div className="iw-field">
            <label>Nuova data di inizio (sposta tutto automaticamente)</label>
            <DateInput value={globalStart} onChange={applyGlobalShift} />
            <span className="iw-field-hint">Originale: {template.start_date}</span>
          </div>
        )}
      </div>

      {/* Date per ogni tappa */}
      <div className="iw-card">
        <div className="iw-section-title">Date tappe</div>
        {template?.days.map((day, idx) => (
          <div key={idx} className="iw-day-row">
            <div className="iw-day-title">{day.title}</div>
            {day.date && (
              <span className="iw-day-orig">Originale: {day.date}{day.date_end ? ` → ${day.date_end}` : ''}</span>
            )}
            <div className="iw-date-row">
              <div className="iw-field iw-field-sm">
                <label>Inizio *</label>
                <DateInput
                  value={dayDates[idx]?.date ?? ''}
                  onChange={v => setDayDate(idx, 'date', v)}
                />
              </div>
              <div className="iw-field iw-field-sm">
                <label>Fine (se multi-giorno)</label>
                <DateInput
                  value={dayDates[idx]?.date_end ?? ''}
                  onChange={v => setDayDate(idx, 'date_end', v)}
                  min={dayDates[idx]?.date ?? undefined}
                />
              </div>
            </div>
            {day.activities.length > 0 && (
              <p className="iw-day-acts">
                {day.activities.length} {day.activities.length === 1 ? 'attività' : 'attività'} — le date specifiche verranno spostate automaticamente
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="iw-actions">
        <button className="iw-btn-cancel" onClick={() => setStep('upload')}>Annulla</button>
        <button
          className="iw-btn-import"
          onClick={handleImport}
          disabled={isPending || !template}
        >
          {isPending ? 'Importazione…' : '✈️ Importa viaggio'}
        </button>
      </div>

      <style jsx>{`
        .iw-wrap { display: flex; flex-direction: column; gap: 1rem; }
        .iw-back { background: none; border: none; color: #1D9E75; font-size: 0.875rem; font-weight: 500; cursor: pointer; text-align: left; padding: 0; font-family: inherit; }
        .iw-title { font-size: 1.125rem; font-weight: 700; color: #1a1a1a; margin: 0; }
        .iw-desc { font-size: 0.875rem; color: #6b6b6b; margin: 0; line-height: 1.5; }
        .iw-card { background: #fff; border-radius: 16px; border: 1px solid #e8e8e4; padding: 1.25rem; display: flex; flex-direction: column; gap: 0.875rem; }
        .iw-section-title { font-size: 0.75rem; font-weight: 700; color: #9a9a94; text-transform: uppercase; letter-spacing: 0.06em; }
        .iw-field { display: flex; flex-direction: column; gap: 4px; }
        .iw-field-sm { flex: 1; }
        .iw-field label { font-size: 0.8rem; font-weight: 500; color: #3a3a3a; }
        .iw-field input { padding: 0.6rem 0.75rem; border: 1px solid #e0e0db; border-radius: 10px; font-size: 0.9375rem; color: #1a1a1a; background: #fafaf8; font-family: inherit; box-sizing: border-box; width: 100%; }
        .iw-field input:focus { outline: none; border-color: #1D9E75; box-shadow: 0 0 0 3px rgba(29,158,117,0.12); }
        .iw-field-hint { font-size: 0.75rem; color: #9a9a94; }
        .iw-day-row { border-top: 1px solid #f0f0ec; padding-top: 0.875rem; display: flex; flex-direction: column; gap: 6px; }
        .iw-day-title { font-size: 0.9375rem; font-weight: 600; color: #1a1a1a; }
        .iw-day-orig { font-size: 0.775rem; color: #9a9a94; }
        .iw-date-row { display: flex; gap: 8px; }
        .iw-day-acts { font-size: 0.775rem; color: #1D9E75; margin: 0; }
        .iw-actions { display: flex; gap: 0.75rem; }
        .iw-btn-cancel { flex: 1; padding: 0.75rem; background: #f8f7f4; border: 1px solid #e0e0db; border-radius: 10px; font-size: 0.9375rem; font-weight: 500; color: #3a3a3a; cursor: pointer; font-family: inherit; }
        .iw-btn-import { flex: 2; padding: 0.75rem; background: #1D9E75; border: none; border-radius: 10px; font-size: 0.9375rem; font-weight: 600; color: #fff; cursor: pointer; font-family: inherit; transition: background 0.15s; }
        .iw-btn-import:hover:not(:disabled) { background: #0F6E56; }
        .iw-btn-import:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>
    </div>
  )
}
