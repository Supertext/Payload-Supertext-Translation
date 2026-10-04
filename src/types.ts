import type { CollectionSlug, GlobalSlug, PayloadRequest } from 'payload'

import type { Politeness, SupertextEnvironment } from './supertext/client.js'

export type SupertextTranslationOptions = {
  /**
   * Collections that get the "Translate with Supertext" panel.
   * Only fields marked `localized` (directly or via an ancestor) are translated.
   */
  collections?: CollectionSlug[]
  /** Globals that get the panel. */
  globals?: GlobalSlug[]

  /** Supertext API key. Defaults to `process.env.SUPERTEXT_API_KEY`. Never commit it. */
  apiKey?: string
  /** `live` (default), `staging` or `testing`. Ignored when `apiUrl` is set. */
  environment?: SupertextEnvironment
  /** Explicit API base URL, e.g. a proxy. Overrides `environment`. */
  apiUrl?: string

  /**
   * Payload locale code → Supertext language code. Unmapped locales are sent as-is,
   * so `en`, `de-CH`, `fr-FR` need no entry. Example: `{ 'de-formal': 'de-CH' }`.
   */
  languageMap?: Record<string, string>
  /** Payload locale code → politeness (`more` = formal, `less` = informal). */
  politeness?: Record<string, Politeness>

  /** Field names never translated at any depth. Default: `['slug']`. */
  skipFieldNames?: string[]
  /**
   * For collections/globals with drafts enabled, save translations as a draft so
   * an editor reviews before publishing. Default: `true`.
   */
  saveAsDraft?: boolean

  /** Delay between status polls. Default 2000 ms. */
  pollIntervalMs?: number
  /** Maximum wait for one translation. Default 180000 ms (3 min). */
  timeoutMs?: number

  /**
   * Who may start translations. Default: any logged-in user. Collection/global
   * update access is always enforced on top of this.
   */
  access?: (args: { req: PayloadRequest }) => boolean | Promise<boolean>

  /**
   * Keep the endpoint and admin panel out of the config (e.g. per environment)
   * without changing the database schema. The plugin adds no fields either way.
   */
  disabled?: boolean
}

export type TranslateRequestBody = {
  collection?: string
  global?: string
  id?: number | string
  sourceLocale: string
  targetLocales: string[]
}

export type LocaleResult =
  | { locale: string; ok: true; segments: number; missing: string[] }
  | { locale: string; ok: false; error: string; code?: string }

export type TranslateResponse = {
  results: LocaleResult[]
}
