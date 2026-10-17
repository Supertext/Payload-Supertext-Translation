import type { Endpoint, PayloadRequest } from 'payload'

import { translate } from './i18n.js'
import { politenessFor, suggestTargetCode, supportsPoliteness, targetCodeOrNull } from './languages.js'
import { Reporting, SDK_VERSION, siteUrl } from './reporting.js'
import { effectiveSettings, loadSettings, SETTINGS_SLUG } from './settings.js'
import type { SavedSettings } from './settings.js'
import { SupertextClient, SUPERTEXT_ENVIRONMENTS } from './supertext/client.js'
import { translateDocument } from './translate.js'
import type {
  KeyCheckStatus,
  LanguageStatus,
  StatusResponse,
  SupertextTranslationOptions,
  TranslateRequestBody,
  TranslateResponse,
} from './types.js'
import { pluginVersion, releaseUrl } from './versions.js'

export const ENDPOINT_BASE = '/supertext'

export function resolveApiKey(options: SupertextTranslationOptions): string {
  return options.apiKey ?? process.env.SUPERTEXT_API_KEY ?? ''
}

export function apiBaseUrl(options: SupertextTranslationOptions): string {
  return options.apiUrl ?? SUPERTEXT_ENVIRONMENTS[options.environment ?? 'live']
}

export function createClient(options: SupertextTranslationOptions): SupertextClient {
  return new SupertextClient({
    apiKey: resolveApiKey(options),
    baseUrl: apiBaseUrl(options),
    pollIntervalMs: options.pollIntervalMs,
    timeoutMs: options.timeoutMs,
  })
}

const error = (status: number, message: string) => Response.json({ error: message }, { status })

function localeCodes(req: PayloadRequest): string[] {
  const loc = req.payload.config.localization
  if (!loc) return []
  return loc.locales.map((l) => (typeof l === 'string' ? l : l.code))
}

async function readBody(req: PayloadRequest): Promise<unknown> {
  try {
    return typeof req.json === 'function' ? await req.json() : (req.data ?? null)
  } catch {
    return null
  }
}

/**
 * How each locale is sent to Supertext (for the status panel and the dialog): the plugin options
 * win, then the saved Supertext settings, then the SDK's exact match or default.
 */
export function languageStatus(
  locales: string[],
  options: SupertextTranslationOptions,
  saved: SavedSettings = { languageMap: {}, politeness: {} },
): LanguageStatus[] {
  const settings = effectiveSettings(saved, options)
  return locales.map((locale) => {
    const supertext = targetCodeOrNull(locale, settings.languageMap)
    const politeness = politenessFor(locale, settings.politeness)
    const supported = supertext === null || politeness === 'default' || supportsPoliteness(supertext) !== false
    // A saved value equal to the suggestion is the preselected default, not a choice of its own.
    const chosen = saved.languageMap[locale]
    const origin: LanguageStatus['origin'] =
      supertext === null
        ? null
        : options.languageMap?.[locale]
          ? 'option'
          : chosen && chosen !== suggestTargetCode(locale)
            ? 'settings'
            : 'automatic'
    return { locale, origin, politeness, politenessSupported: supported, supertext }
  })
}

/** The stored key check (Plugin Health's `KeyCheck`, status as a string) without the fingerprint. */
const publicCheck = (check: (Omit<KeyCheckStatus, 'status'> & { status: string }) | null): KeyCheckStatus | null =>
  check && { checkedAt: check.checkedAt, errorCode: check.errorCode, httpStatus: check.httpStatus, status: check.status as KeyCheckStatus['status'] }

export function createEndpoints(
  options: SupertextTranslationOptions,
  reporting: Reporting = new Reporting({ apiBaseUrl: apiBaseUrl(options), versionReports: options.versionReports }),
): Endpoint[] {
  const allowedCollections = new Set<string>(options.collections ?? [])
  const allowedGlobals = new Set<string>(options.globals ?? [])

  const canTranslate = async (req: PayloadRequest) =>
    Boolean(req.user) && (options.access ? await options.access({ req }) : true)

  return [
    {
      // Lets the admin panel show whether the plugin is usable before an editor clicks.
      handler: async (req) => {
        if (!req.user) return error(401, translate(req, 'notLoggedIn'))
        const apiKey = resolveApiKey(options)
        reporting.inBackground('onRequest', req, apiKey)
        const locales = localeCodes(req)
        const url = siteUrl(req.payload.config.serverURL, req)
        const version = pluginVersion()
        const status: StatusResponse = {
          apiKeyConfigured: apiKey !== '',
          canTranslate: await canTranslate(req),
          keyCheck: publicCheck(await reporting.lastCheck(req.payload)),
          languages: languageStatus(locales, options, await loadSettings(req.payload)),
          locales,
          releaseUrl: releaseUrl(version),
          reports: { enabled: reporting.enabled, pingUrl: reporting.enabled && url ? reporting.callbackUrl(req.payload, url) : null },
          sdkVersion: SDK_VERSION,
          settingsUrl: `${req.payload.config.routes?.admin ?? '/admin'}/globals/${SETTINGS_SLUG}`,
          version,
        }
        return Response.json(status)
      },
      method: 'get',
      path: `${ENDPOINT_BASE}/status`,
    },
    {
      handler: async (req) => {
        if (!req.user) return error(401, translate(req, 'notLoggedIn'))
        if (!(await canTranslate(req))) return error(403, translate(req, 'notAllowed'))
        if (resolveApiKey(options) === '') return error(500, translate(req, 'apiKeyMissing'))

        const locales = localeCodes(req)
        if (locales.length === 0) return error(400, translate(req, 'localizationDisabled'))

        const body = (await readBody(req)) as Partial<TranslateRequestBody> | null
        if (!body || typeof body !== 'object') return error(400, 'Expected a JSON body.')
        const { collection, global, id, sourceLocale } = body
        const targetLocales = Array.isArray(body.targetLocales) ? body.targetLocales.map(String) : []

        if (!collection === !global) return error(400, 'Pass exactly one of "collection" or "global".')
        if (collection && !allowedCollections.has(collection)) {
          return error(400, `Collection "${collection}" is not enabled for Supertext translation.`)
        }
        if (global && !allowedGlobals.has(global)) {
          return error(400, `Global "${global}" is not enabled for Supertext translation.`)
        }
        if (collection && (id === undefined || id === null || id === '')) return error(400, 'Missing "id".')
        if (!sourceLocale || !locales.includes(sourceLocale)) return error(400, 'Unknown "sourceLocale".')
        const unknown = targetLocales.filter((l) => !locales.includes(l))
        if (unknown.length > 0) return error(400, `Unknown target locale(s): ${unknown.join(', ')}.`)
        if (targetLocales.filter((l) => l !== sourceLocale).length === 0) {
          return error(400, 'Choose at least one target locale other than the source.')
        }

        reporting.inBackground('onRequest', req, resolveApiKey(options))
        try {
          const results = await translateDocument({
            client: createClient(options),
            collection,
            global,
            id,
            options,
            payload: req.payload,
            req,
            sourceLocale,
            targetLocales,
          })
          const rejected = results.find((r) => !r.ok && r.code === 'authentication_failure')
          if (rejected && !rejected.ok) reporting.inBackground('authenticationFailed', req, resolveApiKey(options), rejected.status ?? 401)
          const payload: TranslateResponse = { results }
          return Response.json(payload, { status: results.some((r) => r.ok) ? 200 : 502 })
        } catch (err) {
          // Source document not found / not readable by this user, unknown slug, ...
          const status = (err as { status?: number }).status ?? 400
          return error(status, err instanceof Error ? err.message : String(err))
        }
      },
      method: 'post',
      path: `${ENDPOINT_BASE}/translate`,
    },
    {
      // "Check again" on the Supertext panel: checks the API key now (cost-free GET features).
      handler: async (req) => {
        if (!req.user) return error(401, translate(req, 'notLoggedIn'))
        if (!(await canTranslate(req))) return error(403, translate(req, 'notAllowed'))
        const result = await reporting.run('testConnection', req, resolveApiKey(options))
        const check = result?.check ?? (await createClient(options).checkApiKey())
        return Response.json({ keyCheck: publicCheck(check) })
      },
      method: 'post',
      path: `${ENDPOINT_BASE}/check-key`,
    },
    {
      // Public: the Supertext Commando Center checks that the site is reachable. No login,
      // no data; 404 while version reports are off.
      handler: (req) => {
        const answer = reporting.ping(req.searchParams?.get('challenge'))
        return new Response(answer.body, { headers: answer.headers, status: answer.status })
      },
      method: 'get',
      path: `${ENDPOINT_BASE}/ping`,
    },
  ]
}
