'use client'

import {
  Button,
  toast,
  useConfig,
  useDocumentInfo,
  useFormModified,
  useLocale,
  useTranslation,
} from '@payloadcms/ui'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { SupertextI18nKey, supertextTranslations } from '../translations.js'
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
  const { i18n, t } = useTranslation<(typeof supertextTranslations)['en'], SupertextI18nKey>()

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
      .map((l) =>
        typeof l === 'string' ? { code: l, label: l } : { code: l.code, label: labelOf(l.label, l.code, i18n.language) },
      )
      .filter((l) => l.code !== sourceLocale)
  }, [localization, sourceLocale, i18n.language])

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
    ? t('supertext:saveFirst')
    : status && !status.apiKeyConfigured
      ? t('supertext:noApiKey')
      : modified
        ? t('supertext:unsavedChanges')
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
        toast.error(data?.error ?? t('supertext:failedHttp', { status: res.status }))
        return
      }
      reportResults(data.results, targets, t)
      if (data.results.every((r) => r.ok)) {
        setOpen(false)
        setSelected([])
      }
    } catch (err) {
      toast.error(t('supertext:serverUnreachable', { detail: err instanceof Error ? err.message : String(err) }))
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
        {busy ? t('supertext:translating') : t('supertext:translate')}
      </Button>
      {open && (
        <div
          role="dialog"
          aria-label={t('supertext:dialogTitle')}
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
          <strong style={{ display: 'block', marginBottom: 4 }}>{t('supertext:dialogTitle')}</strong>
          <p style={{ color: 'var(--theme-elevation-500)', fontSize: 13, margin: '0 0 12px' }}>
            {withBold(t('supertext:fromInto', { locale: MARK }), sourceLocale)}
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
              {t('supertext:all')}
            </button>
            <button type="button" disabled={busy} onClick={() => setSelected([])} style={linkStyle}>
              {t('supertext:none')}
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
              {busy ? t('supertext:translatingLong') : t('supertext:translateInto', { count: selected.length || '…' })}
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

type T = (key: SupertextI18nKey, vars?: Record<string, unknown>) => string

/** Placeholder for the source locale, replaced by a bold element after translation. */
const MARK = '\u0000'

function withBold(text: string, value: string) {
  const [before, after = ''] = text.split(MARK)
  return (
    <>
      {before}
      <b>{value}</b>
      {after}
    </>
  )
}

/** Locale label in the admin language (labels may be `{ en: 'German', de: 'Deutsch' }`). */
function labelOf(label: unknown, fallback: string, language: string): string {
  if (typeof label === 'string') return label
  if (label && typeof label === 'object') {
    const labels = label as Record<string, unknown>
    const value = labels[language] ?? Object.values(labels)[0]
    if (typeof value === 'string') return value
  }
  return fallback
}

function reportResults(results: LocaleResult[], targets: { code: string; label: string }[], t: T) {
  const name = (code: string) => targets.find((t) => t.code === code)?.label ?? code
  const ok = results.filter((r) => r.ok)
  const failed = results.filter((r): r is Extract<LocaleResult, { ok: false }> => !r.ok)
  if (ok.length > 0) {
    const partial = ok.filter((r) => r.ok && r.missing.length > 0)
    toast.success(
      t('supertext:translatedInto', { locales: ok.map((r) => name(r.locale)).join(', ') }) +
        (partial.length > 0 ? ` ${t('supertext:partlyEmpty')}` : ''),
    )
  }
  for (const f of failed) toast.error(`${name(f.locale)}: ${f.error}`)
}
