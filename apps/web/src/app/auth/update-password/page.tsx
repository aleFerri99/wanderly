'use client'

import { useState, useTransition } from 'react'
import { updatePassword } from '../actions'

export default function UpdatePasswordPage() {
  const [error, setError]        = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)

    if (formData.get('password') !== formData.get('confirm')) {
      setError('Le password non coincidono.')
      return
    }

    startTransition(async () => {
      const res = await updatePassword(formData)
      if (res?.error) setError(res.error)
      // In caso di successo, updatePassword fa redirect a /dashboard
    })
  }

  return (
    <div className="auth-page">
      <div className="auth-hero">
        <div className="auth-brand">
          <span className="auth-plane">🔐</span>
          <h1 className="auth-title">Wanderly</h1>
          <p className="auth-tagline">Scegli una nuova password</p>
        </div>
      </div>

      <div className="auth-card">
        <h2 className="auth-heading">Nuova password</h2>
        <p className="auth-subheading">Inserisci e conferma la tua nuova password.</p>

        {error && (
          <div className="auth-error" role="alert">⚠️ {error}</div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label htmlFor="password">Nuova password</label>
            <input
              id="password" name="password" type="password"
              required minLength={8}
              placeholder="Almeno 8 caratteri"
              autoComplete="new-password"
            />
          </div>

          <div className="auth-field">
            <label htmlFor="confirm">Conferma password</label>
            <input
              id="confirm" name="confirm" type="password"
              required minLength={8}
              placeholder="Ripeti la nuova password"
              autoComplete="new-password"
            />
          </div>

          <button type="submit" className="auth-btn-primary" disabled={isPending}>
            {isPending ? 'Salvataggio…' : 'Salva nuova password'}
          </button>
        </form>
      </div>

      <style jsx>{`
        .auth-page { min-height: 100dvh; background: var(--md-background,#F3F0FF); display: flex; flex-direction: column; }
        .auth-hero { background: linear-gradient(135deg, var(--md-primary-container,#EDE9FE) 0%, var(--md-tertiary-container,#CCFBF1) 100%); padding: 3.5rem 1.5rem 4rem; display: flex; align-items: center; justify-content: center; }
        .auth-brand { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }
        .auth-plane  { font-size: 3rem; line-height: 1; }
        .auth-title  { font-size: 2.25rem; font-weight: 800; letter-spacing: -0.03em; color: var(--md-primary,#7C3AED); margin: 0; }
        .auth-tagline { font-size: 0.9375rem; color: var(--md-on-surface-variant,#52525B); margin: 0; font-weight: 500; }
        .auth-card { background: var(--md-surface,#FAFAFA); border-radius: var(--md-radius-xxl,28px) var(--md-radius-xxl,28px) 0 0; margin-top: -1.5rem; flex: 1; padding: 2rem 1.5rem calc(2rem + env(safe-area-inset-bottom)); max-width: 480px; width: 100%; margin-left: auto; margin-right: auto; box-shadow: 0 -4px 24px rgba(124,58,237,0.08); }
        .auth-heading    { font-size: 1.5rem; font-weight: 800; color: var(--md-on-surface,#18181B); margin: 0 0 4px; }
        .auth-subheading { font-size: 0.9rem; color: var(--md-on-surface-variant,#52525B); margin: 0 0 1.5rem; line-height: 1.5; }
        .auth-error { background: var(--md-error-container,#FEE2E2); color: var(--md-error,#DC2626); border-radius: var(--md-radius-m,12px); padding: 0.875rem 1rem; font-size: 0.875rem; margin-bottom: 1.25rem; }
        .auth-form { display: flex; flex-direction: column; gap: 1rem; }
        .auth-field { display: flex; flex-direction: column; gap: 0.4rem; }
        .auth-field label { font-size: 0.75rem; font-weight: 700; color: var(--md-primary,#7C3AED); text-transform: uppercase; letter-spacing: 0.06em; }
        .auth-field input { width: 100%; padding: 0.875rem 1rem; border: 1.5px solid var(--md-outline-variant,#D4D4D8); border-radius: var(--md-radius-m,12px); font-size: 1rem; color: var(--md-on-surface,#18181B); background: var(--md-surface-container-low,#F4F4F5); box-sizing: border-box; font-family: inherit; transition: border-color 0.15s, box-shadow 0.15s; }
        .auth-field input:focus { outline: none; border-color: var(--md-primary,#7C3AED); box-shadow: 0 0 0 3px rgba(124,58,237,0.15); background: var(--md-surface,#FAFAFA); }
        .auth-btn-primary { width: 100%; padding: 0.9375rem; background: var(--md-primary,#7C3AED); color: #fff; border: none; border-radius: var(--md-radius-full); font-size: 1rem; font-weight: 700; cursor: pointer; font-family: inherit; box-shadow: var(--md-elevation-1); transition: box-shadow 0.15s, transform 0.1s; margin-top: 0.25rem; }
        .auth-btn-primary:hover  { box-shadow: var(--md-elevation-2); }
        .auth-btn-primary:active { transform: scale(0.98); }
        .auth-btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }
      `}</style>
    </div>
  )
}
