import type { Field, Payload, PayloadRequest } from 'payload'

import { collectSegments } from './collect.js'
import { politenessFor, sourceCode, targetCode } from './languages.js'
import { applyTranslations, buildHtml, parseHtml } from './segments.js'
import { SupertextClient, SupertextError } from './supertext/client.js'
import type { LocaleResult, SupertextTranslationOptions } from './types.js'

export type TranslateDocumentArgs = {
  client: SupertextClient
  options: SupertextTranslationOptions
  payload: Payload
  /** Request of the editor; used for access control. Omit for system calls (overrideAccess). */
  req?: PayloadRequest
  collection?: string
  global?: string
  id?: number | string
  sourceLocale: string
  targetLocales: string[]
}

/**
 * Translates one document (or global) from `sourceLocale` into each target locale and
 * saves the result. Targets run in parallel; one failing locale does not stop others.
 */
export async function translateDocument(args: TranslateDocumentArgs): Promise<LocaleResult[]> {
  const { client, collection, global, id, options, payload, req, sourceLocale } = args
  const targets = [...new Set(args.targetLocales)].filter((l) => l !== sourceLocale)
  const access = req ? { overrideAccess: false, req, user: req.user } : { overrideAccess: true }

  const entity = collection
    ? payload.collections[collection as keyof typeof payload.collections]?.config
    : payload.globals.config.find((g) => g.slug === global)
  if (!entity) throw new Error(`Unknown ${collection ? 'collection' : 'global'} "${collection ?? global}".`)
  if (collection && (id === undefined || id === '')) throw new Error('A document id is required.')

  const hasDrafts = Boolean((entity as { versions?: { drafts?: unknown } }).versions?.drafts)
  const draft = hasDrafts && options.saveAsDraft !== false

  const source = (
    collection
      ? await payload.findByID({
          ...access,
          collection: collection as never,
          depth: 0,
          draft: hasDrafts,
          fallbackLocale: false as never,
          id: id as number | string,
          locale: sourceLocale as never,
        })
      : await payload.findGlobal({
          ...access,
          depth: 0,
          draft: hasDrafts,
          fallbackLocale: false as never,
          locale: sourceLocale as never,
          slug: global as never,
        })
  ) as Record<string, unknown>

  // Supertext calls run in parallel, but saves are serialized: concurrent updates of
  // the same document race on its version history (a draft save copies the latest
  // version, so two parallel locale saves lose one of them).
  let saveQueue: Promise<unknown> = Promise.resolve()
  const serialized = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = saveQueue.then(fn, fn)
    saveQueue = run.catch(() => undefined)
    return run
  }

  const blocksBySlug = Object.fromEntries((payload.config.blocks ?? []).map((b) => [b.slug, b]))
  const fields = entity.fields as Field[]

  return Promise.all(
    targets.map(async (locale): Promise<LocaleResult> => {
      try {
        // Fresh walk per target: each needs its own clone to write into.
        const { segments, updateData } = collectSegments(fields, source, {
          blocksBySlug,
          skipFieldNames: options.skipFieldNames ?? ['slug'],
        })
        if (segments.length === 0) return { locale, missing: [], ok: true, segments: 0 }

        const html = await client.translateHtml({
          html: buildHtml(segments),
          politeness: politenessFor(locale, options.politeness),
          sourceLang: sourceCode(sourceLocale, options.languageMap),
          targetLang: targetCode(locale, options.languageMap),
        })
        const missing = applyTranslations(segments, parseHtml(html))

        await serialized(() =>
          collection
            ? payload.update({
                ...access,
                collection: collection as never,
                data: updateData as never,
                depth: 0,
                draft,
                id: id as number | string,
                locale: locale as never,
              })
            : payload.updateGlobal({
                ...access,
                data: updateData as never,
                depth: 0,
                draft,
                locale: locale as never,
                slug: global as never,
              }),
        )

        if (missing.length > 0) {
          payload.logger.warn(
            `[supertext] ${collection ?? global} ${id ?? ''} → ${locale}: ${missing.length} segment(s) came back empty and kept the source text: ${missing.join(', ')}`,
          )
        }
        return { locale, missing, ok: true, segments: segments.length }
      } catch (err) {
        payload.logger.error({ err }, `[supertext] ${collection ?? global} ${id ?? ''} → ${locale} failed`)
        return {
          code: err instanceof SupertextError ? err.code : undefined,
          error: err instanceof Error ? err.message : String(err),
          locale,
          ok: false,
        }
      }
    }),
  )
}
