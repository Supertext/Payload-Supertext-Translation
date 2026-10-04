'use client'

import { Button, toast, useConfig, useDocumentInfo, useFormModified, useLocale } from '@payloadcms/ui'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { LocaleResult, TranslateResponse } from '../types.js'

type Status = { apiKeyConfigured: boolean; canTranslate: boolean; locales: string[] }

/**
 * "Translate with Supertext" control in the document header. Translates the saved
 * version of the document in the current locale into the locales the editor picks.
 */
export function TranslateButton() {
  const { config } = useConfig()
  const { collectionSlug, globalSlug, id } = useDocumentInfo()
  const locale = useLocale()
  const modified = useFormModified()

  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const panelRef = useRef<HTMLDivElement>(null)

  const api = `${config.serverURL ?? ''}${config.routes.api}`
  const localization = config.localization
  const sourceLocale = locale?.code ?? (localization ? localization.defaultLocale : '')

  const targets = useMemo(() => {
    if (!localization) return []
    return localization.locales
      .map((l) => (typeof l === 'string' ? { code: l, label: l } : { code: l.code, label: labelOf(l.label, l.code) }))
      .filter((l) => l.code !== sourceLocale)
  }, [localization, sourceLocale])

  useEffect(() => {
    let cancelled = false
    fetch(`${api}/supertext/status`, { credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<Status>) : null))
      .then((s) => !cancelled && setStatus(s))
      .catch(() => !cancelled && setStatus(null))
    return () => {
      cancelled = true
    }
  }, [api])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  if (!localization || targets.length === 0) return null
  if (status && !status.canTranslate) return null

  const unsaved = Boolean(collectionSlug) && !id
  const disabledReason = unsaved
    ? 'Save the document before translating it.'
    : status && !status.apiKeyConfigured
      ? 'No Supertext API key is configured. Ask an administrator.'
      : modified
        ? 'You have unsaved changes. Supertext translates the saved version; save first to include them.'
        : null

  const toggle = (code: string) =>
    setSelected((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]))

  const run = async () => {
    setBusy(true)
    try {
      const res = await fetch(`${api}/supertext/translate`, {
        body: JSON.stringify({
          collection: collectionSlug,
          global: globalSlug,
          id,
          sourceLocale,
          targetLocales: selected,
        }),
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const data = (await res.json().catch(() => null)) as (TranslateResponse & { error?: string }) | null
      if (!data?.results) {
        toast.error(data?.error ?? `Supertext translation failed (HTTP ${res.status}).`)
        return
      }
      reportResults(data.results, targets)
      if (data.results.every((r) => r.ok)) {
        setOpen(false)
        setSelected([])
      }
    } catch (err) {
      toast.error(`Could not reach the server: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={panelRef} style={{ position: 'relative' }}>
      <Button
        buttonStyle="secondary"
        disabled={busy}
        margin={false}
        onClick={() => setOpen((o) => !o)}
        size="medium"
        tooltip={disabledReason ?? undefined}
      >
        {busy ? 'Translating…' : 'Translate'}
      </Button>
      {open && (
        <div
          role="dialog"
          aria-label="Translate with Supertext"
          style={{
            background: 'var(--theme-elevation-0)',
            border: '1px solid var(--theme-elevation-150)',
            borderRadius: 'var(--style-radius-m, 4px)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            minWidth: 260,
            padding: 16,
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 8px)',
            zIndex: 50,
          }}
        >
          <strong style={{ display: 'block', marginBottom: 4 }}>Translate with Supertext</strong>
          <p style={{ color: 'var(--theme-elevation-500)', fontSize: 13, margin: '0 0 12px' }}>
            From <b>{sourceLocale}</b> into:
          </p>
          {targets.map((t) => (
            <label key={t.code} style={{ alignItems: 'center', display: 'flex', gap: 8, marginBottom: 6 }}>
              <input
                checked={selected.includes(t.code)}
                disabled={busy}
                onChange={() => toggle(t.code)}
                type="checkbox"
              />
              {t.label} <span style={{ color: 'var(--theme-elevation-500)' }}>({t.code})</span>
            </label>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" disabled={busy} onClick={() => setSelected(targets.map((t) => t.code))} style={linkStyle}>
              All
            </button>
            <button type="button" disabled={busy} onClick={() => setSelected([])} style={linkStyle}>
              None
            </button>
          </div>
          {disabledReason && (
            <p style={{ color: 'var(--theme-warning-500, #b26b00)', fontSize: 13, margin: '12px 0 0' }}>
              {disabledReason}
            </p>
          )}
          <div style={{ marginTop: 12 }}>
            <Button
              buttonStyle="primary"
              disabled={busy || selected.length === 0 || unsaved || (status ? !status.apiKeyConfigured : false)}
              margin={false}
              onClick={run}
              size="medium"
            >
              {busy ? 'Translating… (up to a few minutes)' : `Translate into ${selected.length || '…'}`}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

const linkStyle = {
  background: 'none',
  border: 'none',
  color: 'var(--theme-elevation-800)',
  cursor: 'pointer',
  padding: 0,
  textDecoration: 'underline',
} as const

function labelOf(label: unknown, fallback: string): string {
  if (typeof label === 'string') return label
  if (label && typeof label === 'object') {
    const first = Object.values(label as Record<string, unknown>)[0]
    if (typeof first === 'string') return first
  }
  return fallback
}

function reportResults(results: LocaleResult[], targets: { code: string; label: string }[]) {
  const name = (code: string) => targets.find((t) => t.code === code)?.label ?? code
  const ok = results.filter((r) => r.ok)
  const failed = results.filter((r): r is Extract<LocaleResult, { ok: false }> => !r.ok)
  if (ok.length > 0) {
    const partial = ok.filter((r) => r.ok && r.missing.length > 0)
    toast.success(
      `Translated into ${ok.map((r) => name(r.locale)).join(', ')}.` +
        (partial.length > 0 ? ' Some passages came back empty and kept the source text — please review.' : ''),
    )
  }
  for (const f of failed) toast.error(`${name(f.locale)}: ${f.error}`)
}
