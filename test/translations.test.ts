import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { initI18n } from '@payloadcms/translations'
import { fr } from '@payloadcms/translations/languages/fr'
import { describe, expect, it } from 'vitest'

import { errorMessage, withSupertextTranslations } from '../src/i18n.js'
import { statusError, SupertextError } from '../src/supertext/client.js'
import { supertextTranslations } from '../src/translations.js'

const src = (file: string) => readFileSync(join(__dirname, '../src', file), 'utf8')
const en = supertextTranslations.en.supertext
const placeholders = (text: string) => [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort()
const urls = (text: string) => [...text.matchAll(/https:\/\/[^\s)]+/g)].map((m) => m[0]).sort()

describe('plugin translations', () => {
  it('ships English, German, French and Italian', () => {
    expect(Object.keys(supertextTranslations).sort()).toEqual(['de', 'en', 'fr', 'it'])
  })

  for (const language of ['de', 'fr', 'it'] as const) {
    it(`${language} has the English keys, placeholders and URLs`, () => {
      const messages = supertextTranslations[language].supertext
      expect(Object.keys(messages).sort()).toEqual(Object.keys(en).sort())
      for (const [key, text] of Object.entries(en)) {
        const translated = messages[key as keyof typeof en]
        expect(translated, key).not.toBe('')
        expect(placeholders(translated), key).toEqual(placeholders(text))
        expect(urls(translated), key).toEqual(urls(text))
        expect(translated.split('Supertext').length, key).toBe(text.split('Supertext').length)
      }
    })
  }

  it('has a message for every key the admin control and the endpoints use', () => {
    const used = [
      ...[...src('components/TranslateButton.tsx').matchAll(/t\('supertext:(\w+)'/g)].map((m) => m[1]),
      ...[...src('endpoints.ts').matchAll(/translate\(req, '(\w+)'/g)].map((m) => m[1]),
    ]
    expect(used.length).toBeGreaterThan(15)
    for (const key of used) expect(en, key).toHaveProperty([key!])
  })

  it('has a message for every Supertext error code', () => {
    const union = src('supertext/client.ts').match(/export type SupertextErrorCode =([\s\S]*?)\n\n/)![1]!
    const codes = [...union.matchAll(/'(\w+)'/g)].map((m) => m[1])
    expect(codes.length).toBeGreaterThan(10)
    for (const code of codes) expect(en, code).toHaveProperty([`error_${code}`])
  })
})

describe('withSupertextTranslations', () => {
  it('adds the four languages and English for other supported languages, keeping project strings', () => {
    const i18n = withSupertextTranslations({
      supportedLanguages: { es: {} as never },
      translations: { de: { supertext: { translate: 'Übersetzen lassen' } }, es: { general: { save: 'x' } } } as never,
    })
    const translations = i18n!.translations as Record<string, Record<string, Record<string, string>>>
    expect(Object.keys(translations).sort()).toEqual(['de', 'en', 'es', 'fr', 'it'])
    expect(translations.de!.supertext!.translate).toBe('Übersetzen lassen')
    expect(translations.de!.supertext!.dialogTitle).toBe('Mit Supertext übersetzen')
    expect(translations.es!.supertext!.dialogTitle).toBe('Translate with Supertext')
    expect(translations.es!.general!.save).toBe('x')
    expect(i18n!.supportedLanguages).toHaveProperty('es')
  })
})

describe('errorMessage', () => {
  it('uses the request language through Payload’s own t() and appends the API detail', async () => {
    const i18n = await initI18n({
      config: { fallbackLanguage: 'en', supportedLanguages: { fr }, ...withSupertextTranslations({}) } as never,
      context: 'api',
      language: 'fr',
    })
    const req = { i18n, t: i18n.t } as never
    expect(errorMessage(req, statusError(429, 'slow down'))).toBe(
      'Trop de requêtes vers Supertext. Veuillez réessayer dans un instant. (slow down)',
    )
    expect(errorMessage(req, statusError(418))).toBe('Supertext a renvoyé un code d’état inattendu : 418.')
    expect(errorMessage(undefined, new SupertextError('timeout', 'x'))).toBe(en.error_timeout)
    expect(errorMessage(req, new Error('Validation failed'))).toBe('Validation failed')
  })
})
