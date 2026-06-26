'use client'
// Modulo P — Documenti & Prenotazioni

import { useState, useEffect, useCallback, useTransition } from 'react'
import {
  getDocuments,
  addDocument,
  deleteDocument,
} from '@/app/trip/[id]/documents/actions'
import type { TripDocument, DocType } from '@repo/shared/types/database'

interface Props {
  tripId:        string
  currentUserId: string
}

const DOC_META: Record<DocType, { icon: string; label: string }> = {
  volo:         { icon: '✈️', label: 'Volo' },
  hotel:        { icon: '🏨', label: 'Hotel' },
  treno:        { icon: '🚆', label: 'Treno' },
  bus:          { icon: '🚌', label: 'Bus' },
  noleggio:     { icon: '🚗', label: 'Noleggio' },
  biglietto:    { icon: '🎫', label: 'Biglietto' },
  assicurazione:{ icon: '🛡️', label: 'Assicurazione' },
  altro:        { icon: '📄', label: 'Altro' },
}
const DOC_TYPES = Object.keys(DOC_META) as DocType[]

function fmtDate(d: string | null): string {
  if (!d) return ''
  return new Date(d + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function DocumentsTab({ tripId, currentUserId }: Props) {
  const [docs,      setDocs]      = useState<TripDocument[]>([])
  const [loading,   setLoading]   = useState(true)
  const [filter,    setFilter]    = useState<DocType | 'tutti'>('tutti')
  const [adding,    setAdding]    = useState(false)
  const [copied,    setCopied]    = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Form state
  const [fType, setFType] = useState<DocType>('volo')
  const [fTitle, setFTitle] = useState('')
  const [fCode, setFCode] = useState('')
  const [fDate, setFDate] = useState('')
  const [fTime, setFTime] = useState('')
  const [fLink, setFLink] = useState('')
  const [fNotes, setFNotes] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setDocs(await getDocuments(tripId))
    setLoading(false)
  }, [tripId])

  useEffect(() => { load() }, [load])

  function resetForm() {
    setFType('volo'); setFTitle(''); setFCode(''); setFDate(''); setFTime(''); setFLink(''); setFNotes('')
  }

  function handleAdd() {
    if (!fTitle.trim()) return
    startTransition(async () => {
      const res = await addDocument(tripId, {
        doc_type: fType, title: fTitle, booking_code: fCode,
        doc_date: fDate || null, doc_time: fTime || null,
        link_url: fLink || null, notes: fNotes || null,
      })
      if (!res.error) { resetForm(); setAdding(false); await load() }
    })
  }

  function handleDelete(docId: string) {
    startTransition(async () => {
      setDocs(prev => prev.filter(d => d.id !== docId))
      const res = await deleteDocument(tripId, docId)
      if (res.error) await load()
    })
  }

  function copyCode(code: string) {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(code)
      setTimeout(() => setCopied(null), 1500)
    }).catch(() => {})
  }

  const visible = filter === 'tutti' ? docs : docs.filter(d => d.doc_type === filter)

  return (
    <div className="dc-wrap">
      <div className="dc-header">
        <h2 className="dc-title">📄 Documenti & Prenotazioni</h2>
        <button className="dc-add-toggle" onClick={() => setAdding(a => !a)}>
          {adding ? 'Chiudi' : '+ Aggiungi'}
        </button>
      </div>

      {/* Form aggiunta */}
      {adding && (
        <div className="dc-form">
          <div className="dc-type-grid">
            {DOC_TYPES.map(t => (
              <button
                key={t}
                className={`dc-type-btn${fType === t ? ' dc-type-active' : ''}`}
                onClick={() => setFType(t)}
              >
                {DOC_META[t].icon} {DOC_META[t].label}
              </button>
            ))}
          </div>
          <input className="dc-input" value={fTitle} onChange={e => setFTitle(e.target.value)} placeholder="Titolo (es. Volo Roma→Vienna)" />
          <input className="dc-input" value={fCode} onChange={e => setFCode(e.target.value)} placeholder="Codice prenotazione / PNR (opzionale)" />
          <div className="dc-row">
            <input className="dc-input" type="date" value={fDate} onChange={e => setFDate(e.target.value)} />
            <input className="dc-input" type="time" value={fTime} onChange={e => setFTime(e.target.value)} />
          </div>
          <input className="dc-input" value={fLink} onChange={e => setFLink(e.target.value)} placeholder="Link conferma (opzionale)" />
          <textarea className="dc-input dc-textarea" value={fNotes} onChange={e => setFNotes(e.target.value)} placeholder="Note (opzionale)" rows={2} />
          <button className="dc-save" onClick={handleAdd} disabled={isPending || !fTitle.trim()}>
            {isPending ? 'Salvataggio…' : 'Salva documento'}
          </button>
        </div>
      )}

      {/* Filtri */}
      {docs.length > 0 && (
        <div className="dc-chips">
          <button className={`dc-chip${filter === 'tutti' ? ' dc-chip-active' : ''}`} onClick={() => setFilter('tutti')}>Tutti</button>
          {DOC_TYPES.filter(t => docs.some(d => d.doc_type === t)).map(t => (
            <button key={t} className={`dc-chip${filter === t ? ' dc-chip-active' : ''}`} onClick={() => setFilter(t)}>
              {DOC_META[t].icon} {DOC_META[t].label}
            </button>
          ))}
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="dc-loading"><div className="dc-spinner" /><span>Caricamento…</span></div>
      ) : visible.length === 0 ? (
        <div className="dc-empty">
          <span className="dc-empty-icon">🗂️</span>
          <p>Nessun documento. Aggiungi voli, hotel, biglietti e codici di prenotazione qui.</p>
        </div>
      ) : (
        <div className="dc-list">
          {visible.map(doc => {
            const meta = DOC_META[doc.doc_type]
            const isMine = doc.created_by === currentUserId
            return (
              <div key={doc.id} className="dc-card">
                <div className="dc-card-icon">{meta.icon}</div>
                <div className="dc-card-body">
                  <div className="dc-card-top">
                    <span className="dc-card-title">{doc.title}</span>
                    {isMine && (
                      <button className="dc-del" onClick={() => handleDelete(doc.id)} aria-label="Elimina">🗑</button>
                    )}
                  </div>
                  {(doc.doc_date || doc.doc_time) && (
                    <div className="dc-card-when">
                      {fmtDate(doc.doc_date)}{doc.doc_time ? ` · ${doc.doc_time.slice(0,5)}` : ''}
                    </div>
                  )}
                  {doc.booking_code && (
                    <button className="dc-code" onClick={() => copyCode(doc.booking_code!)} title="Tocca per copiare">
                      <span className="dc-code-val">{doc.booking_code}</span>
                      <span className="dc-code-copy">{copied === doc.booking_code ? '✓ copiato' : '📋 copia'}</span>
                    </button>
                  )}
                  {doc.notes && <p className="dc-card-notes">{doc.notes}</p>}
                  {doc.link_url && (
                    <a className="dc-link" href={doc.link_url} target="_blank" rel="noopener noreferrer">Apri conferma →</a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <style jsx>{`
        .dc-wrap { display: flex; flex-direction: column; gap: 0.75rem; }
        .dc-header { display: flex; align-items: center; justify-content: space-between; }
        .dc-title { font-size: 0.9375rem; font-weight: 700; color: var(--md-on-surface,#18181B); margin: 0; }
        .dc-add-toggle {
          background: var(--md-primary,#7C3AED); color: #fff; border: none;
          border-radius: var(--md-radius-full); padding: 6px 14px;
          font-size: 0.8rem; font-weight: 700; cursor: pointer; font-family: inherit;
        }

        /* Form */
        .dc-form {
          background: var(--md-surface,#FAFAFA); border: 1.5px solid var(--md-outline-variant,#D4D4D8);
          border-radius: var(--md-radius-l,16px); padding: 12px; display: flex; flex-direction: column; gap: 8px;
        }
        .dc-type-grid { display: flex; flex-wrap: wrap; gap: 6px; }
        .dc-type-btn {
          padding: 5px 10px; border-radius: var(--md-radius-full);
          border: 1.5px solid var(--md-outline-variant,#D4D4D8); background: transparent;
          font-size: 0.75rem; font-weight: 600; color: var(--md-on-surface-variant,#52525B);
          cursor: pointer; font-family: inherit;
        }
        .dc-type-active { background: var(--md-primary-container,#EDE9FE); border-color: var(--md-primary,#7C3AED); color: var(--md-primary,#7C3AED); }
        .dc-input {
          width: 100%; padding: 8px 10px; box-sizing: border-box;
          border: 1.5px solid var(--md-outline-variant,#D4D4D8); border-radius: var(--md-radius-m,12px);
          font-size: 0.875rem; color: var(--md-on-surface,#18181B);
          background: var(--md-surface-container-low,#F4F4F5); font-family: inherit;
        }
        .dc-input:focus { outline: none; border-color: var(--md-primary,#7C3AED); background: var(--md-surface,#FAFAFA); }
        .dc-textarea { resize: vertical; line-height: 1.4; }
        .dc-row { display: flex; gap: 8px; }
        .dc-row .dc-input { flex: 1; }
        .dc-save {
          background: var(--md-primary,#7C3AED); color: #fff; border: none;
          border-radius: var(--md-radius-full); padding: 9px; font-size: 0.875rem;
          font-weight: 700; cursor: pointer; font-family: inherit;
        }
        .dc-save:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Chips */
        .dc-chips { display: flex; gap: 6px; flex-wrap: wrap; }
        .dc-chip {
          padding: 5px 12px; border-radius: var(--md-radius-full);
          border: 1.5px solid var(--md-outline-variant,#D4D4D8); background: var(--md-surface,#FAFAFA);
          font-size: 0.78rem; font-weight: 500; color: var(--md-on-surface-variant,#52525B);
          cursor: pointer; font-family: inherit; white-space: nowrap;
        }
        .dc-chip-active { background: var(--md-primary,#7C3AED); color: #fff; border-color: var(--md-primary,#7C3AED); }

        /* Loading / empty */
        .dc-loading { display: flex; align-items: center; gap: 8px; padding: 2rem; justify-content: center; color: var(--md-on-surface-variant,#52525B); font-size: 0.875rem; }
        .dc-spinner { width: 20px; height: 20px; border: 2.5px solid var(--md-surface-container,#EEECF8); border-top-color: var(--md-primary,#7C3AED); border-radius: 50%; animation: spin 0.7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .dc-empty { text-align: center; padding: 2.5rem 1rem; display: flex; flex-direction: column; align-items: center; gap: 10px; }
        .dc-empty-icon { font-size: 2.25rem; }
        .dc-empty p { font-size: 0.875rem; color: var(--md-on-surface-variant,#52525B); margin: 0; max-width: 260px; line-height: 1.5; }

        /* Cards */
        .dc-list { display: flex; flex-direction: column; gap: 10px; }
        .dc-card {
          display: flex; gap: 12px; align-items: flex-start;
          background: var(--md-surface,#FAFAFA); border-radius: var(--md-radius-l,16px);
          padding: 12px 14px; box-shadow: var(--md-elevation-1);
        }
        .dc-card-icon { font-size: 1.5rem; flex-shrink: 0; line-height: 1.2; }
        .dc-card-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
        .dc-card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
        .dc-card-title { font-size: 0.9rem; font-weight: 700; color: var(--md-on-surface,#18181B); line-height: 1.35; }
        .dc-del { background: none; border: none; cursor: pointer; font-size: 0.875rem; opacity: 0.55; flex-shrink: 0; padding: 0 2px; }
        .dc-del:hover { opacity: 1; }
        .dc-card-when { font-size: 0.75rem; color: var(--md-on-surface-variant,#52525B); font-weight: 500; }
        .dc-code {
          display: inline-flex; align-items: center; gap: 8px; align-self: flex-start;
          background: var(--md-surface-container,#EEECF8); border: none;
          border-radius: var(--md-radius-m,12px); padding: 5px 10px; cursor: pointer; font-family: inherit;
        }
        .dc-code-val { font-size: 0.8rem; font-weight: 700; letter-spacing: 0.05em; color: var(--md-on-surface,#18181B); font-variant-numeric: tabular-nums; }
        .dc-code-copy { font-size: 0.68rem; color: var(--md-primary,#7C3AED); font-weight: 600; }
        .dc-card-notes { font-size: 0.8rem; color: var(--md-on-surface-variant,#52525B); margin: 0; line-height: 1.45; }
        .dc-link { font-size: 0.8rem; font-weight: 600; color: var(--md-primary,#7C3AED); text-decoration: none; align-self: flex-start; }
      `}</style>
    </div>
  )
}
