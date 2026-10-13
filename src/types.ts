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

  /**
   * Supertext API key. Defaults to `process.env.SUPERTEXT_API_KEY`. Never commit it.
   *
   * No Supertext account yet? Create one at https://www.supertext.com/person/en/account/signin.
   * Generate the key at supertext.com → Integrations → API (https://www.supertext.com/en/integrations/api);
   * this requires the Admin role in your Supertext account.
   */
  apiKey?: string
  /** `live` (default), `staging` or `testing`. Ignored when `apiUrl` is set. */
  environment?: SupertextEnvironment
  /** Explicit API base URL, e.g. a proxy. Overrides `environment`. */
  apiUrl?: string

  /**
   * Payload locale code → Supertext language code. A locale that is already a Supertext code
   * (apart from case and `_`/`-`: `en`, `de-CH`, `fr_ch`, `es`, `nl`) needs no entry; any other
   * locale must be mapped (`{ de: 'de-CH', fr: 'fr-FR', zh: 'zh-Hans' }`), or translating into it
   * fails with "has no Supertext language yet" and nothing is sent. There are no default regions.
   * Supported codes: `SUPERTEXT_TARGETS` and docs/INSTALLATION.md.
   */
  languageMap?: Record<string, string>
  /**
   * Payload locale code → politeness (`more` = formal, `less` = informal). Only for targets that
   * offer it (see docs/INSTALLATION.md); for others the translation fails with a clear message.
   */
  politeness?: Record<string, Politeness>

  /**
   * "Send version information to Supertext": the site URL and the versions of this plugin,
   * Payload, Node.js and the Supertext SDK, whether an API key is set and the latest key check,
   * and the ping URL. No content, no API key, no personal data. Default: `true`.
   * The environment variable `SUPERTEXT_VERSION_REPORTS=0` turns it off (and `=1` on) regardless.
   */
  versionReports?: boolean

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
   * Show the Supertext panel (plugin version, API key check, languages, version reports) on the
   * admin dashboard, for users who may translate. Default: `true`.
   */
  dashboardPanel?: boolean

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
  | { locale: string; ok: false; error: string; code?: string; status?: number }

export type TranslateResponse = {
  results: LocaleResult[]
}

export type LanguageStatus = {
  locale: string
  /** The Supertext code it is sent as; null when it has none (not mapped). */
  supertext: string | null
  politeness: Politeness
  /** False when `politeness` is set but the target offers no formal/informal choice. */
  politenessSupported: boolean
}

export type KeyCheckStatus = {
  status: 'ok' | 'invalid' | 'missing' | 'unreachable' | 'error'
  checkedAt: string
  httpStatus: number | null
  errorCode: string | null
}

export type StatusResponse = {
  apiKeyConfigured: boolean
  canTranslate: boolean
  locales: string[]
  languages: LanguageStatus[]
  version: string | null
  releaseUrl: string | null
  sdkVersion: string
  reports: { enabled: boolean; pingUrl: string | null }
  keyCheck: KeyCheckStatus | null
}
