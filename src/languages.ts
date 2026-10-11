import type { Politeness } from './supertext/client.js'

/**
 * Regional default for a bare target language. Supertext rejects bare targets
 * (`de`) with INVALID_LANGUAGE_PAIR, so `de` is sent as `de-DE`. Same table in
 * every Supertext plugin (Shopify: app/translation/language-codes.ts).
 */
export const DEFAULT_REGIONS: Readonly<Record<string, string>> = {
  ar: 'ar-SA', bg: 'bg-BG', cs: 'cs-CZ', da: 'da-DK', de: 'de-DE', el: 'el-GR', en: 'en-US',
  es: 'es-ES', et: 'et-EE', fi: 'fi-FI', fr: 'fr-FR', hr: 'hr-HR', hu: 'hu-HU', it: 'it-IT',
  ja: 'ja-JP', ko: 'ko-KR', lt: 'lt-LT', lv: 'lv-LV', nb: 'nb-NO', nl: 'nl-NL', pl: 'pl-PL',
  pt: 'pt-PT', ro: 'ro-RO', ru: 'ru-RU', sk: 'sk-SK', sl: 'sl-SI', sr: 'sr-RS', sv: 'sv-SE',
  th: 'th-TH', tr: 'tr-TR', uk: 'uk-UA', vi: 'vi-VN', zh: 'zh-CN',
}

/** `de_ch` / `DE-ch` → `de-CH`; scripts and numeric regions keep their form (`zh-Hant`, `es-419`). */
export function normalizeTag(code: string): string {
  const [language, ...rest] = code.trim().split(/[-_]+/).filter(Boolean)
  if (!language) return ''
  const subtags = rest.map((part) => {
    if (/^[a-z]{2}$/i.test(part)) return part.toUpperCase()
    if (/^[a-z]{4}$/i.test(part)) return part[0]!.toUpperCase() + part.slice(1).toLowerCase()
    return part
  })
  return [language.toLowerCase(), ...subtags].join('-')
}

/**
 * Supertext target code for a locale: the explicit mapping wins, else the locale
 * itself. Always regional: a bare language gets its default region (`de` →
 * `de-DE`); unknown bare codes are sent unchanged.
 */
export function targetCode(locale: string, map: Record<string, string> = {}): string {
  const tag = normalizeTag(map[locale] ?? locale)
  return tag.includes('-') ? tag : (DEFAULT_REGIONS[tag] ?? tag)
}

/**
 * Supertext expects the source as a bare language (`de`, not `de-CH`); a regional
 * source code is rejected with INVALID_LANGUAGE_PAIR. Uses the mapping's language too.
 */
export function sourceCode(locale: string, map: Record<string, string> = {}): string {
  return normalizeTag(map[locale] ?? locale).split('-')[0] ?? ''
}

export function politenessFor(locale: string, map: Record<string, Politeness> = {}): Politeness {
  return map[locale] ?? 'default'
}
