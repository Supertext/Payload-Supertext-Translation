import { parse } from 'node-html-parser'

export type Call = { method: string; url: string; form?: FormData }

/**
 * In-memory stand-in for the Supertext AI file API. "Translates" by prefixing every
 * segment with `[<target_lang>] `. `statuses` scripts the status sequence per file.
 */
export function fakeSupertext(opts: { statuses?: string[]; drop?: number[]; failStatus?: number; rateLimited?: number } = {}) {
  const calls: Call[] = []
  const files = new Map<string, { html: string; target: string; polls: number }>()
  let n = 0
  let rateLimited = 0

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const form = init?.body instanceof FormData ? init.body : undefined
    calls.push({ form, method, url })

    const auth = new Headers(init?.headers).get('Authorization')
    if (auth !== 'Supertext-Auth-Key test-key') return new Response('bad key', { status: 401 })
    if (opts.failStatus) return new Response('nope', { status: opts.failStatus })
    if (opts.rateLimited && rateLimited < opts.rateLimited) {
      rateLimited++
      return new Response('{"error_code":"RATE_LIMIT_EXCEEDED"}', { status: 429 })
    }

    if (method === 'POST' && url.endsWith('translate/ai/file')) {
      const file = form?.get('file') as Blob
      const id = `f${++n}`
      files.set(id, { html: await file.text(), polls: 0, target: String(form?.get('target_lang')) })
      return Response.json({ file_id: id })
    }
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

  return { calls, fetch: fetchImpl, files }
}
