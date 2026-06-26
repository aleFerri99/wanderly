'use client'
// src/app/profile/ProfileForm.tsx  — Modulo E

import { useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { updateProfile, changePassword, deleteAccount } from './actions'
import type { Profile } from '@repo/shared/types/database'
import { TRAVEL_INTERESTS, LANGUAGES, GENDERS } from '@repo/shared/constants'


// Passaporto caricato lazy — react-simple-maps è client-only
const PassportSection = dynamic(
  () => import('@/components/profile/PassportSection').then(m => m.PassportSection),
  { ssr: false, loading: () => <p style={{ padding: '1rem', color: 'var(--md-on-surface-variant,#52525B)' }}>Caricamento passaporto…</p> }
)

interface Props {
  profile: Profile
  userEmail: string
}

export function ProfileForm({ profile, userEmail }: Props) {
  const [section, setSection] = useState<'info' | 'passaporto' | 'password' | 'danger'>('info')
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
        <button className={`pf-tab ${section === 'info'       ? 'active' : ''}`} onClick={() => { setSection('info');       setFeedback(null) }}>Dati</button>
        <button className={`pf-tab ${section === 'passaporto' ? 'active' : ''}`} onClick={() => { setSection('passaporto'); setFeedback(null) }}>🌍 Passaporto</button>
        <button className={`pf-tab ${section === 'password'   ? 'active' : ''}`} onClick={() => { setSection('password');   setFeedback(null) }}>Password</button>
        <button className={`pf-tab ${section === 'danger'     ? 'active' : ''}`} onClick={() => { setSection('danger');     setFeedback(null) }}>Account</button>
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
              <label>Anno di nascita</label>
              <input
                name="birthDate"
                type="number"
                min={1900}
                max={new Date().getFullYear() - 13}
                placeholder="es. 1995"
                defaultValue={profile.birth_date ?? ''}
              />
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

          <div className="pf-field">
            <label>✈️ Note per il prossimo viaggio</label>
            <textarea
              name="tripNotes"
              rows={3}
              placeholder="es. Questa volta voglio rilassarmi al mare, niente attività intense. Preferisco il pesce fresco e i tramonti sul lungomare."
              defaultValue={profile.trip_notes ?? ''}
            />
            <span className="pf-hint">Lo Psicologo AI legge queste note e le usa come priorità assoluta — aggiornale prima di ogni viaggio.</span>
          </div>

          <button type="submit" className="btn-save" disabled={isPending}>
            {isPending ? 'Salvataggio…' : 'Salva modifiche'}
          </button>
        </form>
      )}

      {/* ── Sezione: Passaporto ── */}
      {section === 'passaporto' && (
        <PassportSection />
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
        /* ── Wrapper ── */
        .pf-wrap { display: flex; flex-direction: column; gap: 0.75rem; }

        /* ── Section tabs — M3 Secondary Navigation ── */
        .pf-tabs { display: flex; background: var(--md-surface, #FAFAFA); border-radius: var(--md-radius-full); border: 1.5px solid var(--md-outline-variant, #D4D4D8); padding: 3px; gap: 3px; }
        .pf-tab { flex: 1; padding: 7px 8px; border-radius: var(--md-radius-full); font-size: 0.8125rem; font-weight: 600; color: var(--md-on-surface-variant, #52525B); background: none; border: none; cursor: pointer; transition: all 0.2s; font-family: inherit; }
        .pf-tab.active { background: var(--md-primary, #7C3AED); color: #fff; }
        .pf-tab:hover:not(.active) { background: var(--md-primary-container, #EDE9FE); color: var(--md-primary, #7C3AED); }

        /* ── Feedback ── */
        .pf-feedback { padding: 0.75rem 1rem; border-radius: var(--md-radius-m, 12px); font-size: 0.875rem; }
        .pf-ok  { background: var(--md-tertiary-container, #CCFBF1); color: var(--md-tertiary, #0D9488); }
        .pf-err { background: var(--md-error-container, #FEE2E2);    color: var(--md-error, #DC2626); }

        /* ── Card form ── */
        .pf-card { background: var(--md-surface, #FAFAFA); border-radius: var(--md-radius-xl, 24px); border: none; box-shadow: var(--md-elevation-1); padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem; }

        /* ── Form fields — M3 Outlined TextField ── */
        .pf-field { display: flex; flex-direction: column; gap: 0.4rem; }
        .pf-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
        .pf-field label { font-size: 0.75rem; font-weight: 700; color: var(--md-primary, #7C3AED); text-transform: uppercase; letter-spacing: 0.06em; }
        .pf-field input, .pf-field select, .pf-field textarea {
          width: 100%; padding: 0.75rem 1rem;
          border: 1.5px solid var(--md-outline-variant, #D4D4D8);
          border-radius: var(--md-radius-m, 12px);
          font-size: 0.9375rem; color: var(--md-on-surface, #18181B);
          background: var(--md-surface-container-low, #F4F4F5);
          box-sizing: border-box; font-family: inherit;
          transition: border-color 0.15s; resize: vertical;
        }
        .pf-field input:focus, .pf-field select:focus, .pf-field textarea:focus {
          outline: none; border-color: var(--md-primary, #7C3AED);
          box-shadow: 0 0 0 3px rgba(124,58,237,0.15);
          background: var(--md-surface, #FAFAFA);
        }
        .pf-disabled { opacity: 0.55; cursor: not-allowed; }
        .pf-hint { font-size: 0.75rem; color: var(--md-on-surface-variant, #52525B); }

        /* ── Section label ── */
        .pf-section-label { font-size: 0.75rem; font-weight: 700; color: var(--md-on-surface-variant, #52525B); text-transform: uppercase; letter-spacing: 0.07em; }

        /* ── M3 Filter Chips (lingue + interessi) ── */
        .tag-grid { display: flex; flex-wrap: wrap; gap: 8px; }
        .tag-btn {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 6px 14px;
          border-radius: var(--md-radius-full);
          border: 1.5px solid var(--md-outline-variant, #D4D4D8);
          background: var(--md-surface, #FAFAFA);
          font-size: 0.8125rem; font-weight: 500;
          color: var(--md-on-surface-variant, #52525B);
          cursor: pointer; transition: all 0.18s;
          font-family: inherit;
        }
        .tag-btn:hover {
          border-color: var(--md-secondary, #D97706);
          color: var(--md-secondary, #D97706);
          background: var(--md-secondary-container, #FEF3C7);
        }
        /* Selected: M3 Filter Chip with checkmark */
        .tag-active {
          background: var(--md-secondary-container, #FEF3C7) !important;
          border-color: var(--md-secondary, #D97706) !important;
          color: var(--md-on-secondary-container, #451A00) !important;
          font-weight: 700;
        }
        .tag-active::before {
          content: '✓';
          font-size: 0.75rem; font-weight: 700;
          color: var(--md-secondary, #D97706);
        }

        /* ── Save button — M3 Filled Button ── */
        .btn-save {
          width: 100%; padding: 0.875rem;
          background: var(--md-primary, #7C3AED); color: #fff;
          border: none; border-radius: var(--md-radius-full);
          font-size: 0.9375rem; font-weight: 700;
          cursor: pointer; font-family: inherit;
          box-shadow: var(--md-elevation-1);
          transition: box-shadow 0.15s, transform 0.1s;
        }
        .btn-save:hover  { box-shadow: var(--md-elevation-2); }
        .btn-save:active { transform: scale(0.98); }
        .btn-save:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; }

        /* ── Danger zone ── */
        .pf-danger-card { border: 1.5px solid var(--md-error-container, #FEE2E2) !important; box-shadow: none; }
        .danger-title { font-size: 0.9375rem; font-weight: 700; color: var(--md-error, #DC2626); margin: 0; }
        .danger-desc  { font-size: 0.875rem; color: var(--md-on-surface-variant, #52525B); line-height: 1.5; margin: 0; }
        .btn-delete {
          width: 100%; padding: 0.875rem;
          background: var(--md-error-container, #FEE2E2);
          color: var(--md-error, #DC2626);
          border: 1.5px solid var(--md-error, #DC2626);
          border-radius: var(--md-radius-full);
          font-size: 0.9375rem; font-weight: 700; cursor: pointer; font-family: inherit;
          transition: background 0.15s;
        }
        .btn-delete:hover    { background: #fecaca; }
        .btn-delete:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>
    </div>
  )
}
