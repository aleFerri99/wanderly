'use client'

import { useRef, useState, useEffect } from 'react'

interface Props {
  value?:        string
  defaultValue?: string
  onChange?:     (iso: string) => void
  name?:         string
  id?:           string
  required?:     boolean
  min?:          string
  max?:          string
  /** Variante compact per form inline (es. DayBlock edit, Timeline add-day) */
  compact?:      boolean
  placeholder?:  string
  disabled?:     boolean
}

function isoToDisplay(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function displayToIso(s: string): string {
  const match = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return ''
  const [, d, m, y] = match
  const date = new Date(`${y}-${m}-${d}T00:00:00`)
  if (isNaN(date.getTime())) return ''
  return `${y}-${m}-${d}`
}

function autoFormat(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

export function DateInput({
  value, defaultValue, onChange, name, id, required,
  min, max, compact, placeholder = 'gg/mm/aaaa', disabled,
}: Props) {
  const nativeRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(isoToDisplay(value ?? defaultValue ?? ''))

  useEffect(() => {
    if (value !== undefined) setText(isoToDisplay(value))
  }, [value])

  function handleTextChange(e: React.ChangeEvent<HTMLInputElement>) {
    const formatted = autoFormat(e.target.value)
    setText(formatted)
    onChange?.(displayToIso(formatted))
  }

  function handleNativeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const iso = e.target.value
    setText(isoToDisplay(iso))
    onChange?.(iso)
  }

  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    const iso = displayToIso(e.target.value)
    if (iso) setText(isoToDisplay(iso))
  }

  return (
    <span className={`di-wrap${compact ? ' di-compact' : ''}`}>
      <input
        type="text"
        id={id}
        required={required}
        disabled={disabled}
        value={text}
        onChange={handleTextChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        maxLength={10}
        inputMode="numeric"
        autoComplete="off"
        className="di-text"
      />

      {/* Input nativo nascosto: porta il name → form submit in YYYY-MM-DD */}
      <input
        ref={nativeRef}
        type="date"
        name={name}
        tabIndex={-1}
        aria-hidden="true"
        value={displayToIso(text) || ''}
        min={min}
        max={max}
        onChange={handleNativeChange}
        className="di-native"
      />

      <button
        type="button"
        className="di-btn"
        tabIndex={-1}
        aria-label="Apri calendario"
        disabled={disabled}
        onClick={() => nativeRef.current?.showPicker?.()}
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <rect x="1" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M1 7h14" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M5 1v4M11 1v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>

      {/* Stili in globals.css — evita <style jsx global> che può rompere
          lo scope dei componenti styled-jsx che importano DateInput */}
    </span>
  )
}
