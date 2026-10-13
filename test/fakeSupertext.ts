import { parse } from 'node-html-parser'

import { Languages } from '../src/vendor/supertext-sdk/v1/index.js'

export type Call = { method: string; url: string; form?: FormData; body?: string }

/**
 * In-memory stand-in for the Supertext AI file API. "Translates" by prefixing every
 * segment with `[<target_lang>] `. `statuses` scripts the status sequence per file.
 * Like the real API, it accepts only Supertext's target codes (`de-CH`, `es`; not `de`, `es-ES`;
 * HTTP 404 `INVALID_LANGUAGE_PAIR`), bare sources, and politeness only where the target offers it
 * (HTTP 400 `FEATURE_ERROR`). It also stands in for the Commando Center: `POST …/report` is
 * recorded in `reports` and answered with `centerStatus` (default 202).
 */
export function fakeSupertext(
  opts: { statuses?: string[]; drop?: number[]; failStatus?: number; rateLimited?: number; centerStatus?: number } = {},
) {
  const calls: Call[] = []
  const reports: Record<string, unknown>[] = []
  const files = new Map<string, { html: string; target: string; polls: number }>()
  let n = 0
  let rateLimited = 0

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    // The SDK builds the multipart body itself; read it back as FormData.
    const contentType = new Headers(init?.headers).get('Content-Type') ?? ''
    const form = init?.body instanceof FormData
      ? init.body
      : contentType.startsWith('multipart/form-data') && init?.body
        ? await new Response(init.body as BodyInit, { headers: { 'Content-Type': contentType } }).formData()
        : undefined
    if (method === 'POST' && url.endsWith('/report')) {
      reports.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      return Response.json({ ok: true }, { status: opts.centerStatus ?? 202 })
    }
    calls.push({ form, method, url })

    const auth = new Headers(init?.headers).get('Authorization')
    if (auth !== 'Supertext-Auth-Key test-key') return new Response('bad key', { status: 401 })
    if (opts.failStatus) return new Response('nope', { status: opts.failStatus })
    if (opts.rateLimited && rateLimited < opts.rateLimited) {
      rateLimited++
      return new Response('{"error_code":"RATE_LIMIT_EXCEEDED"}', { status: 429 })
    }

    if (method === 'POST' && url.endsWith('translate/ai/file')) {
      const target = String(form?.get('target_lang') ?? '')
      const source = form?.get('source_lang')
      if (Languages.matchTarget(target) !== target || (typeof source === 'string' && source.includes('-'))) {
        return new Response('{"error_code":"INVALID_LANGUAGE_PAIR"}', { status: 404 })
      }
      const politeness = form?.get('politeness')
      if (typeof politeness === 'string' && Languages.supportsPoliteness(target) === false) {
        return new Response('{"error_code":"FEATURE_ERROR","feature":"politeness"}', { status: 400 })
      }
      const file = form?.get('file') as Blob
      const id = `f${++n}`
      files.set(id, { html: await file.text(), polls: 0, target })
      return Response.json({ file_id: id })
    }
    if (method === 'GET' && url.endsWith('/features')) return Response.json({})
    const m = url.match(/translate\/ai\/file\/([^/]+)(\/status|\/translation)?$/)
    const f = m ? files.get(m[1] as string) : undefined
    if (!m || !f) return new Response('not found', { status: 404 })

    if (m[2] === '/status') {
      const seq = opts.statuses ?? ['done']
      const status = seq[Math.min(f.polls++, seq.length - 1)]
      return Response.json({ status })
    }
    if (m[2] === '/translation') {
      const root = parse(f.html)
      for (const el of root.querySelectorAll('[data-st-id]')) {
        if (opts.drop?.includes(Number(el.getAttribute('data-st-id')))) el.set_content('')
        else el.set_content(`[${f.target}] ${el.innerHTML}`)
      }
      return new Response(root.toString(), { headers: { 'Content-Type': 'text/html' } })
    }
    if (method === 'DELETE') {
      files.delete(m[1] as string)
      return new Response(null, { status: 204 })
    }
    return new Response('unexpected', { status: 400 })
  }) as typeof fetch

  return { calls, fetch: fetchImpl, files, reports }
}
