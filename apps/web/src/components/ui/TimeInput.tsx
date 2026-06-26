'use client'

import { useRef, useState, useEffect } from 'react'

interface Props {
  value?:    string               // "HH:MM" o ""
  onChange?: (v: string) => void
  disabled?: boolean
}

function autoFormat(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}:${digits.slice(2)}`
}

function isValid(t: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(t)) return false
  const h = parseInt(t.slice(0, 2), 10)
  const m = parseInt(t.slice(3, 5), 10)
  return h < 24 && m < 60
}

export function TimeInput({ value = '', onChange, disabled }: Props) {
  const nativeRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(value)

  // Sincronizza solo quando il prop value cambia dall'esterno
  useEffect(() => { setText(value) }, [value])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const fmt = autoFormat(e.target.value)
    setText(fmt)

    if (isValid(fmt)) {
      // Aggiorna il native input (uncontrolled) via ref con il valore valido
      if (nativeRef.current) nativeRef.current.value = fmt
      onChange?.(fmt)
    } else if (fmt === '') {
      if (nativeRef.current) nativeRef.current.value = ''
      onChange?.('')
    }
  }

  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    if (e.target.value && !isValid(e.target.value)) {
      setText('')
      if (nativeRef.current) nativeRef.current.value = ''
      onChange?.('')
    }
  }

  // Selezionato tramite il picker nativo
  function handleNativeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value  // già "HH:MM"
    setText(v)
    onChange?.(v)
  }

  return (
    <span className="ti-wrap">
      <input
        type="text"
        value={text}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder="HH:MM"
        maxLength={5}
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        className="ti-text"
      />

      {/* Uncontrolled — nessun value/onChange da React,
          aggiornato via ref solo con valori HH:MM validi.
          Evita conflitti di riconciliazione con i valori intermedi. */}
      <input
        ref={nativeRef}
        type="time"
        defaultValue={isValid(value) ? value : ''}
        onChange={handleNativeChange}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        className="ti-native"
      />

      <button
        type="button"
        className="ti-btn"
        tabIndex={-1}
        aria-label="Apri orologio"
        disabled={disabled}
        onClick={() => nativeRef.current?.showPicker?.()}
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M8 4.5V8l2.5 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </span>
  )
}
