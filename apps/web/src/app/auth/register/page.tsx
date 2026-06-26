'use client'
// src/app/auth/register/page.tsx  — Modulo E

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { signUp } from '../actions'
import { TRAVEL_INTERESTS, LANGUAGES, GENDERS } from '@repo/shared/constants'


export default function RegisterPage() {
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)
  const [isPending, startTransition] = useTransition()
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([])
  const [selectedInterests, setSelectedInterests] = useState<string[]>([])

  function toggleItem(list: string[], set: (v: string[]) => void, item: string) {
    set(list.includes(item) ? list.filter(x => x !== item) : [...list, item])
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setMessage(null)
    const formData = new FormData(e.currentTarget)

    if (formData.get('password') !== formData.get('confirmPassword')) {
      setMessage({ type: 'error', text: 'Le password non coincidono.' })
      return
    }
    if (selectedLanguages.length === 0) {
      setMessage({ type: 'error', text: 'Seleziona almeno una lingua.' })
      return
    }
    if (selectedInterests.length === 0) {
      setMessage({ type: 'error', text: 'Seleziona almeno un interesse di viaggio.' })
      return
    }

    // Aggiunge i valori multi-select al FormData
    selectedLanguages.forEach(l => formData.append('languages', l))
    selectedInterests.forEach(i => formData.append('travelInterests', i))

    startTransition(async () => {
      const result = await signUp(formData)
      if (result.error)   setMessage({ type: 'error',   text: result.error })
      if (result.success) setMessage({ type: 'success', text: result.success })
    })
  }

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-brand">
          <div className="brand-icon">✈️</div>
          <h1>Wanderly</h1>
          <p>Crea il tuo account gratuito.</p>
        </div>

        {message?.type === 'success' ? (
          <div className="success-card">
            <div className="success-icon">📧</div>
            <h2>Controlla la tua email</h2>
            <p>{message.text}</p>
            <Link href="/auth/login" className="btn-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: '1rem' }}>
              Vai al login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form">
            <h2>Crea account</h2>
            {message?.type === 'error' && <div className="auth-error">{message.text}</div>}

            {/* ── Sezione 1: Dati anagrafici ── */}
            <div className="form-section-title">Dati anagrafici</div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="fullName">Nome completo *</label>
                <input id="fullName" name="fullName" type="text" required placeholder="Marco Rossi" />
              </div>
              <div className="field">
                <label htmlFor="username">Username *</label>
                <input id="username" name="username" type="text" required placeholder="marcorossi"
                  pattern="[a-z0-9_]{3,20}" title="3-20 caratteri: lettere minuscole, numeri, underscore" />
              </div>
            </div>

            <div className="field">
              <label htmlFor="email">Email *</label>
              <input id="email" name="email" type="email" required placeholder="marco@email.com" />
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="birthDate">Anno di nascita *</label>
                <input
                  id="birthDate" name="birthDate" type="number" required
                  min={1900} max={new Date().getFullYear() - 13}
                  placeholder="es. 1995"
                />
              </div>
              <div className="field">
                <label htmlFor="nationality">Nazionalità *</label>
                <input id="nationality" name="nationality" type="text" required placeholder="Italiana" />
              </div>
            </div>

            <div className="field">
              <label htmlFor="gender">Sesso *</label>
              <select id="gender" name="gender" required defaultValue="">
                <option value="" disabled>Seleziona…</option>
                {GENDERS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </div>

            {/* ── Sezione 2: Lingue ── */}
            <div className="form-section-title">Lingue parlate *</div>
            <div className="tag-grid">
              {LANGUAGES.map(lang => (
                <button
                  key={lang} type="button"
                  className={`tag-btn ${selectedLanguages.includes(lang) ? 'tag-active' : ''}`}
                  onClick={() => toggleItem(selectedLanguages, setSelectedLanguages, lang)}
                >
                  {lang}
                </button>
              ))}
            </div>

            {/* ── Sezione 3: Password ── */}
            <div className="form-section-title">Password</div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="password">Password *</label>
                <input id="password" name="password" type="password" required minLength={8} placeholder="Min. 8 caratteri" />
              </div>
              <div className="field">
                <label htmlFor="confirmPassword">Conferma *</label>
                <input id="confirmPassword" name="confirmPassword" type="password" required placeholder="Ripeti password" />
              </div>
            </div>

            {/* ── Sezione 4: Interessi ── */}
            <div className="form-section-title">Passioni e preferenze di viaggio *</div>
            <div className="tag-grid">
              {TRAVEL_INTERESTS.map(interest => (
                <button
                  key={interest} type="button"
                  className={`tag-btn ${selectedInterests.includes(interest) ? 'tag-active' : ''}`}
                  onClick={() => toggleItem(selectedInterests, setSelectedInterests, interest)}
                >
                  {interest}
                </button>
              ))}
            </div>

            <button type="submit" className="btn-primary" disabled={isPending}>
              {isPending ? 'Creazione account…' : 'Crea account'}
            </button>
          </form>
        )}

        <p className="auth-footer">
          Hai già un account? <Link href="/auth/login">Accedi</Link>
        </p>
      </div>

      <style jsx>{`
        .auth-page { min-height: 100dvh; display: flex; align-items: flex-start; justify-content: center; padding: 1.5rem 1rem 3rem; background: #f8f7f4; }
        .auth-container { width: 100%; max-width: 480px; }
        .auth-brand { text-align: center; margin-bottom: 1.5rem; }
        .brand-icon { font-size: 2.5rem; margin-bottom: 0.5rem; }
        .auth-brand h1 { font-size: 1.75rem; font-weight: 700; color: #1a1a1a; letter-spacing: -0.03em; margin: 0 0 0.25rem; }
        .auth-brand p { color: #6b6b6b; font-size: 0.9rem; margin: 0; }
        .auth-form { background: #fff; border-radius: 16px; padding: 1.5rem; border: 1px solid #e8e8e4; margin-bottom: 0.75rem; display: flex; flex-direction: column; gap: 0.875rem; }
        .auth-form h2 { font-size: 1.125rem; font-weight: 600; margin: 0; color: #1a1a1a; }
        .auth-error { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; border-radius: 8px; padding: 0.75rem 1rem; font-size: 0.875rem; }
        .form-section-title { font-size: 0.75rem; font-weight: 700; color: #9a9a94; text-transform: uppercase; letter-spacing: 0.07em; margin-top: 0.25rem; }
        .field { display: flex; flex-direction: column; gap: 0.375rem; }
        .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
        .field label { font-size: 0.8125rem; font-weight: 500; color: #3a3a3a; }
        .field input, .field select { width: 100%; padding: 0.65rem 0.875rem; border: 1px solid #e0e0db; border-radius: 10px; font-size: 0.9375rem; color: #1a1a1a; background: #fafaf8; box-sizing: border-box; font-family: inherit; }
        .field input:focus, .field select:focus { outline: none; border-color: #1D9E75; box-shadow: 0 0 0 3px rgba(29,158,117,0.12); background: #fff; }
        .tag-grid { display: flex; flex-wrap: wrap; gap: 6px; }
        .tag-btn { padding: 5px 11px; border-radius: 99px; border: 1px solid #e0e0db; background: #f8f7f4; font-size: 0.8rem; color: #3a3a3a; cursor: pointer; transition: all 0.15s; font-family: inherit; }
        .tag-btn:hover { border-color: #1D9E75; color: #1D9E75; background: #f0fff8; }
        .tag-active { background: #E1F5EE !important; border-color: #1D9E75 !important; color: #0F6E56 !important; font-weight: 600; }
        .btn-primary { width: 100%; padding: 0.75rem; background: #1D9E75; color: #fff; border: none; border-radius: 10px; font-size: 0.9375rem; font-weight: 600; cursor: pointer; transition: background 0.15s; font-family: inherit; margin-top: 0.25rem; }
        .btn-primary:hover { background: #0F6E56; }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .success-card { background: #fff; border-radius: 16px; padding: 2rem 1.5rem; text-align: center; border: 1px solid #e8e8e4; }
        .success-icon { font-size: 2.5rem; margin-bottom: 1rem; }
        .success-card h2 { font-size: 1.125rem; font-weight: 600; margin: 0 0 0.5rem; }
        .success-card p { color: #6b6b6b; font-size: 0.9rem; margin: 0; }
        .auth-footer { text-align: center; font-size: 0.875rem; color: #6b6b6b; margin-top: 1rem; }
        .auth-footer a { color: #1D9E75; font-weight: 500; text-decoration: none; }
      `}</style>
    </div>
  )
}
