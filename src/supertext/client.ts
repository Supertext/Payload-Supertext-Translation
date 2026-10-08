/**
 * Client for the Supertext AI file translation API (v1).
 *
 * Same protocol as the WordPress plugin:
 *   1. POST   translate/ai/file                     multipart upload of an HTML file → { file_id }
 *   2. GET    translate/ai/file/{id}/status         poll until `done`
 *   3. GET    translate/ai/file/{id}/translation    download the translated HTML
 *   4. DELETE translate/ai/file/{id}                best-effort cleanup (files expire after 24h)
 *
 * Auth header: `Authorization: Supertext-Auth-Key <key>`.
 * The file endpoint accepts up to 1,000,000 characters, so one document = one request.
 */

export const SUPERTEXT_ENVIRONMENTS = {
  live: 'https://api.supertext.com/v1/',
  staging: 'https://api.staging.supertext.com/v1/',
  testing: 'https://api.testing.supertext.com/v1/',
} as const

export type SupertextEnvironment = keyof typeof SUPERTEXT_ENVIRONMENTS

export type Politeness = 'default' | 'less' | 'more'

export type SupertextErrorCode =
  | 'authentication_failure'
  | 'file_deleted'
  | 'incomplete_response'
  | 'missing_api_key'
  | 'no_file_id'
  | 'not_found'
  | 'payload_too_large'
  | 'quota_exceeded'
  | 'service_unavailable'
  | 'timeout'
  | 'too_many_requests'
  | 'translation_error'
  | 'transport_error'
  | 'unexpected_status'

/**
 * `message` is English (logs, API clients). UIs translate `code` and append `detail`
 * (the API's or network's own explanation, untranslated) when it is set.
 */
export class SupertextError extends Error {
  readonly code: SupertextErrorCode
  readonly status?: number
  readonly detail?: string

  constructor(code: SupertextErrorCode, message: string, status?: number, detail?: string) {
    super(message)
    this.name = 'SupertextError'
    this.code = code
    this.status = status
    this.detail = detail || undefined
  }
}

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
  targetLang: string
  /** Primary subtag only (e.g. `de`, not `de-CH`); omit for auto-detection. */
  sourceLang?: string
  politeness?: Politeness
}

/** Retries after HTTP 429 (the API limits requests per second), e.g. when several locales start at once. */
export const RATE_LIMIT_RETRIES = 4

/** Wait before retry `attempt` (0-based): the Retry-After header if present, else 1 s, 2 s, 4 s, 8 s plus jitter. */
export function retryDelayMs(attempt: number, retryAfter: string | null): number {
  const seconds = Number(retryAfter)
  if (retryAfter && Number.isFinite(seconds) && seconds >= 0) return Math.min(30_000, seconds * 1000)
  return 1000 * 2 ** attempt + Math.floor(Math.random() * 250)
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export class SupertextClient {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly pollIntervalMs: number
  private readonly timeoutMs: number
  private readonly requestTimeoutMs: number
  private readonly sleep: (ms: number) => Promise<void>

  constructor(options: SupertextClientOptions) {
    this.apiKey = options.apiKey
    const base = options.baseUrl ?? SUPERTEXT_ENVIRONMENTS.live
    this.baseUrl = base.endsWith('/') ? base : `${base}/`
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis)
    this.pollIntervalMs = Math.max(100, options.pollIntervalMs ?? 2000)
    this.timeoutMs = Math.max(this.pollIntervalMs, options.timeoutMs ?? 180_000)
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000
    this.sleep = options.sleep ?? defaultSleep
  }

  /** Full round trip: upload, wait, download, delete. Returns the translated HTML. */
  async translateHtml(args: TranslateFileArgs): Promise<string> {
    const fileId = await this.submitFile(args)
    try {
      await this.waitUntilDone(fileId)
      return await this.download(fileId)
    } finally {
      await this.deleteFile(fileId)
    }
  }

  /** Cost-free check that the API key is accepted. */
  async validateApiKey(): Promise<void> {
    await this.request('GET', 'features')
  }

  async submitFile({ html, politeness = 'default', sourceLang, targetLang }: TranslateFileArgs): Promise<string> {
    const form = new FormData()
    form.append('target_lang', targetLang)
    if (sourceLang) form.append('source_lang', sourceLang)
    if (politeness !== 'default') form.append('politeness', politeness)
    // Supertext matches the part's Content-Type verbatim against an allow-list:
    // it must be exactly "text/html" (a charset suffix causes 415). The document
    // declares UTF-8 via <meta charset>.
    form.append('file', new Blob([html], { type: 'text/html' }), 'content.html')

    const res = await this.request('POST', 'translate/ai/file', form)
    const data = (await res.json().catch(() => null)) as { file_id?: unknown } | null
    if (!data || typeof data.file_id !== 'string' || data.file_id === '') {
      throw new SupertextError('no_file_id', 'Supertext did not return a file id.')
    }
    return data.file_id
  }

  /** Status values: `translating`, `done`, `error`, `limit_exceeded`, `deleted`. */
  async waitUntilDone(fileId: string): Promise<void> {
    const deadline = Date.now() + this.timeoutMs
    for (;;) {
      const res = await this.request('GET', `translate/ai/file/${encodeURIComponent(fileId)}/status`)
      const data = (await res.json().catch(() => null)) as { status?: unknown } | null
      switch (data?.status) {
        case 'done':
          return
        case 'error':
          throw new SupertextError('translation_error', 'Supertext failed to translate the document.')
        case 'limit_exceeded':
          throw new SupertextError(
            'quota_exceeded',
            'Your Supertext translation limit is exceeded. Please upgrade your subscription.',
          )
        case 'deleted':
          throw new SupertextError(
            'file_deleted',
            'The Supertext translation file was deleted before it could be downloaded.',
          )
      }
      if (Date.now() + this.pollIntervalMs >= deadline) {
        throw new SupertextError('timeout', 'Timed out waiting for the Supertext translation to finish.')
      }
      await this.sleep(this.pollIntervalMs)
    }
  }

  async download(fileId: string): Promise<string> {
    const res = await this.request('GET', `translate/ai/file/${encodeURIComponent(fileId)}/translation`)
    const body = await res.text()
    if (body.trim() === '') {
      throw new SupertextError('incomplete_response', 'The translated document was empty.')
    }
    return body
  }

  /** Best effort: never throws. */
  async deleteFile(fileId: string): Promise<void> {
    try {
      await this.request('DELETE', `translate/ai/file/${encodeURIComponent(fileId)}`)
    } catch {
      // Files expire after 24h anyway.
    }
  }

  private async request(method: string, path: string, body?: FormData): Promise<Response> {
    if (!this.apiKey) {
      throw new SupertextError('missing_api_key', 'No Supertext API key is configured.')
    }
    let res: Response
    for (let attempt = 0; ; attempt++) {
      try {
        res = await this.fetchImpl(this.baseUrl + path, {
          body,
          headers: {
            Accept: 'application/json',
            Authorization: authHeader(this.apiKey),
          },
          method,
          signal: AbortSignal.timeout(this.requestTimeoutMs),
        })
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        throw new SupertextError('transport_error', `Could not reach Supertext: ${detail}`, undefined, detail)
      }
      if (res.status !== 429 || attempt >= RATE_LIMIT_RETRIES) break
      await res.body?.cancel().catch(() => undefined)
      await this.sleep(retryDelayMs(attempt, res.headers.get('retry-after')))
    }
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).replace(/<[^>]*>/g, '').trim().slice(0, 200)
      throw statusError(res.status, detail)
    }
    return res
  }
}

export function statusError(status: number, detail = ''): SupertextError {
  let code: SupertextErrorCode
  let message: string
  switch (status) {
    case 401:
    case 403:
      code = 'authentication_failure'
      message = 'Authentication failure. Please check your Supertext API key.'
      break
    case 404:
      code = 'not_found'
      message = 'The requested Supertext resource was not found.'
      break
    case 413:
      code = 'payload_too_large'
      message = 'The document is too large for Supertext to translate.'
      break
    case 429:
      code = 'too_many_requests'
      message = 'Too many requests to Supertext. Please try again shortly.'
      break
    case 500:
    case 502:
    case 503:
      code = 'service_unavailable'
      message = 'Supertext service unavailable.'
      break
    default:
      code = 'unexpected_status'
      message = `Supertext sent an unexpected status code ${status}.`
  }
  return new SupertextError(code, detail ? `${message} — ${detail}` : message, status, detail)
}

/**
 * The Authorization header value. Accepts the key with or without the
 * `Supertext-Auth-Key ` prefix (Supertext shows it with the prefix).
 */
export function authHeader(apiKey: string): string {
  return `Supertext-Auth-Key ${apiKey.trim().replace(/^Supertext-Auth-Key\s+/i, '')}`
}
