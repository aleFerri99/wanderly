// ============================================================
// src/components/trip/NotesTab.tsx
// Note condivise con autosave realtime
// ============================================================
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Note, Profile } from '@/types/database'

interface Props {
  tripId: string
  currentUserId: string
}

export function NotesTab({ tripId, currentUserId }: Props) {
  const [note, setNote] = useState<Note | null>(null)
  const [content, setContent] = useState('')
  const [editor, setEditor] = useState<Profile | null>(null)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rawData } = await (supabase as any)
        .from('notes')
        .select(`*, editor:profiles!updated_by(*)`)
        .eq('trip_id', tripId)
        .single()
      const data = rawData as (Note & { editor: Profile | null }) | null
      if (data) {
        setNote(data)
        setContent(data.content ?? '')
        setEditor(data.editor ?? null)
      }
    }
    load()

    const channel = supabase.channel(`notes:${tripId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'notes',
        filter: `trip_id=eq.${tripId}`
      }, payload => {
        // Aggiorna solo se la modifica è di un altro utente
        if (payload.new.updated_by !== currentUserId) {
          setContent(payload.new.content ?? '')
          setSaveStatus('saved')
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [tripId, currentUserId, supabase])

  const save = useCallback(async (text: string) => {
    if (!note) return
    setSaveStatus('saving')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('notes').update({
      content: text,
      updated_by: currentUserId,
      updated_at: new Date().toISOString(),
    }).eq('id', note.id)
    setSaveStatus('saved')
  }, [note, currentUserId, supabase])

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value
    setContent(text)
    setSaveStatus('unsaved')

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => save(text), 1200)
  }

  const lastEdit = note?.updated_at
    ? new Date(note.updated_at).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="notes-wrap">
      <div className="notes-header">
        <h2 className="notes-title">📝 Note del gruppo</h2>
        <div className={`notes-status ${saveStatus}`}>
          {saveStatus === 'saving' && '↑ Salvataggio…'}
          {saveStatus === 'saved' && '✓ Salvato'}
          {saveStatus === 'unsaved' && '• Non salvato'}
        </div>
      </div>

      <div className="notes-card">
        <textarea
          className="notes-textarea"
          value={content}
          onChange={handleChange}
          placeholder="Scrivi note condivise qui…&#10;&#10;Es: codice WiFi hotel, orari dei bus, link prenotazioni, indirizzi utili…"
          spellCheck={false}
        />
      </div>

      {lastEdit && (
        <p className="notes-meta">
          Ultima modifica: {lastEdit}
          {editor && editor.id !== currentUserId && ` · da ${editor.full_name?.split(' ')[0] || editor.username}`}
        </p>
      )}

      <style jsx>{`
        .notes-wrap { display: flex; flex-direction: column; gap: 0.75rem; }
        .notes-header { display: flex; align-items: center; justify-content: space-between; }
        .notes-title { font-size: 0.9375rem; font-weight: 600; color: #1a1a1a; margin: 0; }
        .notes-status { font-size: 0.75rem; font-weight: 500; }
        .notes-status.saved { color: #1D9E75; }
        .notes-status.saving { color: #BA7517; }
        .notes-status.unsaved { color: #9a9a94; }
        .notes-card { background: #fff; border-radius: 16px; border: 1px solid #e8e8e4; overflow: hidden; transition: border-color 0.15s; }
        .notes-card:focus-within { border-color: #1D9E75; box-shadow: 0 0 0 3px rgba(29,158,117,0.08); }
        .notes-textarea {
          width: 100%;
          min-height: 260px;
          padding: 1rem 1.25rem;
          border: none;
          background: transparent;
          font-size: 0.9rem;
          color: #1a1a1a;
          line-height: 1.7;
          resize: vertical;
          font-family: inherit;
          box-sizing: border-box;
        }
        .notes-textarea:focus { outline: none; }
        .notes-textarea::placeholder { color: #b0b0aa; line-height: 1.7; }
        .notes-meta { font-size: 0.75rem; color: #9a9a94; text-align: right; }
      `}</style>
    </div>
  )
}
