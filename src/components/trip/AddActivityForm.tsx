'use client'
// src/components/trip/AddActivityForm.tsx

interface Props {
  title: string
  setTitle: (v: string) => void
  time: string
  setTime: (v: string) => void
  notes: string
  setNotes: (v: string) => void
  location: string
  setLocation: (v: string) => void
  isPending: boolean
  onSave: () => void
  onCancel: () => void
}

export function AddActivityForm({
  title, setTitle,
  time, setTime,
  notes, setNotes,
  location, setLocation,
  isPending,
  onSave,
  onCancel,
}: Props) {
  return (
    <div className="form-card">
      <input
        className="form-title"
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Cosa farete?"
        autoFocus
        onKeyDown={e => e.key === 'Enter' && onSave()}
      />
      <div className="form-row">
        <input
          className="form-time"
          type="time"
          value={time}
          onChange={e => setTime(e.target.value)}
        />
        <span className="form-hint">Orario (opzionale)</span>
      </div>
      <input
        className="form-location"
        value={location}
        onChange={e => setLocation(e.target.value)}
        placeholder="📍 Nome in inglese/locale (es. War Remnants Museum)"
      />
      <textarea
        className="form-notes"
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Note, indirizzo, link…"
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
          display: flex;
          flex-direction: column;
          gap: 8px;
          background: #fff;
          border: 1px solid #1D9E75;
          border-radius: 12px;
          padding: 12px;
          margin: 4px 0 8px;
          box-shadow: 0 0 0 3px rgba(29,158,117,0.08);
        }
        .form-title {
          width: 100%;
          padding: 6px 8px;
          border: 1px solid #1D9E75;
          border-radius: 8px;
          font-size: 0.9rem;
          font-weight: 500;
          color: #1a1a1a;
          background: #fff;
          box-sizing: border-box;
          font-family: inherit;
        }
        .form-title:focus { outline: none; box-shadow: 0 0 0 3px rgba(29,158,117,0.12); }
        .form-row { display: flex; align-items: center; gap: 8px; }
        .form-time {
          padding: 5px 8px;
          border: 1px solid #e0e0db;
          border-radius: 8px;
          font-size: 0.875rem;
          color: #1a1a1a;
          background: #fafaf8;
          width: 110px;
          font-family: inherit;
        }
        .form-time:focus { outline: none; border-color: #1D9E75; }
        .form-hint { font-size: 0.75rem; color: #9a9a94; }
        .form-location {
          width: 100%;
          padding: 6px 8px;
          border: 1px solid #e0e0db;
          border-radius: 8px;
          font-size: 0.8rem;
          color: #1a1a1a;
          background: #fafaf8;
          box-sizing: border-box;
          font-family: inherit;
        }
        .form-location:focus { outline: none; border-color: #1D9E75; }
        .form-notes {
          width: 100%;
          padding: 6px 8px;
          border: 1px solid #e0e0db;
          border-radius: 8px;
          font-size: 0.8rem;
          color: #1a1a1a;
          background: #fafaf8;
          resize: none;
          box-sizing: border-box;
          font-family: inherit;
          line-height: 1.4;
        }
        .form-notes:focus { outline: none; border-color: #1D9E75; }
        .form-actions { display: flex; gap: 8px; justify-content: flex-end; }
        .form-cancel {
          padding: 5px 12px;
          border-radius: 8px;
          border: 1px solid #e0e0db;
          background: #f8f7f4;
          font-size: 0.8125rem;
          cursor: pointer;
          color: #3a3a3a;
          font-family: inherit;
        }
        .form-save {
          padding: 5px 14px;
          border-radius: 8px;
          border: none;
          background: #1D9E75;
          color: #fff;
          font-size: 0.8125rem;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
        }
        .form-save:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </div>
  )
}
