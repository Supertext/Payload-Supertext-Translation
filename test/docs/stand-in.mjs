#!/usr/bin/env node
/**
 * Docs screenshots only: answers like the Supertext AI file translation API and
 * returns real German for the demo's seeded content (sample-de.json). Other text
 * comes back unchanged. Listens on :8765 (any API key).
 */
import http from 'node:http'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'

const german = JSON.parse(readFileSync(new URL('sample-de.json', import.meta.url), 'utf8'))
const files = new Map()
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
const encode = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

http
  .createServer(async (req, res) => {
    const path = new URL(req.url, 'http://x').pathname.replace(/^\/v1/, '')
    const send = (status, body, type = 'application/json') => {
      res.writeHead(status, { 'Content-Type': type })
      res.end(type === 'application/json' ? JSON.stringify(body) : body)
    }
    if (path === '/features') return send(200, {})
    if (req.method === 'POST') {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const form = await new Request('http://x', { method: 'POST', headers: req.headers, body: Buffer.concat(chunks) }).formData()
      const id = randomBytes(6).toString('hex')
      files.set(id, await form.get('file').text())
      return send(200, { file_id: id })
    }
    const match = path.match(/file\/([a-f0-9]+)(\/status|\/translation)?$/)
    if (!match) return send(404, {})
    if (req.method === 'DELETE') return send(200, {})
    if (match[2] === '/status') return send(200, { status: 'done' })
    // Segments are leaf elements carrying data-st-id; swap their text when we know it.
    const html = files.get(match[1]).replace(/(<(\w+) data-st-id="\d+">)([^<]*)(<\/\2>)/g, (all, open, _tag, text, close) => {
      const de = german[decode(text).trim()]
      return de === undefined ? all : open + encode(de) + close
    })
    send(200, html, 'text/html')
  })
  .listen(Number(process.env.PORT || 8765), () => console.log(`Stand-in API on http://127.0.0.1:${process.env.PORT || 8765}/v1/`))
