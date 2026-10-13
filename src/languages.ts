import { LanguageCodes } from './vendor/supertext-sdk/index.js'
import type { Politeness } from './supertext/client.js'

/**
 * Language codes the Supertext way, with the Supertext SDK's rules (the same in every
 * Supertext plugin): the target is regional (`de` → `de-DE`, `de_ch` → `de-CH`; unknown
 * bare codes unchanged), the source the bare language (`de-CH` → `de`). A mapping
 * (the `languageMap` option) wins over the Payload locale code.
 */
export const DEFAULT_REGIONS: Readonly<Record<string, string>> = LanguageCodes.DEFAULT_REGIONS

export const normalizeTag = (code: string): string => LanguageCodes.normalize(code)

export function targetCode(locale: string, map: Record<string, string> = {}): string {
  return LanguageCodes.target(locale, map)
}

export function sourceCode(locale: string, map: Record<string, string> = {}): string {
  return LanguageCodes.source(locale, map)
}

export function politenessFor(locale: string, map: Record<string, Politeness> = {}): Politeness {
  return map[locale] ?? 'default'
}
