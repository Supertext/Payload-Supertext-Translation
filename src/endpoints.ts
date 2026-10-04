import type { Endpoint, PayloadRequest } from 'payload'

import { SupertextClient, SUPERTEXT_ENVIRONMENTS } from './supertext/client.js'
import { translateDocument } from './translate.js'
import type { SupertextTranslationOptions, TranslateRequestBody, TranslateResponse } from './types.js'

export const ENDPOINT_BASE = '/supertext'

export function resolveApiKey(options: SupertextTranslationOptions): string {
  return options.apiKey ?? process.env.SUPERTEXT_API_KEY ?? ''
}

export function createClient(options: SupertextTranslationOptions): SupertextClient {
  return new SupertextClient({
    apiKey: resolveApiKey(options),
    baseUrl: options.apiUrl ?? SUPERTEXT_ENVIRONMENTS[options.environment ?? 'live'],
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

export function createEndpoints(options: SupertextTranslationOptions): Endpoint[] {
  const allowedCollections = new Set<string>(options.collections ?? [])
  const allowedGlobals = new Set<string>(options.globals ?? [])

  const canTranslate = async (req: PayloadRequest) =>
    Boolean(req.user) && (options.access ? await options.access({ req }) : true)

  return [
    {
      // Lets the admin panel show whether the plugin is usable before an editor clicks.
      handler: async (req) => {
        if (!req.user) return error(401, 'Not logged in.')
        return Response.json({
          apiKeyConfigured: resolveApiKey(options) !== '',
          canTranslate: await canTranslate(req),
          locales: localeCodes(req),
        })
      },
      method: 'get',
      path: `${ENDPOINT_BASE}/status`,
    },
    {
      handler: async (req) => {
        if (!req.user) return error(401, 'Not logged in.')
        if (!(await canTranslate(req))) return error(403, 'You are not allowed to start Supertext translations.')
        if (resolveApiKey(options) === '') {
          return error(500, 'No Supertext API key is configured. Set SUPERTEXT_API_KEY or the plugin apiKey option.')
        }

        const locales = localeCodes(req)
        if (locales.length === 0) return error(400, 'Localization is not enabled in the Payload config.')

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
  ]
}
