import { describe, expect, it } from 'vitest'

import { sourceCode, targetCode } from '../src/languages.js'
import { SupertextClient, SupertextError } from '../src/supertext/client.js'
import { fakeSupertext } from './fakeSupertext.js'

const noSleep = async () => {}
const client = (fake: ReturnType<typeof fakeSupertext>, extra: Partial<ConstructorParameters<typeof SupertextClient>[0]> = {}) =>
  new SupertextClient({ apiKey: 'test-key', baseUrl: 'https://api.test/v1', fetch: fake.fetch, sleep: noSleep, ...extra })

describe('SupertextClient', () => {
  it('runs upload → poll → download → delete', async () => {
    const fake = fakeSupertext({ statuses: ['translating', 'translating', 'done'] })
    const html = await client(fake).translateHtml({
      html: '<p data-st-id="0">Hallo</p>',
      politeness: 'more',
      sourceLang: 'de',
      targetLang: 'fr-CH',
    })

    expect(html).toContain('[fr-CH] Hallo')
    expect(fake.calls.map((c) => `${c.method} ${c.url.replace('https://api.test/v1/', '')}`)).toEqual([
      'POST translate/ai/file',
      'GET translate/ai/file/f1/status',
      'GET translate/ai/file/f1/status',
      'GET translate/ai/file/f1/status',
      'GET translate/ai/file/f1/translation',
      'DELETE translate/ai/file/f1',
    ])
    const form = fake.calls[0]?.form as FormData
    expect(form.get('target_lang')).toBe('fr-CH')
    expect(form.get('source_lang')).toBe('de')
    expect(form.get('politeness')).toBe('more')
    // Must be exactly text/html — a charset suffix is rejected with 415.
    expect((form.get('file') as File).type).toBe('text/html')
    expect((form.get('file') as File).name).toBe('content.html')
  })

  it('omits optional fields when not needed', async () => {
    const fake = fakeSupertext()
    await client(fake).translateHtml({ html: '<p data-st-id="0">x</p>', targetLang: 'en' })
    const form = fake.calls[0]?.form as FormData
    expect(form.has('source_lang')).toBe(false)
    expect(form.has('politeness')).toBe(false)
  })

  it.each([
    ['error', 'translation_error'],
    ['limit_exceeded', 'quota_exceeded'],
    ['deleted', 'file_deleted'],
  ])('maps status %s and still deletes the file', async (status, code) => {
    const fake = fakeSupertext({ statuses: [status] })
    await expect(client(fake).translateHtml({ html: 'x', targetLang: 'en' })).rejects.toMatchObject({ code })
    expect(fake.calls.at(-1)?.method).toBe('DELETE')
  })

  it('times out', async () => {
    const fake = fakeSupertext({ statuses: ['translating'] })
    let now = 0
    const realNow = Date.now
    Date.now = () => now
    try {
      const c = client(fake, { pollIntervalMs: 1000, sleep: async (ms) => void (now += ms), timeoutMs: 5000 })
      await expect(c.translateHtml({ html: 'x', targetLang: 'en' })).rejects.toMatchObject({ code: 'timeout' })
    } finally {
      Date.now = realNow
    }
  })

  it.each([
    [401, 'authentication_failure'],
    [413, 'payload_too_large'],
    [429, 'too_many_requests'],
    [503, 'service_unavailable'],
    [418, 'unexpected_status'],
  ])('maps HTTP %i', async (status, code) => {
    const fake = fakeSupertext({ failStatus: status })
    const err = await client(fake).submitFile({ html: 'x', targetLang: 'en' }).catch((e) => e)
    expect(err).toBeInstanceOf(SupertextError)
    expect(err).toMatchObject({ code, status })
  })

  it('refuses to call without an API key', async () => {
    const fake = fakeSupertext()
    await expect(client(fake, { apiKey: '' }).validateApiKey()).rejects.toMatchObject({ code: 'missing_api_key' })
    expect(fake.calls).toHaveLength(0)
  })
})

describe('language codes', () => {
  it('sends the source as primary subtag and keeps target regions', () => {
    expect(sourceCode('de-CH')).toBe('de')
    expect(sourceCode('pt_BR')).toBe('pt')
    expect(targetCode('de-CH')).toBe('de-CH')
    expect(targetCode('ch', { ch: 'de-CH' })).toBe('de-CH')
    expect(sourceCode('ch', { ch: 'de-CH' })).toBe('de')
  })
})

describe('authHeader', () => {
  it('accepts the key with or without the Supertext-Auth-Key prefix', async () => {
    const { authHeader } = await import('../src/supertext/client.js')
    expect(authHeader('abc+/=')).toBe('Supertext-Auth-Key abc+/=')
    expect(authHeader(' Supertext-Auth-Key abc+/= ')).toBe('Supertext-Auth-Key abc+/=')
  })
})
