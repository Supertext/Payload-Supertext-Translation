import type { Config, PayloadRequest } from 'payload'

import { deepMergeSimple } from 'payload/shared'

import { SupertextError } from './supertext/client.js'
import { SUPERTEXT_I18N_NAMESPACE, supertextTranslations, type SupertextTranslationKey } from './translations.js'

type Vars = Record<string, unknown>
type TFunction = (key: string, vars?: Vars) => string

const interpolate = (text: string, vars: Vars = {}) =>
  text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) => (vars[name] == null ? match : String(vars[name])))

/**
 * Adds the plugin's strings to `config.i18n.translations`: its own languages, plus English
 * for every other supported language, so no screen shows raw keys. Strings the project
 * already defines under `supertext` win.
 */
export function withSupertextTranslations(i18n: Config['i18n']): Config['i18n'] {
  const own = supertextTranslations as Record<string, { supertext: Record<string, string> }>
  const languages = new Set([...Object.keys(i18n?.supportedLanguages ?? { en: true }), ...Object.keys(own)])
  const existing = (i18n?.translations ?? {}) as Record<string, object>
  const translations: Record<string, object> = { ...existing }
  for (const language of languages) {
    translations[language] = deepMergeSimple(own[language] ?? supertextTranslations.en, existing[language] ?? {})
  }
  return { ...i18n, translations: translations as NonNullable<Config['i18n']>['translations'] }
}

/** A plugin string in the request's admin language (English without a request). */
export function translate(req: PayloadRequest | undefined, key: SupertextTranslationKey, vars?: Vars): string {
  const fullKey = `${SUPERTEXT_I18N_NAMESPACE}:${key}`
  const t = req?.t as unknown as TFunction | undefined
  const text = t?.(fullKey, vars)
  return text && text !== fullKey ? text : interpolate(supertextTranslations.en.supertext[key], vars)
}

/** Error message for an editor: Supertext errors by code, with the API's own detail appended. */
export function errorMessage(req: PayloadRequest | undefined, err: unknown): string {
  if (err instanceof SupertextError) {
    const text = translate(req, `error_${err.code}`, { status: err.status })
    return err.detail ? `${text} (${err.detail})` : text
  }
  return err instanceof Error ? err.message : String(err)
}
