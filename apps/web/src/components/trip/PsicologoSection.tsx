'use client'

import { useState, useEffect, useTransition, useCallback } from 'react'
import {
  getTravelerProfiles,
  generateMyTravelerProfile,
  type TravelerProfileWithMember,
} from '@/app/trip/[id]/psicologo/actions'
import type { Profile } from '@repo/shared/types/database'

interface Props {
  tripId:        string
  currentUserId: string
  members:       Profile[]
}

const TAG_LABELS: Record<string, string> = {
  explorer:          'Esploratore',
  foodie:            'Amante del cibo',
  history_buff:      'Appassionato di storia',
  culture_vulture:   'Appassionato di cultura',
  art_lover:         'Amante dell\'arte',
  nature_lover:      'Amante della natura',
  slow_traveler:     'Ritmo lento',
  adventure_seeker:  'Avventuriero',
  beach_lover:       'Amante del mare',
  city_walker:       'Camminatore urbano',
  photography:       'Fotografo',
  photographer:      'Fotografo',
  budget_traveler:   'Viaggiatore low-cost',
  luxury_seeker:     'Lusso',
  luxury_traveler:   'Viaggiatore di lusso',
  night_owl:         'Notturno',
  nightlife_lover:   'Vita notturna',
  early_bird:        'Mattiniero',
  social:            'Sociabile',
  social_butterfly:  'Social butterfly',
  introvert:         'Introverso',
  solo_traveler:     'Solitario',
  adventurer:        'Avventuriero',
  romantic:          'Romantico',
  family:            'Family traveler',
  family_oriented:   'Family traveler',
  planner:           'Pianificatore',
  spontaneous:       'Spontaneo',
  shopper:           'Shopping',
  wellness_seeker:   'Benessere',
}

const BARS_A = [
  { key: 'adventure_level'   as const, label: 'Avventura',   icon: '🧗' },
  { key: 'cultural_interest' as const, label: 'Cultura',     icon: '🏛️' },
  { key: 'food_focus'        as const, label: 'Gastronomia', icon: '🍽️' },
]
const BARS_B = [
  { key: 'pace_preference' as const, label: 'Ritmo',      icon: '⚡' },
  { key: 'social_openness' as const, label: 'Socialità',  icon: '🤝' },
  { key: 'novelty_seeking' as const, label: 'Novità',     icon: '✨' },
]

const MOBILITY_LABEL: Record<string, string> = {
  full:     '🟢 Nessuna limitazione',
  moderate: '🟡 Ritmo moderato',
  limited:  '🔴 Accessibilità richiesta',
}
const STYLE_LABEL: Record<string, string> = {
  planner:     '📋 Pianificatore',
  spontaneous: '🎲 Spontaneo',
  mixed:       '⚖️ Misto',
}
const LANG_LABEL: Record<string, string> = {
  local_only:   '🌐 Solo madre lingua',
  english_ok:   '🇬🇧 Inglese OK',
  multilingual: '🌍 Multilingue',
}

export function PsicologoSection({ tripId, currentUserId, members }: Props) {
  const [profiles,   setProfiles]     = useState<TravelerProfileWithMember[]>([])
  const [loading,    setLoading]      = useState(true)
  const [isPending,  startTransition] = useTransition()
  const [genError,   setGenError]     = useState<string | null>(null)
  const [genSuccess, setGenSuccess]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setProfiles(await getTravelerProfiles(tripId))
    setLoading(false)
  }, [tripId])

  useEffect(() => { load() }, [load])

  function handleGenerate() {
    setGenError(null)
    setGenSuccess(false)
    startTransition(async () => {
      const res = await generateMyTravelerProfile(tripId)
      if (res.error) { setGenError(res.error); return }
      setGenSuccess(true)
      await load()
      setTimeout(() => setGenSuccess(false), 3000)
    })
  }

  // Map userId → profilo generato
  const profileMap = new Map(profiles.map(p => [p.user_id, p]))

  return (
    <div className="ps-wrap">
      <div className="ps-section-header">
        <h3 className="ps-section-title">🧠 Profili Viaggiatore AI</h3>
        <p className="ps-section-desc">
          L&apos;Agente Psicologo analizza il profilo di ciascun membro per personalizzare
          i suggerimenti AI del gruppo.
        </p>
      </div>

      {genError   && <div className="ps-error">{genError}</div>}
      {genSuccess && <div className="ps-success">✓ Profilo generato! I suggerimenti AI saranno ora personalizzati.</div>}

      {loading ? (
        <div className="ps-loading">
          <div className="ps-spinner" />
          <span>Caricamento profili…</span>
        </div>
      ) : (
        <div className="ps-list">
          {members.map(member => {
            const isMe = member.id === currentUserId
            const tp   = profileMap.get(member.id) ?? null
            const initials = (member.full_name || member.username || '?')
              .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

            return (
              <div key={member.id} className={`ps-card${isMe ? ' ps-card-me' : ''}`}>

                {/* Header */}
                <div className="ps-card-header">
                  {member.avatar_url
                    ? <img src={member.avatar_url} alt={member.username} className="ps-avatar" />
                    : <div className="ps-avatar ps-avatar-init">{initials}</div>
                  }
                  <div className="ps-card-info">
                    <div className="ps-card-name">
                      {member.full_name || member.username}
                      {isMe && <span className="ps-badge-me">tu</span>}
                    </div>
                    <div className="ps-card-username">@{member.username}</div>
                  </div>
                  {/* Bottone rigenera (solo per sé) */}
                  {isMe && tp && (
                    <button
                      className="ps-regen-btn"
                      onClick={handleGenerate}
                      disabled={isPending}
                      title="Rigenera profilo"
                    >
                      {isPending ? '⏳' : '↻'}
                    </button>
                  )}
                </div>

                {tp ? (
                  <>
                    {/* Barre punteggio — gruppo A */}
                    <div className="ps-bars">
                      {BARS_A.map(bar => {
                        const val = (tp[bar.key] as number | null) ?? 0
                        return (
                          <div key={bar.key} className="ps-bar-row">
                            <span className="ps-bar-icon">{bar.icon}</span>
                            <span className="ps-bar-label">{bar.label}</span>
                            <div className="ps-bar-track">
                              {[1,2,3,4,5].map(n => (
                                <div key={n} className={`ps-bar-dot${val >= n ? ' ps-filled' : ''}`} />
                              ))}
                            </div>
                            <span className="ps-bar-val">{val}/5</span>
                          </div>
                        )
                      })}
                    </div>

                    {/* Barre punteggio — gruppo B (solo se disponibili) */}
                    {tp.pace_preference != null && (
                      <div className="ps-bars ps-bars-b">
                        {BARS_B.map(bar => {
                          const val = (tp[bar.key] as number | null) ?? 0
                          return (
                            <div key={bar.key} className="ps-bar-row">
                              <span className="ps-bar-icon">{bar.icon}</span>
                              <span className="ps-bar-label">{bar.label}</span>
                              <div className="ps-bar-track">
                                {[1,2,3,4,5].map(n => (
                                  <div key={n} className={`ps-bar-dot ps-dot-b${val >= n ? ' ps-filled-b' : ''}`} />
                                ))}
                              </div>
                              <span className="ps-bar-val">{val}/5</span>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Badge categorici (solo se disponibili) */}
                    {(tp.mobility_level || tp.travel_style || tp.language_comfort) && (
                      <div className="ps-badges">
                        {tp.mobility_level  && <span className="ps-badge">{MOBILITY_LABEL[tp.mobility_level]  ?? tp.mobility_level}</span>}
                        {tp.travel_style    && <span className="ps-badge">{STYLE_LABEL[tp.travel_style]       ?? tp.travel_style}</span>}
                        {tp.language_comfort && <span className="ps-badge">{LANG_LABEL[tp.language_comfort]   ?? tp.language_comfort}</span>}
                      </div>
                    )}

                    {/* Tag personalità */}
                    {(tp.personality_tags ?? []).length > 0 && (
                      <div className="ps-tags">
                        {(tp.personality_tags ?? []).slice(0, 5).map(tag => (
                          <span key={tag} className="ps-tag">
                            {TAG_LABELS[tag] ?? tag.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Analisi narrativa */}
                    {tp.raw_analysis && (
                      <p className="ps-analysis">{tp.raw_analysis}</p>
                    )}

                    {/* Nota ritmo (solo se disponibile) */}
                    {tp.pace_note && (
                      <p className="ps-pace-note">⏱️ {tp.pace_note}</p>
                    )}
                  </>
                ) : (
                  /* Placeholder per chi non ha ancora un profilo */
                  <div className="ps-empty-profile">
                    {isMe ? (
                      <>
                        <p className="ps-empty-label">Non hai ancora un profilo AI per questo viaggio.</p>
                        <button
                          className="ps-gen-btn"
                          onClick={handleGenerate}
                          disabled={isPending}
                        >
                          {isPending ? '⏳ Analisi in corso…' : '🧠 Genera il mio profilo'}
                        </button>
                      </>
                    ) : (
                      <p className="ps-empty-label ps-empty-other">
                        Profilo non ancora generato
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <style jsx>{`
        .ps-wrap           { display: flex; flex-direction: column; gap: 1rem; margin-top: 0.25rem; }

        .ps-section-header { display: flex; flex-direction: column; gap: 4px; }
        .ps-section-title  { font-size: 0.9375rem; font-weight: 600; color: #1a1a1a; margin: 0; }
        .ps-section-desc   { font-size: 0.8rem; color: #6b6b6b; margin: 0; line-height: 1.4; }

        .ps-error   { background: #fef2f2; color: #b91c1c; border-radius: 10px;
                      padding: 0.75rem 1rem; font-size: 0.825rem; }
        .ps-success { background: #f0fbf7; color: #0F6E56; border-radius: 10px;
                      padding: 0.75rem 1rem; font-size: 0.825rem; }

        .ps-loading { display: flex; align-items: center; gap: 8px;
                      color: #9a9a94; font-size: 0.875rem; padding: 1rem 0; }
        .ps-spinner { width: 18px; height: 18px; border: 2px solid #e8e8e4;
                      border-top-color: #1D9E75; border-radius: 50%;
                      animation: spin 0.7s linear infinite; flex-shrink: 0; }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* List */
        .ps-list { display: flex; flex-direction: column; gap: 0.75rem; }

        /* Card */
        .ps-card    { background: #fff; border: 1px solid #e8e8e4; border-radius: 16px;
                      padding: 1rem; display: flex; flex-direction: column; gap: 0.875rem; }
        .ps-card-me { border-color: #1D9E75; }

        /* Header */
        .ps-card-header { display: flex; flex-direction: row; align-items: center; gap: 10px; }
        .ps-avatar      { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
        .ps-avatar-init { background: #e0f4ee; color: #1D9E75; font-size: 0.75rem;
                          font-weight: 700; display: flex; align-items: center; justify-content: center; }
        .ps-card-info     { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
        .ps-card-name     { font-size: 0.9rem; font-weight: 600; color: #1a1a1a;
                            display: flex; align-items: center; gap: 6px; }
        .ps-card-username { font-size: 0.75rem; color: #9a9a94; }
        .ps-badge-me      { background: #1D9E75; color: #fff; font-size: 0.65rem;
                            padding: 1px 6px; border-radius: 99px; font-weight: 700; flex-shrink: 0; }
        .ps-regen-btn     { padding: 5px 9px; background: #f0f0ec; border: 1px solid #d0d0cb;
                            border-radius: 8px; font-size: 1rem; cursor: pointer; color: #6b6b6b;
                            flex-shrink: 0; font-family: inherit; line-height: 1; }
        .ps-regen-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Score bars */
        .ps-bars    { display: flex; flex-direction: column; gap: 8px; }
        .ps-bar-row { display: flex; flex-direction: row; align-items: center; gap: 8px; }
        .ps-bar-icon  { font-size: 0.9rem; width: 22px; text-align: center; flex-shrink: 0; }
        .ps-bar-label { font-size: 0.775rem; color: #4a4a4a; width: 82px; flex-shrink: 0; }
        .ps-bar-track { display: flex; flex-direction: row; gap: 4px; flex: 1; }
        .ps-bar-dot   { width: 12px; height: 12px; border-radius: 50%; background: #e8e8e4; flex-shrink: 0; }
        .ps-filled    { background: #1D9E75; }
        .ps-bar-val   { font-size: 0.7rem; color: #9a9a94; width: 24px; text-align: right; flex-shrink: 0; }

        /* Tags */
        .ps-tags { display: flex; flex-direction: row; flex-wrap: wrap; gap: 6px; }
        .ps-tag  { background: #e0f4ee; color: #0F6E56; font-size: 0.7rem; font-weight: 600;
                   padding: 3px 10px; border-radius: 99px; white-space: nowrap; }

        /* Bars group B */
        .ps-bars-b { padding-top: 4px; border-top: 1px solid #f0f0ec; }
        .ps-dot-b  { background: #e8e8e4; }
        .ps-filled-b { background: #7C3AED; }

        /* Categorical badges */
        .ps-badges { display: flex; flex-direction: row; flex-wrap: wrap; gap: 6px; }
        .ps-badge  { font-size: 0.7rem; font-weight: 500; color: #4a4a4a;
                     background: #f4f4f0; border: 1px solid #e0e0db;
                     padding: 3px 9px; border-radius: 99px; white-space: nowrap; }

        /* Analysis */
        .ps-analysis { font-size: 0.8rem; color: #4a4a4a; margin: 0; line-height: 1.5;
                       font-style: italic; border-left: 3px solid #9FE1CB; padding-left: 10px; }

        /* Pace note */
        .ps-pace-note { font-size: 0.775rem; color: #6b6b6b; margin: 0; line-height: 1.45;
                        background: #f8f7f4; border-radius: 8px; padding: 6px 10px; }

        /* Empty profile placeholder */
        .ps-empty-profile { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; }
        .ps-empty-label   { font-size: 0.825rem; color: #6b6b6b; margin: 0; }
        .ps-empty-other   { font-style: italic; color: #b0b0aa; }
        .ps-gen-btn       { padding: 0.55rem 1.25rem; background: #1D9E75; color: #fff;
                            border: none; border-radius: 10px; font-size: 0.825rem;
                            font-weight: 600; cursor: pointer; font-family: inherit; }
        .ps-gen-btn:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>
    </div>
  )
}
