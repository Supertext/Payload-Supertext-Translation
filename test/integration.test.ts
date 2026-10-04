import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig, getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { supertextTranslation, TRANSLATE_BUTTON_PATH } from '../src/index.js'
import { SupertextClient } from '../src/supertext/client.js'
import { translateDocument } from '../src/translate.js'
import type { SupertextTranslationOptions } from '../src/types.js'
import { fakeSupertext } from './fakeSupertext.js'

const options: SupertextTranslationOptions = {
  apiKey: 'test-key',
  collections: ['pages'],
  globals: ['header'],
  languageMap: { 'de-CH': 'de-CH' },
}

let payload: Payload

const lexical = (t: string) => ({
  root: {
    children: [
      {
        children: [{ detail: 0, format: 0, mode: 'normal', style: '', text: t, type: 'text', version: 1 }],
        direction: 'ltr',
        format: '',
        indent: 0,
        type: 'paragraph',
        version: 1,
      },
    ],
    direction: 'ltr',
    format: '',
    indent: 0,
    type: 'root',
    version: 1,
  },
})

beforeAll(async () => {
  const config = await buildConfig({
    collections: [
      {
        fields: [
          { localized: true, name: 'title', required: true, type: 'text' },
          { localized: true, name: 'slug', type: 'text' },
          { name: 'code', type: 'text' },
          { localized: true, name: 'body', type: 'richText' },
          { fields: [{ localized: true, name: 'label', type: 'text' }], name: 'links', type: 'array' },
          { fields: [{ name: 'q', type: 'text' }], localized: true, name: 'faq', type: 'array' },
          {
            blocks: [{ fields: [{ localized: true, name: 'heading', type: 'text' }], slug: 'hero' }],
            name: 'layout',
            type: 'blocks',
          },
        ],
        slug: 'pages',
        versions: { drafts: true },
      },
    ],
    db: sqliteAdapter({ client: { url: ':memory:' } }),
    editor: lexicalEditor(),
    globals: [{ fields: [{ localized: true, name: 'tagline', type: 'text' }], slug: 'header' }],
    localization: { defaultLocale: 'en', locales: ['en', 'de-CH', 'fr'] },
    plugins: [supertextTranslation(options)],
    secret: 'test-secret',
    telemetry: false,
  })
  payload = await getPayload({ config })
}, 60_000)

afterAll(async () => {
  await payload?.destroy()
})

const client = (fake: ReturnType<typeof fakeSupertext>) =>
  new SupertextClient({ apiKey: 'test-key', fetch: fake.fetch, sleep: async () => {} })

describe('with a real Payload instance', () => {
  it('registers the endpoints and the admin control', () => {
    const paths = payload.config.endpoints.map((e) => `${e.method} ${e.path}`)
    expect(paths).toContain('post /supertext/translate')
    expect(paths).toContain('get /supertext/status')
    const pages = payload.collections.pages?.config
    expect(JSON.stringify(pages?.admin.components?.edit?.beforeDocumentControls)).toContain(TRANSLATE_BUTTON_PATH)
  })

  it('translates a collection document into several locales and keeps shared data intact', async () => {
    const page = await payload.create({
      collection: 'pages',
      data: {
        _status: 'published',
        body: lexical('Hello world') as never,
        code: 'P-1',
        faq: [{ q: 'Why?' }],
        layout: [{ blockType: 'hero', heading: 'Welcome' }],
        links: [{ label: 'Home' }],
        slug: 'home',
        title: 'Home page',
      },
      locale: 'en',
    })

    const fake = fakeSupertext()
    const results = await translateDocument({
      client: client(fake),
      collection: 'pages',
      id: page.id,
      options,
      payload,
      sourceLocale: 'en',
      targetLocales: ['de-CH', 'fr', 'en'],
    })

    expect(results).toEqual([
      { locale: 'de-CH', missing: [], ok: true, segments: 5 },
      { locale: 'fr', missing: [], ok: true, segments: 5 },
    ])
    const uploads = fake.calls.filter((c) => c.method === 'POST')
    expect(uploads.map((c) => c.form?.get('source_lang'))).toEqual(['en', 'en'])

    const fr = await payload.findByID({ collection: 'pages', draft: true, fallbackLocale: false as never, id: page.id, locale: 'fr' })
    expect(fr.title).toBe('[fr] Home page')
    expect(fr.slug).toBeFalsy() // skipped by default
    expect(JSON.stringify(fr.body)).toContain('[fr] Hello world')
    expect(fr.links?.[0]?.label).toBe('[fr] Home')
    expect(fr.faq?.[0]?.q).toBe('[fr] Why?')
    expect(fr.layout?.[0]?.heading).toBe('[fr] Welcome')
    expect(fr.code).toBe('P-1')

    const de = await payload.findByID({ collection: 'pages', draft: true, fallbackLocale: false as never, id: page.id, locale: 'de-CH' })
    expect(de.title).toBe('[de-CH] Home page')

    // Source locale untouched; shared array row kept its id.
    const en = await payload.findByID({ collection: 'pages', draft: true, id: page.id, locale: 'en' })
    expect(en.title).toBe('Home page')
    expect(en.links?.[0]?.label).toBe('Home')
    expect(en.links?.[0]?.id).toBe(page.links?.[0]?.id)
    expect(en.faq?.[0]?.q).toBe('Why?')
  })

  it('saves into drafts so the published version stays until review', async () => {
    const page = await payload.create({
      collection: 'pages',
      data: { _status: 'published', title: 'Published' },
      locale: 'en',
    })
    await translateDocument({
      client: client(fakeSupertext()),
      collection: 'pages',
      id: page.id,
      options,
      payload,
      sourceLocale: 'en',
      targetLocales: ['fr'],
    })
    const published = await payload.findByID({ collection: 'pages', draft: false, fallbackLocale: false as never, id: page.id, locale: 'fr' })
    const draft = await payload.findByID({ collection: 'pages', draft: true, fallbackLocale: false as never, id: page.id, locale: 'fr' })
    expect(published.title).toBeFalsy()
    expect(draft.title).toBe('[fr] Published')
  })

  it('translates globals', async () => {
    await payload.updateGlobal({ data: { tagline: 'Swiss quality' }, locale: 'en', slug: 'header' })
    const results = await translateDocument({
      client: client(fakeSupertext()),
      global: 'header',
      options,
      payload,
      sourceLocale: 'en',
      targetLocales: ['fr'],
    })
    expect(results[0]).toMatchObject({ ok: true, segments: 1 })
    const header = await payload.findGlobal({ fallbackLocale: false as never, locale: 'fr', slug: 'header' })
    expect(header.tagline).toBe('[fr] Swiss quality')
  })

  it('reports a failing locale without throwing', async () => {
    const page = await payload.create({ collection: 'pages', data: { title: 'X' }, locale: 'en' })
    const results = await translateDocument({
      client: client(fakeSupertext({ statuses: ['limit_exceeded'] })),
      collection: 'pages',
      id: page.id,
      options,
      payload,
      sourceLocale: 'en',
      targetLocales: ['fr'],
    })
    expect(results[0]).toMatchObject({ code: 'quota_exceeded', locale: 'fr', ok: false })
  })

  describe('POST /api/supertext/translate', () => {
    const call = async (body: unknown, user: unknown = { id: 1 }) => {
      const endpoint = payload.config.endpoints.find((e) => e.path === '/supertext/translate')!
      const res = await endpoint.handler({ json: async () => body, payload, user } as never)
      return { body: (await res.json()) as Record<string, unknown>, status: res.status }
    }

    it('requires a logged-in user', async () => {
      expect((await call({}, null)).status).toBe(401)
    })

    it.each([
      [{ sourceLocale: 'en', targetLocales: ['fr'] }, 'exactly one'],
      [{ collection: 'users', id: 1, sourceLocale: 'en', targetLocales: ['fr'] }, 'not enabled'],
      [{ collection: 'pages', sourceLocale: 'en', targetLocales: ['fr'] }, 'Missing "id"'],
      [{ collection: 'pages', id: 1, sourceLocale: 'xx', targetLocales: ['fr'] }, 'sourceLocale'],
      [{ collection: 'pages', id: 1, sourceLocale: 'en', targetLocales: ['it'] }, 'Unknown target'],
      [{ collection: 'pages', id: 1, sourceLocale: 'en', targetLocales: ['en'] }, 'at least one'],
    ])('rejects %j', async (body, message) => {
      const res = await call(body)
      expect(res.status).toBe(400)
      expect(String(res.body.error)).toContain(message)
    })

    it('translates through the endpoint with the configured key', async () => {
      const page = await payload.create({ collection: 'pages', data: { title: 'Via endpoint' }, locale: 'en' })
      const fake = fakeSupertext()
      vi.stubGlobal('fetch', fake.fetch)
      try {
        const res = await call({ collection: 'pages', id: page.id, sourceLocale: 'en', targetLocales: ['de-CH'] })
        expect(res.status).toBe(200)
        expect(res.body.results).toEqual([{ locale: 'de-CH', missing: [], ok: true, segments: 1 }])
        expect(fake.calls[0]?.url).toBe('https://api.supertext.com/v1/translate/ai/file')
      } finally {
        vi.unstubAllGlobals()
      }
    })
  })
})
