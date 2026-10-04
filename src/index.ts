import type { Config, CustomComponent } from 'payload'

import { createEndpoints } from './endpoints.js'
import type { SupertextTranslationOptions } from './types.js'

export { collectSegments, isOptedOut } from './collect.js'
export { createClient, ENDPOINT_BASE } from './endpoints.js'
export { sourceCode, targetCode } from './languages.js'
export { applyTranslations, buildHtml, parseHtml } from './segments.js'
export { SUPERTEXT_ENVIRONMENTS, SupertextClient, SupertextError } from './supertext/client.js'
export type { Politeness, SupertextEnvironment, SupertextErrorCode } from './supertext/client.js'
export { translateDocument } from './translate.js'
export type {
  LocaleResult,
  SupertextTranslationOptions,
  TranslateRequestBody,
  TranslateResponse,
} from './types.js'

/** Import-map path of the admin panel component (run `payload generate:importmap` after adding the plugin). */
export const TRANSLATE_BUTTON_PATH = 'payload-supertext-translation/client#TranslateButton'

const button: CustomComponent = { path: TRANSLATE_BUTTON_PATH }

/**
 * Payload 3 plugin: adds a "Translate with Supertext" control to the edit view of the
 * configured collections and globals, plus the `/api/supertext/*` endpoints behind it.
 *
 * ```ts
 * plugins: [supertextTranslation({ collections: ['pages', 'posts'], globals: ['header'] })]
 * ```
 */
export const supertextTranslation =
  (options: SupertextTranslationOptions = {}) =>
  (incoming: Config): Config => {
    if (options.disabled) return incoming

    const collectionSlugs = new Set<string>(options.collections ?? [])
    const globalSlugs = new Set<string>(options.globals ?? [])

    return {
      ...incoming,
      collections: (incoming.collections ?? []).map((collection) =>
        collectionSlugs.has(collection.slug)
          ? {
              ...collection,
              admin: {
                ...collection.admin,
                components: {
                  ...collection.admin?.components,
                  edit: {
                    ...collection.admin?.components?.edit,
                    beforeDocumentControls: [
                      ...(collection.admin?.components?.edit?.beforeDocumentControls ?? []),
                      button,
                    ],
                  },
                },
              },
            }
          : collection,
      ),
      endpoints: [...(incoming.endpoints ?? []), ...createEndpoints(options)],
      globals: (incoming.globals ?? []).map((global) =>
        globalSlugs.has(global.slug)
          ? {
              ...global,
              admin: {
                ...global.admin,
                components: {
                  ...global.admin?.components,
                  elements: {
                    ...global.admin?.components?.elements,
                    beforeDocumentControls: [
                      ...(global.admin?.components?.elements?.beforeDocumentControls ?? []),
                      button,
                    ],
                  },
                },
              },
            }
          : global,
      ),
    }
  }

export default supertextTranslation
