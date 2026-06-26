'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { resetPassword } from '../actions'

export default function ResetPasswordPage() {
  const [state, setState]        = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setState(null)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await resetPassword(formData)
      if (res.error)   setState({ type: 'err', text: res.error })
      if (res.success) setState({ type: 'ok',  text: res.success })
    })
  }

  return (
    <div className="auth-page">
      <div className="auth-hero">
        <div className="auth-brand">
          <span className="auth-plane">🔑</span>
          <h1 className="auth-title">Wanderly</h1>
          <p className="auth-tagline">Recupera il tuo account</p>
        </div>
      </div>

      <div className="auth-card">
        <h2 className="auth-heading">Password dimenticata?</h2>
        <p className="auth-subheading">
          Inserisci la tua email e ti mandiamo un link per reimpostare la password.
        </p>

        {state && (
          <div className={state.type === 'ok' ? 'auth-success' : 'auth-error'} role="alert">
            {state.type === 'ok' ? '✅' : '⚠️'} {state.text}
          </div>
        )}

        {!state?.type || state.type === 'err' ? (
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="auth-field">
              <label htmlFor="email">Email</label>
              <input
                id="email" name="email" type="email"
                required autoComplete="email"
                placeholder="tu@email.com"
              />
            </div>

            <button type="submit" className="auth-btn-primary" disabled={isPending}>
              {isPending ? 'Invio in corso…' : 'Invia link di recupero'}
            </button>
          </form>
        ) : null}

        <p className="auth-footer">
          <Link href="/auth/login" className="auth-footer-link">← Torna al login</Link>
        </p>
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
        .auth-error   { background: var(--md-error-container,#FEE2E2); color: var(--md-error,#DC2626); border-radius: var(--md-radius-m,12px); padding: 0.875rem 1rem; font-size: 0.875rem; margin-bottom: 1.25rem; }
        .auth-success { background: var(--md-tertiary-container,#CCFBF1); color: var(--md-tertiary,#0D9488); border-radius: var(--md-radius-m,12px); padding: 0.875rem 1rem; font-size: 0.875rem; margin-bottom: 1.25rem; font-weight: 500; }
        .auth-form { display: flex; flex-direction: column; gap: 1rem; }
        .auth-field { display: flex; flex-direction: column; gap: 0.4rem; }
        .auth-field label { font-size: 0.75rem; font-weight: 700; color: var(--md-primary,#7C3AED); text-transform: uppercase; letter-spacing: 0.06em; }
        .auth-field input { width: 100%; padding: 0.875rem 1rem; border: 1.5px solid var(--md-outline-variant,#D4D4D8); border-radius: var(--md-radius-m,12px); font-size: 1rem; color: var(--md-on-surface,#18181B); background: var(--md-surface-container-low,#F4F4F5); box-sizing: border-box; font-family: inherit; transition: border-color 0.15s, box-shadow 0.15s; }
        .auth-field input:focus { outline: none; border-color: var(--md-primary,#7C3AED); box-shadow: 0 0 0 3px rgba(124,58,237,0.15); background: var(--md-surface,#FAFAFA); }
        .auth-btn-primary { width: 100%; padding: 0.9375rem; background: var(--md-primary,#7C3AED); color: #fff; border: none; border-radius: var(--md-radius-full); font-size: 1rem; font-weight: 700; cursor: pointer; font-family: inherit; box-shadow: var(--md-elevation-1); transition: box-shadow 0.15s, transform 0.1s; margin-top: 0.25rem; }
        .auth-btn-primary:hover  { box-shadow: var(--md-elevation-2); }
        .auth-btn-primary:active { transform: scale(0.98); }
        .auth-btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }
        .auth-footer { text-align: center; font-size: 0.9rem; color: var(--md-on-surface-variant,#52525B); margin-top: 1.25rem; }
        .auth-footer-link { color: var(--md-primary,#7C3AED); font-weight: 700; text-decoration: none; }
        .auth-footer-link:hover { text-decoration: underline; }
      `}</style>
    </div>
  )
}
