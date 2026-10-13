import { Languages, SupertextError } from './vendor/supertext-sdk/v1/index.js'
import type { TargetLanguage } from './vendor/supertext-sdk/v1/index.js'
import type { Politeness } from './supertext/client.js'

/**
 * Payload locale codes → Supertext codes, with the Supertext SDK's rules (the same in every
 * Supertext plugin, no guessing): the `languageMap` entry wins; otherwise a locale that equals
 * a Supertext code apart from case and `_`/`-` is used (`de-CH`, `fr_ch`, `es`); anything else
 * throws `SupertextError('unsupported_language')` and nothing is sent. Sources are bare
 * (`de-CH` → `de`).
 */
export const SUPERTEXT_TARGETS: readonly TargetLanguage[] = Languages.TARGETS

export function targetCode(locale: string, map: Record<string, string> = {}): string {
  return Languages.target(locale, map)
}

/** The target code, or null when the locale has no Supertext language (status panel). */
export function targetCodeOrNull(locale: string, map: Record<string, string> = {}): string | null {
  try {
    return Languages.target(locale, map)
  } catch {
    return null
  }
}

const sameCode = (a: string, b: string) => a.trim().replace(/_/g, '-').toLowerCase() === b.trim().replace(/_/g, '-').toLowerCase()

/**
 * The source code: the language of the mapped code, else of the locale (`de-CH` → `de`).
 * `languageMap` holds target codes (`{ de: 'de-CH' }`), and Supertext wants bare sources, so a
 * mapped value is reduced to its language instead of being sent as it is.
 */
export function sourceCode(locale: string, map: Record<string, string> = {}): string {
  const mapped = Object.entries(map).find(([from, to]) => sameCode(from, locale) && typeof to === 'string' && to.trim() !== '')?.[1]
  return Languages.source(mapped ?? locale)
}

export function politenessFor(locale: string, map: Record<string, Politeness> = {}): Politeness {
  return map[locale] ?? 'default'
}

/** Whether Supertext offers formal/informal for a target code (null: not in the SDK's list). */
export const supportsPoliteness = (target: string): boolean | null => Languages.supportsPoliteness(target)

/**
 * The politeness to send for a target. A formal/informal setting for a target that has none is
 * an `unsupported_feature` error (nothing is sent), so the setting is never dropped silently.
 */
export function politenessForTarget(locale: string, target: string, map: Record<string, Politeness> = {}): Politeness {
  const politeness = politenessFor(locale, map)
  if (politeness !== 'default' && supportsPoliteness(target) === false) {
    throw new SupertextError('unsupported_feature', { feature: 'politeness', targetLang: target })
  }
  return politeness
}
