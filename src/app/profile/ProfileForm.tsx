'use client'
// src/app/profile/ProfileForm.tsx  — Modulo E

import { useState, useTransition } from 'react'
import { updateProfile, changePassword, deleteAccount } from './actions'
import type { Profile } from '@/types/database'
import { TRAVEL_INTERESTS, LANGUAGES, GENDERS } from '@/lib/constants'

interface Props {
  profile: Profile
  userEmail: string
}

export function ProfileForm({ profile, userEmail }: Props) {
  const [section, setSection] = useState<'info' | 'password' | 'danger'>('info')
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const [languages, setLanguages]     = useState<string[]>(profile.languages ?? [])
  const [interests, setInterests]     = useState<string[]>(profile.travel_interests ?? [])

  function toggle(list: string[], set: (v: string[]) => void, item: string) {
    set(list.includes(item) ? list.filter(x => x !== item) : [...list, item])
  }

  function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFeedback(null)
    const fd = new FormData(e.currentTarget)
    languages.forEach(l => fd.append('languages', l))
    interests.forEach(i => fd.append('travelInterests', i))
    startTransition(async () => {
      const res = await updateProfile(fd)
      setFeedback(res.error
        ? { type: 'err', text: res.error }
        : { type: 'ok',  text: 'Profilo aggiornato.' }
      )
    })
  }

  function handlePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFeedback(null)
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await changePassword(fd)
      setFeedback(res.error
        ? { type: 'err', text: res.error }
        : { type: 'ok',  text: 'Password aggiornata.' }
      )
      if (!res.error) (e.target as HTMLFormElement).reset()
    })
  }

  function handleDelete() {
    if (!confirm('Sei sicuro? Questa azione è IRREVERSIBILE e cancellerà tutti i tuoi dati e i viaggi creati da te.')) return
    startTransition(async () => { await deleteAccount() })
  }

  return (
    <div className="pf-wrap">
      {/* Tab selector */}
      <div className="pf-tabs">
        <button className={`pf-tab ${section === 'info'     ? 'active' : ''}`} onClick={() => { setSection('info');     setFeedback(null) }}>Dati personali</button>
        <button className={`pf-tab ${section === 'password' ? 'active' : ''}`} onClick={() => { setSection('password'); setFeedback(null) }}>Password</button>
        <button className={`pf-tab ${section === 'danger'   ? 'active' : ''}`} onClick={() => { setSection('danger');   setFeedback(null) }}>Account</button>
      </div>

      {feedback && (
        <div className={`pf-feedback ${feedback.type === 'ok' ? 'pf-ok' : 'pf-err'}`}>{feedback.text}</div>
      )}

      {/* ── Sezione: Dati personali ── */}
      {section === 'info' && (
        <form onSubmit={handleUpdate} className="pf-card">
          <div className="pf-field">
            <label>Nome completo</label>
            <input name="fullName" type="text" defaultValue={profile.full_name ?? ''} placeholder="Marco Rossi" />
          </div>
          <div className="pf-field-row">
            <div className="pf-field">
              <label>Data di nascita</label>
              <input name="birthDate" type="date" defaultValue={profile.birth_date ?? ''} />
            </div>
            <div className="pf-field">
              <label>Nazionalità</label>
              <input name="nationality" type="text" defaultValue={profile.nationality ?? ''} placeholder="Italiana" />
            </div>
          </div>
          <div className="pf-field">
            <label>Sesso</label>
            <select name="gender" defaultValue={profile.gender ?? ''}>
              <option value="">Non specificato</option>
              {GENDERS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </div>
          <div className="pf-field">
            <label>Email</label>
            <input type="email" value={userEmail} disabled className="pf-disabled" />
            <span className="pf-hint">L&apos;email non è modificabile qui</span>
          </div>

          <div className="pf-section-label">Lingue parlate</div>
          <div className="tag-grid">
            {LANGUAGES.map(l => (
              <button key={l} type="button"
                className={`tag-btn ${languages.includes(l) ? 'tag-active' : ''}`}
                onClick={() => toggle(languages, setLanguages, l)}>{l}</button>
            ))}
          </div>

          <div className="pf-section-label">Interessi di viaggio</div>
          <div className="tag-grid">
            {TRAVEL_INTERESTS.map(i => (
              <button key={i} type="button"
                className={`tag-btn ${interests.includes(i) ? 'tag-active' : ''}`}
                onClick={() => toggle(interests, setInterests, i)}>{i}</button>
            ))}
          </div>

          <button type="submit" className="btn-save" disabled={isPending}>
            {isPending ? 'Salvataggio…' : 'Salva modifiche'}
          </button>
        </form>
      )}

      {/* ── Sezione: Password ── */}
      {section === 'password' && (
        <form onSubmit={handlePassword} className="pf-card">
          <div className="pf-field">
            <label>Nuova password</label>
            <input name="newPassword" type="password" required minLength={8} placeholder="Min. 8 caratteri" />
          </div>
          <div className="pf-field">
            <label>Conferma nuova password</label>
            <input name="confirmPassword" type="password" required placeholder="Ripeti la nuova password" />
          </div>
          <button type="submit" className="btn-save" disabled={isPending}>
            {isPending ? 'Aggiornamento…' : 'Cambia password'}
          </button>
        </form>
      )}

      {/* ── Sezione: Account ── */}
      {section === 'danger' && (
        <div className="pf-card pf-danger-card">
          <h3 className="danger-title">Zona pericolosa</h3>
          <p className="danger-desc">
            L&apos;eliminazione dell&apos;account è permanente e rimuoverà tutti i tuoi dati,
            inclusi i viaggi che hai creato e le relative attività.
          </p>
          <button
            type="button"
            className="btn-delete"
            disabled={isPending}
            onClick={handleDelete}
          >
            {isPending ? 'Eliminazione…' : '⚠️ Elimina il mio account'}
          </button>
        </div>
      )}

      <style jsx>{`
        .pf-wrap { display: flex; flex-direction: column; gap: 0.75rem; }
        .pf-tabs { display: flex; background: #fff; border-radius: 12px; border: 1px solid #e8e8e4; overflow: hidden; }
        .pf-tab { flex: 1; padding: 0.625rem; font-size: 0.8125rem; font-weight: 500; color: #9a9a94; background: none; border: none; cursor: pointer; transition: all 0.15s; font-family: inherit; }
        .pf-tab.active { background: #1D9E75; color: #fff; }
        .pf-feedback { padding: 0.75rem 1rem; border-radius: 10px; font-size: 0.875rem; }
        .pf-ok { background: #E1F5EE; color: #0F6E56; border: 1px solid #9FE1CB; }
        .pf-err { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
        .pf-card { background: #fff; border-radius: 16px; border: 1px solid #e8e8e4; padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem; }
        .pf-field { display: flex; flex-direction: column; gap: 0.375rem; }
        .pf-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
        .pf-field label { font-size: 0.8125rem; font-weight: 500; color: #3a3a3a; }
        .pf-field input, .pf-field select { width: 100%; padding: 0.65rem 0.875rem; border: 1px solid #e0e0db; border-radius: 10px; font-size: 0.9375rem; color: #1a1a1a; background: #fafaf8; box-sizing: border-box; font-family: inherit; }
        .pf-field input:focus, .pf-field select:focus { outline: none; border-color: #1D9E75; box-shadow: 0 0 0 3px rgba(29,158,117,0.12); }
        .pf-disabled { opacity: 0.55; cursor: not-allowed; }
        .pf-hint { font-size: 0.75rem; color: #9a9a94; }
        .pf-section-label { font-size: 0.75rem; font-weight: 700; color: #9a9a94; text-transform: uppercase; letter-spacing: 0.07em; }
        .tag-grid { display: flex; flex-wrap: wrap; gap: 6px; }
        .tag-btn { padding: 5px 11px; border-radius: 99px; border: 1px solid #e0e0db; background: #f8f7f4; font-size: 0.8rem; color: #3a3a3a; cursor: pointer; transition: all 0.15s; font-family: inherit; }
        .tag-btn:hover { border-color: #1D9E75; color: #1D9E75; }
        .tag-active { background: #E1F5EE !important; border-color: #1D9E75 !important; color: #0F6E56 !important; font-weight: 600; }
        .btn-save { width: 100%; padding: 0.75rem; background: #1D9E75; color: #fff; border: none; border-radius: 10px; font-size: 0.9375rem; font-weight: 600; cursor: pointer; font-family: inherit; transition: background 0.15s; }
        .btn-save:hover { background: #0F6E56; }
        .btn-save:disabled { opacity: 0.6; cursor: not-allowed; }
        .pf-danger-card { border-color: #fecaca; }
        .danger-title { font-size: 0.9375rem; font-weight: 600; color: #b91c1c; margin: 0; }
        .danger-desc { font-size: 0.875rem; color: #6b6b6b; line-height: 1.5; margin: 0; }
        .btn-delete { width: 100%; padding: 0.75rem; background: #fef2f2; color: #b91c1c; border: 1.5px solid #fecaca; border-radius: 10px; font-size: 0.9375rem; font-weight: 600; cursor: pointer; font-family: inherit; transition: background 0.15s; }
        .btn-delete:hover { background: #fee2e2; }
        .btn-delete:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>
    </div>
  )
}
