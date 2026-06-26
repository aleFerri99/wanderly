'use client'
// Modulo O — Bacheca Note & Task Collaborativa

import { useState, useEffect, useRef, useCallback, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  addBoardItem,
  completeBoardTask,
  deleteBoardItem,
  togglePackingItem,
} from '@/app/trip/[id]/notes/actions'
import type { GroupBoardItem, Profile } from '@repo/shared/types/database'

interface Props {
  tripId:        string
  currentUserId: string
  members:       Profile[]
}

type Filter = 'tutti' | 'nota' | 'task'

function Avatar({ profile }: { profile: Pick<Profile, 'username' | 'full_name' | 'avatar_url'> | undefined }) {
  if (!profile) return <div className="gb-av gb-av-placeholder">?</div>
  const initials = (profile.full_name || profile.username || '?')
    .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  return profile.avatar_url
    ? <img className="gb-av" src={profile.avatar_url} alt={profile.username} />
    : <div className="gb-av">{initials}</div>
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60000)
  if (mins < 1)  return 'adesso'
  if (mins < 60) return `${mins}min fa`
  const h = Math.floor(mins / 60)
  if (h < 24)    return `${h}h fa`
  const d = Math.floor(h / 24)
  return d === 1 ? 'ieri' : `${d}gg fa`
}

export function GroupBoard({ tripId, currentUserId, members }: Props) {
  const supabase = createClient()
  const [items,        setItems]        = useState<GroupBoardItem[]>([])
  const [filter,       setFilter]       = useState<Filter>('tutti')
  const [loading,      setLoading]      = useState(true)
  const [newType,      setNewType]      = useState<'nota' | 'task'>('nota')
  const [newText,      setNewText]      = useState('')
  const [addError,     setAddError]     = useState<string | null>(null)
  const [isPending,    startTransition] = useTransition()
  // Ottimismi locali
  const [completing,   setCompleting]   = useState<Set<string>>(new Set())
  const [deleting,     setDeleting]     = useState<Set<string>>(new Set())
  const [packingDone,  setPackingDone]  = useState(false)
  // Ref per tracciare i task in completamento nel closure del Realtime handler
  const completingRef = useRef<Set<string>>(new Set())

  const profileMap = new Map(members.map(m => [m.id, m]))

  // Fetch client-side: bypassa la cache Next.js
  const load = useCallback(async () => {
    setLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('group_board')
      .select(`
        *,
        creator:profiles!created_by(id, username, full_name, avatar_url),
        completer:profiles!completed_by(id, username, full_name)
      `)
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false })
    setItems((data ?? []) as GroupBoardItem[])
    setLoading(false)
  }, [tripId, supabase])

  useEffect(() => {
    load()

    const channel = supabase
      .channel(`group_board:${tripId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'group_board',
        filter: `trip_id=eq.${tripId}`,
      }, () => load())
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'group_board',
        filter: `trip_id=eq.${tripId}`,
      }, (payload) => {
        const deletedId = (payload.old as { id: string }).id
        if (completingRef.current.has(deletedId)) {
          // Siamo noi che stiamo completando: lascia scorrere l'animazione (setTimeout attivo)
          return
        }
        // Qualcun altro ha eliminato o completato il task: rimuovi subito
        setItems(prev => {
          const item = prev.find(it => it.id === deletedId)
          if (!item) return prev
          // Le voci packing sono personali e gestite solo localmente: ignora
          if (item.content_type === 'packing') return prev
          // Se era un task, mostra brevemente "completato da altri" poi rimuovi
          if (item.content_type === 'task') {
            setTimeout(() => setItems(p => p.filter(it => it.id !== deletedId)), 1000)
            return prev.map(it => it.id === deletedId
              ? { ...it, is_completed: true }
              : it
            )
          }
          return prev.filter(it => it.id !== deletedId)
        })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId])

  function handleAdd() {
    if (!newText.trim()) return
    setAddError(null)
    startTransition(async () => {
      const res = await addBoardItem(tripId, newType, newText)
      if (res.error) { setAddError(res.error); return }
      setNewText('')
    })
  }

  async function handleComplete(itemId: string) {
    // Registra nei ref prima di tutto (usato dal Realtime DELETE handler)
    completingRef.current.add(itemId)
    setCompleting(p => new Set([...p, itemId]))

    // Ottimismo: mostra "completato" subito
    setItems(prev => prev.map(it =>
      it.id === itemId
        ? { ...it, is_completed: true, completed_by: currentUserId }
        : it
    ))

    // Rimuove dopo 1.2s — server action + Realtime DELETE arrivano di solito prima,
    // ma il Realtime handler li ignora grazie al ref, quindi questo setTimeout
    // è la sorgente di verità per la nostra animazione
    setTimeout(() => {
      setItems(prev => prev.filter(it => it.id !== itemId))
      completingRef.current.delete(itemId)
      setCompleting(p => { const n = new Set(p); n.delete(itemId); return n })
    }, 1200)

    const res = await completeBoardTask(tripId, itemId)
    if (res.alreadyDone || res.error) {
      // Qualcun altro ha già completato: annulla l'ottimismo e ricarica
      completingRef.current.delete(itemId)
      setCompleting(p => { const n = new Set(p); n.delete(itemId); return n })
      load()
    }
  }

  async function handleDelete(itemId: string) {
    setDeleting(p => new Set([...p, itemId]))
    setItems(prev => prev.filter(it => it.id !== itemId))
    const res = await deleteBoardItem(tripId, itemId)
    if (res.error) await load()
    setDeleting(p => { const n = new Set(p); n.delete(itemId); return n })
  }

  async function handleTogglePacking(itemId: string) {
    const item = items.find(it => it.id === itemId)
    if (!item) return
    const nowCompleted = !item.is_completed

    // Ottimismo locale
    setItems(prev => prev.map(it =>
      it.id === itemId
        ? { ...it, is_completed: nowCompleted, completed_by: nowCompleted ? currentUserId : null }
        : it
    ))

    const res = await togglePackingItem(tripId, itemId, nowCompleted)
    if (res.allDone) {
      // Tutta la valigia spuntata → mostra "pronta!" poi rimuovi il blocco
      setPackingDone(true)
      setTimeout(() => {
        setItems(prev => prev.filter(it => it.content_type !== 'packing'))
        setPackingDone(false)
      }, 1600)
    } else if (res.error) {
      load()
    }
  }

  // Voci packing personali (solo le mie, già filtrate da RLS)
  const packingItems = items
    .filter(it => it.content_type === 'packing')
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  const packingTotal = packingItems.length
  const packingDoneCount = packingItems.filter(it => it.is_completed).length

  // Bacheca condivisa (note + task)
  const boardItems = items.filter(it => it.content_type !== 'packing')
  const visible = boardItems.filter(it => {
    if (filter === 'nota')  return it.content_type === 'nota'
    if (filter === 'task')  return it.content_type === 'task' && !it.is_completed
    return true
  })

  return (
    <div className="gb-wrap">
      {/* Header + Filter Chips */}
      <div className="gb-header">
        <h2 className="gb-title">📋 Bacheca del gruppo</h2>
      </div>

      {/* 🎒 Packing list personale */}
      {!loading && (packingTotal > 0 || packingDone) && (
        <div className={`pk-card${packingDone ? ' pk-card-ready' : ''}`}>
          {packingDone ? (
            <div className="pk-ready">🎉 Valigia pronta! Buon viaggio ✈️</div>
          ) : (
            <>
              <div className="pk-head">
                <span className="pk-title">🎒 La tua valigia</span>
                <span className="pk-count">{packingDoneCount}/{packingTotal}</span>
              </div>
              <div className="pk-progress">
                <div className="pk-progress-fill" style={{ width: `${packingTotal ? (packingDoneCount / packingTotal) * 100 : 0}%` }} />
              </div>
              <div className="pk-list">
                {packingItems.map(it => (
                  <button
                    key={it.id}
                    className={`pk-item${it.is_completed ? ' pk-item-done' : ''}`}
                    onClick={() => handleTogglePacking(it.id)}
                  >
                    <span className={`pk-check${it.is_completed ? ' pk-check-on' : ''}`}>
                      {it.is_completed ? '✓' : ''}
                    </span>
                    <span className="pk-text">{it.text_content}</span>
                  </button>
                ))}
              </div>
              <p className="pk-hint">Spunta tutto e la lista sparirà 👋</p>
            </>
          )}
        </div>
      )}

      <div className="gb-chips">
        {([['tutti', 'Tutti'], ['nota', '📌 Note'], ['task', '☑ Task da fare']] as [Filter, string][]).map(([f, label]) => (
          <button
            key={f}
            className={`gb-chip${filter === f ? ' gb-chip-active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Lista card */}
      {loading ? (
        <div className="gb-loading">
          <div className="gb-spinner" />
          <span>Caricamento…</span>
        </div>
      ) : visible.length === 0 ? (
        <div className="gb-empty">
          <span className="gb-empty-icon">{filter === 'nota' ? '📌' : filter === 'task' ? '☑' : '📋'}</span>
          <p>Nessun elemento. Aggiungine uno qui sotto!</p>
        </div>
      ) : (
        <div className="gb-list">
          {visible.map(item => {
            const creator   = item.creator ?? profileMap.get(item.created_by)
            const completer = item.completed_by
              ? (item.completer ?? profileMap.get(item.completed_by))
              : null
            const isMe     = item.created_by === currentUserId
            const isTask   = item.content_type === 'task'
            const isDone   = item.is_completed
            const isComp   = completing.has(item.id)

            return (
              <div
                key={item.id}
                className={`gb-card gb-card-${item.content_type}${isDone ? ' gb-card-done' : ''}`}
              >
                {/* Creator row */}
                <div className="gb-card-meta">
                  <Avatar profile={creator} />
                  <span className="gb-card-author">
                    {creator
                      ? (creator.id === currentUserId ? 'tu' : creator.full_name ?? `@${creator.username}`)
                      : 'Sconosciuto'}
                  </span>
                  <span className="gb-card-time">{timeAgo(item.created_at)}</span>
                  {isMe && (
                    <button
                      className="gb-del-btn"
                      onClick={() => handleDelete(item.id)}
                      disabled={deleting.has(item.id)}
                      aria-label="Elimina"
                    >🗑</button>
                  )}
                </div>

                {/* Content */}
                <div className="gb-card-body">
                  {isTask && (
                    <button
                      className={`gb-checkbox${isDone ? ' gb-checkbox-done' : ''}`}
                      onClick={() => !isDone && handleComplete(item.id)}
                      disabled={isDone || isComp}
                      aria-label={isDone ? 'Completato' : 'Segna come completato'}
                    >
                      {isDone ? '✓' : ''}
                    </button>
                  )}
                  <span className={`gb-card-text${isDone ? ' gb-text-done' : ''}`}>
                    {item.text_content}
                  </span>
                </div>

                {/* Completato da */}
                {isDone && completer && (
                  <p className="gb-completed-by">
                    ✅ Completato da {completer.id === currentUserId ? 'te' : (completer.full_name ?? `@${completer.username}`)} · +5pt
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Form aggiunta */}
      <div className="gb-add-form">
        <div className="gb-add-type">
          <button
            className={`gb-type-btn${newType === 'nota' ? ' gb-type-active' : ''}`}
            onClick={() => setNewType('nota')}
          >📌 Nota</button>
          <button
            className={`gb-type-btn${newType === 'task' ? ' gb-type-active' : ''}`}
            onClick={() => setNewType('task')}
          >☑ Task</button>
        </div>
        <div className="gb-add-row">
          <input
            className="gb-add-input"
            value={newText}
            onChange={e => setNewText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleAdd()}
            placeholder={newType === 'nota' ? 'WiFi, link prenotazione, appunto…' : 'Cosa deve fare il gruppo?'}
          />
          <button className="gb-add-btn" onClick={handleAdd} disabled={isPending || !newText.trim()}>
            {isPending ? '…' : '→'}
          </button>
        </div>
        {addError && <p className="gb-add-err">{addError}</p>}
      </div>

      <style jsx>{`
        .gb-wrap  { display: flex; flex-direction: column; gap: 0.75rem; }
        .gb-header { display: flex; align-items: center; justify-content: space-between; }
        .gb-title { font-size: 0.9375rem; font-weight: 700; color: var(--md-on-surface,#18181B); margin: 0; }

        /* Filter chips */
        .gb-chips { display: flex; gap: 6px; flex-wrap: wrap; }
        .gb-chip {
          padding: 5px 14px; border-radius: var(--md-radius-full);
          border: 1.5px solid var(--md-outline-variant,#D4D4D8);
          background: var(--md-surface,#FAFAFA);
          font-size: 0.8rem; font-weight: 500; color: var(--md-on-surface-variant,#52525B);
          cursor: pointer; font-family: inherit; transition: all 0.15s;
        }
        .gb-chip-active {
          background: var(--md-primary,#7C3AED); color: #fff;
          border-color: var(--md-primary,#7C3AED);
        }

        /* Loading / empty */
        .gb-loading { display: flex; align-items: center; gap: 8px; padding: 2rem; justify-content: center; color: var(--md-on-surface-variant,#52525B); font-size: 0.875rem; }
        .gb-spinner { width: 20px; height: 20px; border: 2.5px solid var(--md-surface-container,#EEECF8); border-top-color: var(--md-primary,#7C3AED); border-radius: 50%; animation: spin 0.7s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .gb-empty { text-align: center; padding: 2rem 1rem; display: flex; flex-direction: column; align-items: center; gap: 8px; }
        .gb-empty-icon { font-size: 2rem; }
        .gb-empty p { font-size: 0.875rem; color: var(--md-on-surface-variant,#52525B); margin: 0; }

        /* Card list */
        .gb-list { display: flex; flex-direction: column; gap: 10px; }

        /* Card base */
        .gb-card {
          border-radius: var(--md-radius-l,16px);
          padding: 12px 14px;
          display: flex; flex-direction: column; gap: 8px;
          border-left: 4px solid transparent;
          box-shadow: var(--md-elevation-1);
          background: var(--md-surface,#FAFAFA);
          transition: opacity 0.3s;
        }
        .gb-card-nota { border-left-color: var(--md-secondary,#D97706); background: #FFFBEB; }
        .gb-card-task { border-left-color: var(--md-primary,#7C3AED); }
        .gb-card-done { opacity: 0.58; background: var(--md-surface-container-low,#F4F4F5); border-left-color: var(--md-tertiary,#0D9488); }

        /* Meta row */
        .gb-card-meta { display: flex; align-items: center; gap: 7px; }
        :global(.gb-av) {
          width: 24px; height: 24px; border-radius: 50%; object-fit: cover; flex-shrink: 0;
          background: var(--md-primary-container,#EDE9FE); color: var(--md-primary,#7C3AED);
          font-size: 0.6rem; font-weight: 700; display: flex; align-items: center; justify-content: center;
        }
        .gb-card-author { font-size: 0.75rem; font-weight: 600; color: var(--md-on-surface,#18181B); }
        .gb-card-time   { font-size: 0.7rem; color: var(--md-on-surface-variant,#52525B); flex: 1; }
        .gb-del-btn { background: none; border: none; cursor: pointer; font-size: 0.875rem; padding: 2px 4px; border-radius: 4px; opacity: 0.55; transition: opacity 0.15s; }
        .gb-del-btn:hover { opacity: 1; }
        .gb-del-btn:disabled { opacity: 0.25; cursor: not-allowed; }

        /* Card body */
        .gb-card-body { display: flex; align-items: flex-start; gap: 10px; }
        .gb-checkbox {
          width: 20px; height: 20px; border-radius: 4px; flex-shrink: 0;
          border: 2px solid var(--md-primary,#7C3AED);
          background: transparent; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          font-size: 0.75rem; font-weight: 800; color: #fff;
          transition: all 0.15s; margin-top: 1px;
        }
        .gb-checkbox-done { background: var(--md-tertiary,#0D9488); border-color: var(--md-tertiary,#0D9488); cursor: default; }
        .gb-checkbox:hover:not(.gb-checkbox-done):not(:disabled) { background: var(--md-primary-container,#EDE9FE); }
        .gb-card-text { font-size: 0.875rem; color: var(--md-on-surface,#18181B); line-height: 1.5; flex: 1; }
        .gb-text-done { text-decoration: line-through; color: var(--md-on-surface-variant,#52525B); }
        .gb-completed-by { font-size: 0.72rem; color: var(--md-tertiary,#0D9488); font-weight: 600; margin: 0; }

        /* Add form */
        .gb-add-form {
          background: var(--md-surface,#FAFAFA);
          border-radius: var(--md-radius-l,16px);
          border: 1.5px solid var(--md-outline-variant,#D4D4D8);
          padding: 12px 14px; display: flex; flex-direction: column; gap: 8px;
        }
        .gb-add-type { display: flex; gap: 6px; }
        .gb-type-btn {
          flex: 1; padding: 5px 10px; border-radius: var(--md-radius-full);
          border: 1.5px solid var(--md-outline-variant,#D4D4D8);
          background: transparent; font-size: 0.78rem; font-weight: 600;
          color: var(--md-on-surface-variant,#52525B);
          cursor: pointer; font-family: inherit; transition: all 0.15s;
        }
        .gb-type-active.gb-type-btn:first-child { background: #FEF3C7; border-color: var(--md-secondary,#D97706); color: #92400E; }
        .gb-type-active.gb-type-btn:last-child  { background: var(--md-primary-container,#EDE9FE); border-color: var(--md-primary,#7C3AED); color: var(--md-primary,#7C3AED); }
        .gb-add-row { display: flex; gap: 8px; }
        .gb-add-input {
          flex: 1; padding: 8px 12px;
          border: 1.5px solid var(--md-outline-variant,#D4D4D8);
          border-radius: var(--md-radius-m,12px);
          font-size: 0.875rem; color: var(--md-on-surface,#18181B);
          background: var(--md-surface-container-low,#F4F4F5);
          font-family: inherit;
        }
        .gb-add-input:focus { outline: none; border-color: var(--md-primary,#7C3AED); box-shadow: 0 0 0 3px rgba(124,58,237,0.12); background: var(--md-surface,#FAFAFA); }
        .gb-add-btn {
          width: 40px; height: 40px; border-radius: var(--md-radius-m,12px);
          background: var(--md-primary,#7C3AED); color: #fff; border: none;
          font-size: 1rem; font-weight: 700; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; transition: opacity 0.15s;
        }
        .gb-add-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .gb-add-err { font-size: 0.75rem; color: var(--md-error,#DC2626); margin: 0; }

        /* ── Packing list personale ── */
        .pk-card {
          background: linear-gradient(135deg, var(--md-primary-container,#EDE9FE), var(--md-tertiary-container,#CCFBF1));
          border-radius: var(--md-radius-xl,24px);
          padding: 14px 16px; display: flex; flex-direction: column; gap: 10px;
          box-shadow: var(--md-elevation-1);
        }
        .pk-card-ready { background: var(--md-tertiary-container,#CCFBF1); }
        .pk-ready { font-size: 0.95rem; font-weight: 700; color: var(--md-tertiary,#0D9488); text-align: center; padding: 8px 0; }
        .pk-head { display: flex; align-items: center; justify-content: space-between; }
        .pk-title { font-size: 0.9rem; font-weight: 700; color: var(--md-on-surface,#18181B); }
        .pk-count { font-size: 0.8rem; font-weight: 700; color: var(--md-primary,#7C3AED); background: rgba(255,255,255,0.6); padding: 2px 10px; border-radius: var(--md-radius-full); font-variant-numeric: tabular-nums; }
        .pk-progress { height: 6px; background: rgba(255,255,255,0.55); border-radius: var(--md-radius-full); overflow: hidden; }
        .pk-progress-fill { height: 100%; background: var(--md-primary,#7C3AED); border-radius: var(--md-radius-full); transition: width 0.4s ease; }
        .pk-list { display: flex; flex-direction: column; gap: 4px; }
        .pk-item {
          display: flex; align-items: center; gap: 10px;
          background: rgba(255,255,255,0.7); border: none;
          border-radius: var(--md-radius-m,12px); padding: 8px 10px;
          cursor: pointer; font-family: inherit; text-align: left;
          transition: background 0.15s;
        }
        .pk-item:hover { background: rgba(255,255,255,0.95); }
        .pk-item-done { opacity: 0.55; }
        .pk-check {
          width: 19px; height: 19px; flex-shrink: 0; border-radius: 5px;
          border: 2px solid var(--md-primary,#7C3AED); background: transparent;
          display: flex; align-items: center; justify-content: center;
          font-size: 0.7rem; font-weight: 800; color: #fff;
        }
        .pk-check-on { background: var(--md-tertiary,#0D9488); border-color: var(--md-tertiary,#0D9488); }
        .pk-text { font-size: 0.825rem; color: var(--md-on-surface,#18181B); line-height: 1.4; }
        .pk-item-done .pk-text { text-decoration: line-through; }
        .pk-hint { font-size: 0.7rem; color: var(--md-on-surface-variant,#52525B); margin: 0; text-align: center; }
      `}</style>
    </div>
  )
}
