'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { signIn, signInWithGoogle } from '../actions'

export default function LoginPage() {
  const [error, setError]     = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await signIn(formData)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <div className="auth-page">

      {/* Hero gradient — stesso stile del trip-hero */}
      <div className="auth-hero">
        <div className="auth-brand">
          <span className="auth-plane">✈️</span>
          <h1 className="auth-title">Wanderly</h1>
          <p className="auth-tagline">Pianifica insieme, viaggia meglio.</p>
        </div>
      </div>

      {/* Card contenuto */}
      <div className="auth-card">
        <h2 className="auth-heading">Bentornato</h2>
        <p className="auth-subheading">Accedi per continuare il viaggio</p>

        {error && (
          <div className="auth-error" role="alert">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label htmlFor="email">Email</label>
            <input
              id="email" name="email" type="email"
              required autoComplete="email"
              placeholder="tu@email.com"
            />
          </div>

          <div className="auth-field">
            <div className="auth-field-label-row">
              <label htmlFor="password">Password</label>
              <Link href="/auth/reset-password" className="auth-field-link">
                Dimenticata?
              </Link>
            </div>
            <input
              id="password" name="password" type="password"
              required autoComplete="current-password"
              placeholder="••••••••"
            />
          </div>

          <button type="submit" className="auth-btn-primary" disabled={isPending}>
            {isPending ? 'Accesso in corso…' : 'Accedi'}
          </button>
        </form>

        <div className="auth-divider"><span>oppure</span></div>

        <form action={signInWithGoogle}>
          <button type="submit" className="auth-btn-google">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"/>
              <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"/>
            </svg>
            Continua con Google
          </button>
        </form>

        <p className="auth-footer">
          Non hai un account?{' '}
          <Link href="/auth/register" className="auth-footer-link">Registrati</Link>
        </p>
      </div>

      <style jsx>{`
        /* ── Layout ── */
        .auth-page {
          min-height: 100dvh;
          background: var(--md-background, #F3F0FF);
          display: flex;
          flex-direction: column;
        }

        /* ── Hero — gradiente coerente con trip-hero ── */
        .auth-hero {
          background: linear-gradient(135deg,
            var(--md-primary-container, #EDE9FE) 0%,
            var(--md-tertiary-container, #CCFBF1) 100%);
          padding: 3.5rem 1.5rem 4rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .auth-brand  { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }
        .auth-plane  { font-size: 3rem; line-height: 1; }
        .auth-title  {
          font-size: 2.25rem; font-weight: 800; letter-spacing: -0.03em;
          color: var(--md-primary, #7C3AED); margin: 0;
        }
        .auth-tagline {
          font-size: 0.9375rem; color: var(--md-on-surface-variant, #52525B);
          margin: 0; font-weight: 500;
        }

        /* ── Card bianca che si sovrappone all'hero ── */
        .auth-card {
          background: var(--md-surface, #FAFAFA);
          border-radius: var(--md-radius-xxl, 28px) var(--md-radius-xxl, 28px) 0 0;
          margin-top: -1.5rem;
          flex: 1;
          padding: 2rem 1.5rem calc(2rem + env(safe-area-inset-bottom));
          max-width: 480px;
          width: 100%;
          margin-left: auto;
          margin-right: auto;
          box-shadow: 0 -4px 24px rgba(124,58,237,0.08);
        }

        .auth-heading    { font-size: 1.5rem; font-weight: 800; color: var(--md-on-surface, #18181B); margin: 0 0 4px; }
        .auth-subheading { font-size: 0.9rem; color: var(--md-on-surface-variant, #52525B); margin: 0 0 1.5rem; }

        /* ── Errore ── */
        .auth-error {
          background: var(--md-error-container, #FEE2E2);
          color: var(--md-error, #DC2626);
          border-radius: var(--md-radius-m, 12px);
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          margin-bottom: 1.25rem;
        }

        /* ── Form ── */
        .auth-form { display: flex; flex-direction: column; gap: 1rem; }

        .auth-field { display: flex; flex-direction: column; gap: 0.4rem; }
        .auth-field-label-row { display: flex; justify-content: space-between; align-items: center; }

        .auth-field label {
          font-size: 0.75rem; font-weight: 700;
          color: var(--md-primary, #7C3AED);
          text-transform: uppercase; letter-spacing: 0.06em;
        }
        .auth-field-link {
          font-size: 0.75rem; font-weight: 600;
          color: var(--md-tertiary, #0D9488);
          text-decoration: none;
        }
        .auth-field-link:hover { text-decoration: underline; }

        .auth-field input {
          width: 100%; padding: 0.875rem 1rem;
          border: 1.5px solid var(--md-outline-variant, #D4D4D8);
          border-radius: var(--md-radius-m, 12px);
          font-size: 1rem; color: var(--md-on-surface, #18181B);
          background: var(--md-surface-container-low, #F4F4F5);
          box-sizing: border-box; font-family: inherit;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .auth-field input:focus {
          outline: none;
          border-color: var(--md-primary, #7C3AED);
          box-shadow: 0 0 0 3px rgba(124,58,237,0.15);
          background: var(--md-surface, #FAFAFA);
        }

        /* ── Pulsante primario ── */
        .auth-btn-primary {
          width: 100%; padding: 0.9375rem;
          background: var(--md-primary, #7C3AED);
          color: #fff; border: none;
          border-radius: var(--md-radius-full);
          font-size: 1rem; font-weight: 700;
          cursor: pointer; font-family: inherit;
          box-shadow: var(--md-elevation-1);
          transition: box-shadow 0.15s, transform 0.1s;
          margin-top: 0.25rem;
        }
        .auth-btn-primary:hover  { box-shadow: var(--md-elevation-2); }
        .auth-btn-primary:active { transform: scale(0.98); }
        .auth-btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }

        /* ── Divider ── */
        .auth-divider {
          position: relative; text-align: center; margin: 1.25rem 0;
        }
        .auth-divider::before {
          content: '';
          position: absolute; top: 50%; left: 0; right: 0;
          height: 1px; background: var(--md-outline-variant, #D4D4D8);
        }
        .auth-divider span {
          position: relative;
          background: var(--md-surface, #FAFAFA);
          padding: 0 0.875rem;
          font-size: 0.75rem; color: var(--md-outline, #A1A1AA);
        }

        /* ── Google ── */
        .auth-btn-google {
          width: 100%; padding: 0.875rem;
          background: var(--md-surface, #FAFAFA);
          border: 1.5px solid var(--md-outline-variant, #D4D4D8);
          border-radius: var(--md-radius-full);
          font-size: 0.9375rem; font-weight: 600;
          color: var(--md-on-surface, #18181B);
          cursor: pointer; font-family: inherit;
          display: flex; align-items: center; justify-content: center; gap: 0.75rem;
          transition: background 0.15s, border-color 0.15s;
        }
        .auth-btn-google:hover {
          background: var(--md-surface-container-low, #F4F4F5);
          border-color: var(--md-outline, #A1A1AA);
        }

        /* ── Footer ── */
        .auth-footer {
          text-align: center; font-size: 0.9rem;
          color: var(--md-on-surface-variant, #52525B);
          margin-top: 1.25rem;
        }
        .auth-footer-link {
          color: var(--md-primary, #7C3AED);
          font-weight: 700; text-decoration: none;
        }
        .auth-footer-link:hover { text-decoration: underline; }
      `}</style>
    </div>
  )
}
