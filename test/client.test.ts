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
    await client(fake).translateHtml({ html: '<p data-st-id="0">x</p>', targetLang: 'en-US' })
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
    await expect(client(fake).translateHtml({ html: 'x', targetLang: 'en-US' })).rejects.toMatchObject({ code })
    expect(fake.calls.at(-1)?.method).toBe('DELETE')
  })

  it('times out', async () => {
    const fake = fakeSupertext({ statuses: ['translating'] })
    let now = 0
    const realNow = Date.now
    Date.now = () => now
    try {
      const c = client(fake, { pollIntervalMs: 1000, sleep: async (ms) => void (now += ms), timeoutMs: 5000 })
      await expect(c.translateHtml({ html: 'x', targetLang: 'en-US' })).rejects.toMatchObject({ code: 'timeout' })
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
    const err = await client(fake).translateHtml({ html: 'x', targetLang: 'en-US' }).catch((e: unknown) => e)
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
  it('sends a bare source language', () => {
    expect(sourceCode('en')).toBe('en')
  })
  it('strips the region from a regional source', () => {
    expect(sourceCode('de-CH')).toBe('de')
    expect(sourceCode('pt_BR')).toBe('pt')
    expect(sourceCode('EN-us')).toBe('en')
  })
  it('gives a bare target its default region', () => {
    expect(targetCode('de')).toBe('de-DE')
    expect(targetCode('en')).toBe('en-US')
    expect(targetCode('sl')).toBe('sl-SI')
    expect(targetCode('ZH')).toBe('zh-CN')
  })
  it('keeps a regional target and normalizes case and underscores', () => {
    expect(targetCode('de-CH')).toBe('de-CH')
    expect(targetCode('de_ch')).toBe('de-CH')
    expect(targetCode('fr-ch')).toBe('fr-CH')
    expect(targetCode('zh-hant')).toBe('zh-Hant')
    expect(targetCode('es-419')).toBe('es-419')
  })
  it('lets the mapping win', () => {
    expect(targetCode('ch', { ch: 'de-CH' })).toBe('de-CH')
    expect(targetCode('de', { de: 'de-AT' })).toBe('de-AT')
    expect(sourceCode('ch', { ch: 'de-CH' })).toBe('de')
  })
  it('sends unknown bare codes unchanged', () => {
    expect(targetCode('xx')).toBe('xx')
    expect(targetCode('ch')).toBe('ch')
  })
})

describe('API key', () => {
  it('accepts the key with or without the Supertext-Auth-Key prefix', async () => {
    // The fake accepts exactly "Authorization: Supertext-Auth-Key test-key".
    const fake = fakeSupertext()
    await client(fake, { apiKey: ' Supertext-Auth-Key test-key ' }).validateApiKey()
    await client(fake, { apiKey: 'test-key' }).validateApiKey()
    expect(fake.calls).toHaveLength(2)
  })
})

describe('rate limiting', () => {
  it('retries after HTTP 429 and then succeeds', async () => {
    const fake = fakeSupertext({ rateLimited: 2 })
    const waits: number[] = []
    const html = await client(fake, { sleep: async (ms) => void waits.push(ms) }).translateHtml({
      html: '<p data-st-id="0">Hallo</p>',
      targetLang: 'en-US',
    })
    expect(html).toContain('[en-US] Hallo')
    expect(waits).toHaveLength(2)
  })

  it('gives up after a few retries', async () => {
    const fake = fakeSupertext({ rateLimited: 99 })
    await expect(client(fake).translateHtml({ html: '<p data-st-id="0">Hallo</p>', targetLang: 'en-US' })).rejects.toMatchObject({
      code: 'too_many_requests',
    })
  })

  it('honours Retry-After', async () => {
    const { retryDelayMs } = await import('../src/vendor/supertext-sdk/index.js')
    expect(retryDelayMs(0, '3')).toBe(3000)
    expect(retryDelayMs(1, null)).toBeGreaterThanOrEqual(2000)
  })
})
