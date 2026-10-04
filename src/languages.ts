import type { Politeness } from './supertext/client.js'

/** Supertext language code for a Payload locale (explicit mapping first, else the code itself). */
export function targetCode(locale: string, map: Record<string, string> = {}): string {
  return (map[locale] ?? locale).trim()
}

/**
 * Supertext expects the source as a primary subtag (`de`, not `de-CH`); a regional
 * source code is rejected with INVALID_LANGUAGE_PAIR. Targets keep their region.
 */
export function sourceCode(locale: string, map: Record<string, string> = {}): string {
  return targetCode(locale, map).split(/[-_]/)[0]?.toLowerCase() ?? ''
}

export function politenessFor(locale: string, map: Record<string, Politeness> = {}): Politeness {
  return map[locale] ?? 'default'
}
