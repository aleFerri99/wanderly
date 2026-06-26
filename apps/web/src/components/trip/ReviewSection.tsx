'use client'

import { useState, useEffect, useCallback, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { upsertReview, deleteReview } from '@/app/trip/[id]/reviews/actions'
import { useReviewsChannel } from '@/hooks/useReviewsChannel'
import type { Review, Profile } from '@repo/shared/types/database'

interface Props {
  tripId: string
  currentUserId: string
  members: Profile[]
  activityId?: string
  dayId?: string
  onAverageComputed?: (avg: number | null) => void
}

type ReviewWithReviewer = Review & { reviewer: Profile }

function scoreColor(s: number): string {
  if (s >= 9) return '#1D9E75'
  if (s >= 7) return '#5DCAA5'
  if (s >= 5) return '#BA7517'
  return '#E24B4A'
}

export function ReviewSection({
  tripId, currentUserId, members,
  activityId, dayId,
  onAverageComputed,
}: Props) {
  const supabase = createClient()
  const [reviews, setReviews] = useState<ReviewWithReviewer[]>([])
  const [expanded, setExpanded] = useState(false)
  const [myScore, setMyScore] = useState<number>(0)
  const [myContent, setMyContent] = useState('')
  const [editingMine, setEditingMine] = useState(false)
  const [isPending, startTransition] = useTransition()

  const filterCol: 'activity_id' | 'day_id' = activityId ? 'activity_id' : 'day_id'
  const filterVal = activityId ?? dayId

  const load = useCallback(async () => {
    if (!filterVal) return
    const { data } = await supabase
      .from('reviews')
      .select(`*, reviewer:profiles!user_id(*)`)
      .eq('trip_id', tripId)
      .eq(filterCol, filterVal)
      .order('created_at', { ascending: true })
    if (data) setReviews(data as ReviewWithReviewer[])
  }, [tripId, filterCol, filterVal, supabase])

  useEffect(() => { load() }, [load])

  // Sottoscrizione condivisa: un solo canale per viaggio, smistato per attività
  useReviewsChannel(tripId, filterCol, filterVal, load)

  // Notifica il punteggio medio al componente padre
  useEffect(() => {
    if (!onAverageComputed) return
    const avg = reviews.length
      ? reviews.reduce((s, r) => s + r.score, 0) / reviews.length
      : null
    onAverageComputed(avg)
  }, [reviews, onAverageComputed])

  const myReview = reviews.find(r => r.user_id === currentUserId)
  const average  = reviews.length
    ? reviews.reduce((s, r) => s + r.score, 0) / reviews.length
    : null

  function startEdit() {
    setMyScore(myReview?.score ?? 0)
    setMyContent(myReview?.content ?? '')
    setEditingMine(true)
  }

  function handleSave() {
    if (myScore < 1 || myScore > 10) return
    startTransition(async () => {
      await upsertReview(tripId, myScore, myContent || null, activityId, dayId)
      setEditingMine(false)
    })
  }

  function handleDelete() {
    if (!myReview) return
    startTransition(async () => {
      await deleteReview(tripId, myReview.id)
      setEditingMine(false)
    })
  }

  return (
    <div className="rv-wrap">
      {/* Toggle header */}
      <button className="rv-toggle" onClick={() => setExpanded(e => !e)}>
        {average !== null && (
          <span className="rv-avg" style={{ color: scoreColor(average) }}>
            ★ {average.toFixed(1)}
          </span>
        )}
        <span className="rv-label">
          {reviews.length === 0 ? 'Aggiungi recensione' : `Recensioni (${reviews.length})`}
        </span>
        <span className="rv-chevron">{expanded ? '▴' : '▾'}</span>
      </button>

      {expanded && (
        <div className="rv-body">
          {/* Lista recensioni per utente */}
          {reviews.length > 0 && (
            <div className="rv-list">
              {reviews.map(r => {
                const p = r.reviewer
                const isMe = r.user_id === currentUserId
                const initials = (p?.full_name || p?.username || '?')
                  .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
                return (
                  <div key={r.id} className="rv-item">
                    <div className="rv-item-header">
                      <div className="rv-avatar">{initials}</div>
                      <div className="rv-meta">
                        <span className="rv-username">
                          {isMe ? 'Tu' : (p?.full_name?.split(' ')[0] || p?.username)}
                        </span>
                        <span className="rv-score" style={{ color: scoreColor(r.score) }}>
                          ★ {r.score}/10
                        </span>
                      </div>
                      {isMe && !editingMine && (
                        <button className="rv-edit-btn" onClick={startEdit}>✏️</button>
                      )}
                    </div>
                    {r.content && <p className="rv-content">{r.content}</p>}
                  </div>
                )
              })}
            </div>
          )}

          {/* Form: aggiungi o modifica la mia recensione */}
          {(editingMine || !myReview) && (
            <div className="rv-form">
              <p className="rv-form-title">
                {myReview ? 'Modifica la tua recensione' : 'La tua recensione'}
              </p>

              {/* Selettore punteggio 1-10 */}
              <div className="rv-score-grid">
                {[1,2,3,4,5,6,7,8,9,10].map(n => (
                  <button
                    key={n}
                    type="button"
                    className={`rv-score-btn ${myScore === n ? 'rv-score-selected' : ''}`}
                    style={myScore === n ? { background: scoreColor(n), borderColor: scoreColor(n) } : {}}
                    onClick={() => setMyScore(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>

              <textarea
                className="rv-textarea"
                value={myContent}
                onChange={e => setMyContent(e.target.value)}
                placeholder="Aggiungi un commento (opzionale)…"
                rows={2}
              />

              <div className="rv-form-actions">
                {myReview && (
                  <button className="rv-delete" onClick={handleDelete} disabled={isPending}>
                    Elimina
                  </button>
                )}
                <button className="rv-cancel" onClick={() => setEditingMine(false)}>
                  Annulla
                </button>
                <button
                  className="rv-save"
                  onClick={handleSave}
                  disabled={isPending || myScore === 0}
                >
                  {isPending ? '…' : 'Salva'}
                </button>
              </div>
            </div>
          )}

          {/* Pulsante aggiungi se non ho ancora recensito e non sto editando */}
          {!myReview && !editingMine && (
            <button className="rv-add-btn" onClick={startEdit}>
              + Aggiungi la tua recensione
            </button>
          )}
        </div>
      )}

      <style jsx>{`
        .rv-wrap { margin-top: 6px; }

        /* Toggle */
        .rv-toggle { width: 100%; display: flex; align-items: center; gap: 6px; background: none; border: none; cursor: pointer; padding: 4px 0; font-family: inherit; }
        .rv-avg { font-size: 0.75rem; font-weight: 700; font-variant-numeric: tabular-nums; flex-shrink: 0; }
        .rv-label { font-size: 0.75rem; color: #9a9a94; flex: 1; text-align: left; }
        .rv-chevron { font-size: 0.6rem; color: #b0b0aa; }

        /* Body */
        .rv-body { display: flex; flex-direction: column; gap: 8px; padding-top: 6px; border-top: 1px solid #f0f0ec; margin-top: 4px; }

        /* Lista */
        .rv-list { display: flex; flex-direction: column; gap: 8px; }
        .rv-item { background: #f8f7f4; border-radius: 10px; padding: 8px 10px; }
        .rv-item-header { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; }
        .rv-avatar { width: 24px; height: 24px; border-radius: 50%; background: #1D9E75; display: flex; align-items: center; justify-content: center; font-size: 0.6rem; font-weight: 700; color: #fff; flex-shrink: 0; }
        .rv-meta { flex: 1; display: flex; align-items: center; gap: 8px; }
        .rv-username { font-size: 0.8rem; font-weight: 600; color: #1a1a1a; }
        .rv-score { font-size: 0.75rem; font-weight: 700; font-variant-numeric: tabular-nums; }
        .rv-edit-btn { background: none; border: none; cursor: pointer; font-size: 0.75rem; padding: 2px; }
        .rv-content { font-size: 0.775rem; color: #6b6b6b; margin: 0; line-height: 1.4; }

        /* Form */
        .rv-form { background: #f8f7f4; border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; border: 1px solid #e0e0db; }
        .rv-form-title { font-size: 0.8rem; font-weight: 600; color: #3a3a3a; margin: 0; }
        .rv-score-grid { display: flex; gap: 4px; }
        .rv-score-btn { flex: 1; padding: 6px 2px; border-radius: 8px; border: 1px solid #e0e0db; background: #fff; font-size: 0.8rem; font-weight: 600; color: #6b6b6b; cursor: pointer; transition: all 0.12s; font-family: inherit; }
        .rv-score-btn:hover { border-color: #1D9E75; color: #1D9E75; }
        .rv-score-selected { color: #fff !important; }
        .rv-textarea { width: 100%; padding: 6px 8px; border: 1px solid #e0e0db; border-radius: 8px; font-size: 0.8rem; color: #1a1a1a; background: #fff; resize: none; box-sizing: border-box; font-family: inherit; line-height: 1.4; }
        .rv-textarea:focus { outline: none; border-color: #1D9E75; }
        .rv-form-actions { display: flex; gap: 6px; justify-content: flex-end; }
        .rv-delete { padding: 4px 10px; border-radius: 8px; border: 1px solid #fecaca; background: #fef2f2; font-size: 0.775rem; color: #b91c1c; cursor: pointer; font-family: inherit; margin-right: auto; }
        .rv-cancel { padding: 4px 10px; border-radius: 8px; border: 1px solid #e0e0db; background: #f8f7f4; font-size: 0.775rem; color: #3a3a3a; cursor: pointer; font-family: inherit; }
        .rv-save { padding: 4px 14px; border-radius: 8px; border: none; background: #1D9E75; color: #fff; font-size: 0.775rem; font-weight: 600; cursor: pointer; font-family: inherit; }
        .rv-save:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Add button */
        .rv-add-btn { width: 100%; padding: 5px; background: none; border: 1px dashed #d0d0cb; border-radius: 8px; font-size: 0.775rem; color: #9a9a94; cursor: pointer; font-family: inherit; transition: all 0.15s; }
        .rv-add-btn:hover { border-color: #1D9E75; color: #1D9E75; }
      `}</style>
    </div>
  )
}
