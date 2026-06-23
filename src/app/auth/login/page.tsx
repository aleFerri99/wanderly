// ============================================================
// src/app/auth/login/page.tsx
// Pagina login — mobile-first
// ============================================================
'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { signIn, signInWithGoogle } from '../actions'

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
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
      <div className="auth-container">
        {/* Logo / Brand */}
        <div className="auth-brand">
          <div className="brand-icon">✈️</div>
          <h1>Wanderly</h1>
          <p>Pianifica insieme, viaggia meglio.</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="auth-form">
          <h2>Accedi</h2>

          {error && <div className="auth-error">{error}</div>}

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="tu@email.com"
            />
          </div>

          <div className="field">
            <label htmlFor="password">
              Password
              <Link href="/auth/reset-password" className="field-link">
                Dimenticata?
              </Link>
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </div>

          <button type="submit" className="btn-primary" disabled={isPending}>
            {isPending ? 'Accesso in corso…' : 'Accedi'}
          </button>
        </form>

        {/* Divider */}
        <div className="auth-divider">
          <span>oppure</span>
        </div>

        {/* Google OAuth */}
        <form action={signInWithGoogle}>
          <button type="submit" className="btn-google">
            <svg width="18" height="18" viewBox="0 0 18 18">
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
          <Link href="/auth/register">Registrati</Link>
        </p>
      </div>

      <style jsx>{`
        .auth-page {
          min-height: 100dvh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1.5rem 1rem;
          background: #f8f7f4;
        }
        .auth-container {
          width: 100%;
          max-width: 400px;
        }
        .auth-brand {
          text-align: center;
          margin-bottom: 2rem;
        }
        .brand-icon {
          font-size: 2.5rem;
          margin-bottom: 0.5rem;
        }
        .auth-brand h1 {
          font-size: 1.75rem;
          font-weight: 700;
          color: #1a1a1a;
          letter-spacing: -0.03em;
          margin: 0 0 0.25rem;
        }
        .auth-brand p {
          color: #6b6b6b;
          font-size: 0.9rem;
          margin: 0;
        }
        .auth-form {
          background: #fff;
          border-radius: 16px;
          padding: 1.5rem;
          border: 1px solid #e8e8e4;
          margin-bottom: 0.75rem;
        }
        .auth-form h2 {
          font-size: 1.125rem;
          font-weight: 600;
          margin: 0 0 1.25rem;
          color: #1a1a1a;
        }
        .auth-error {
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #b91c1c;
          border-radius: 8px;
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          margin-bottom: 1rem;
        }
        .field {
          margin-bottom: 1rem;
        }
        .field label {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.8125rem;
          font-weight: 500;
          color: #3a3a3a;
          margin-bottom: 0.375rem;
        }
        .field-link {
          font-weight: 400;
          color: #1D9E75;
          text-decoration: none;
          font-size: 0.75rem;
        }
        .field input {
          width: 100%;
          padding: 0.65rem 0.875rem;
          border: 1px solid #e0e0db;
          border-radius: 10px;
          font-size: 1rem;
          color: #1a1a1a;
          background: #fafaf8;
          transition: border-color 0.15s, box-shadow 0.15s;
          box-sizing: border-box;
        }
        .field input:focus {
          outline: none;
          border-color: #1D9E75;
          box-shadow: 0 0 0 3px rgba(29, 158, 117, 0.12);
          background: #fff;
        }
        .btn-primary {
          width: 100%;
          padding: 0.75rem;
          background: #1D9E75;
          color: #fff;
          border: none;
          border-radius: 10px;
          font-size: 0.9375rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s, transform 0.1s;
          margin-top: 0.5rem;
        }
        .btn-primary:hover { background: #0F6E56; }
        .btn-primary:active { transform: scale(0.99); }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .auth-divider {
          text-align: center;
          position: relative;
          margin: 0.75rem 0;
        }
        .auth-divider::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 0; right: 0;
          height: 1px;
          background: #e8e8e4;
        }
        .auth-divider span {
          position: relative;
          background: #f8f7f4;
          padding: 0 0.75rem;
          font-size: 0.75rem;
          color: #9a9a94;
        }
        .btn-google {
          width: 100%;
          padding: 0.7rem;
          background: #fff;
          border: 1px solid #e0e0db;
          border-radius: 10px;
          font-size: 0.9rem;
          font-weight: 500;
          color: #3a3a3a;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.625rem;
          transition: background 0.15s;
        }
        .btn-google:hover { background: #f8f7f4; }
        .auth-footer {
          text-align: center;
          font-size: 0.875rem;
          color: #6b6b6b;
          margin-top: 1rem;
        }
        .auth-footer a {
          color: #1D9E75;
          font-weight: 500;
          text-decoration: none;
        }
      `}</style>
    </div>
  )
}
