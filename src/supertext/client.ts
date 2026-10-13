/**
 * The plugin's access to the Supertext AI file translation API (v1), built on the
 * shared Supertext SDK (src/vendor/supertext-sdk, compiled with the plugin).
 * The SDK does the protocol:
 *   1. POST   translate/ai/file                     multipart upload of an HTML file → { file_id }
 *   2. GET    translate/ai/file/{id}/status         poll until `done`
 *   3. GET    translate/ai/file/{id}/translation    download the translated HTML
 *   4. DELETE translate/ai/file/{id}                cleanup, also after errors
 * plus the `Authorization: Supertext-Auth-Key <key>` header (a pasted prefix is stripped),
 * HTTP 429 retries and the language codes (bare source, regional target).
 *
 * No Payload imports here (tested on its own).
 */
import { LIVE_BASE_URL, SupertextClient as SdkClient, SupertextError } from '../vendor/supertext-sdk/index.js'
import type { ErrorCode, FetchLike, Politeness } from '../vendor/supertext-sdk/index.js'

export { SupertextError }
export type { Politeness }
export type SupertextErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]

export const SUPERTEXT_ENVIRONMENTS = {
  live: LIVE_BASE_URL,
  staging: 'https://api.staging.supertext.com/v1/',
  testing: 'https://api.testing.supertext.com/v1/',
} as const

export type SupertextEnvironment = keyof typeof SUPERTEXT_ENVIRONMENTS

export type SupertextClientOptions = {
  apiKey: string
  /** Base URL with trailing slash. Defaults to the live API. */
  baseUrl?: string
  /** Custom fetch (tests, proxies). Defaults to global fetch. */
  fetch?: typeof fetch
  /** Delay between status polls. Default 2000 ms. */
  pollIntervalMs?: number
  /** Give up waiting after this long. Default 180000 ms. */
  timeoutMs?: number
  /** Per-request HTTP timeout. Default 30000 ms. */
  requestTimeoutMs?: number
  /** Sleep implementation (tests). */
  sleep?: (ms: number) => Promise<void>
}

export type TranslateFileArgs = {
  html: string
  /** Any form (`de`, `de_ch`): sent as a regional code. */
  targetLang: string
  /** Any form: sent as the bare language; omit for auto-detection. */
  sourceLang?: string
  politeness?: Politeness
}

export class SupertextClient {
  private readonly sdk: SdkClient

  constructor(options: SupertextClientOptions) {
    const pollIntervalMs = Math.max(100, options.pollIntervalMs ?? 2000)
    this.sdk = new SdkClient(options.apiKey, {
      baseUrl: options.baseUrl ?? SUPERTEXT_ENVIRONMENTS.live,
      pollIntervalMs,
      timeoutMs: Math.max(pollIntervalMs, options.timeoutMs ?? 180_000),
      requestTimeoutMs: options.requestTimeoutMs ?? 30_000,
      userAgent: 'payload-supertext-translation',
      ...(options.fetch ? { fetch: options.fetch as FetchLike } : {}),
      ...(options.sleep ? { sleep: options.sleep } : {}),
    })
  }

  /** Full round trip: upload, wait, download, delete. Returns the translated HTML. */
  translateHtml({ html, targetLang, sourceLang, politeness }: TranslateFileArgs): Promise<string> {
    return this.sdk.translateHtml(html, targetLang, { sourceLang: sourceLang ?? null, politeness: politeness ?? 'default' })
  }

  /** Cost-free check that the API key is accepted (`GET features`). */
  validateApiKey(): Promise<void> {
    return this.sdk.validateApiKey()
  }
}
