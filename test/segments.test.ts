import { describe, expect, it } from 'vitest'

import { applyTranslations, buildHtml, makeSegment, parseHtml, type Segment } from '../src/segments.js'

const seg = (holder: Record<string, unknown>, key: string, group?: number) =>
  makeSegment(holder, key, holder[key] as string, key, group) as Segment

describe('segments', () => {
  it('escapes text and round-trips through HTML', () => {
    const data = { a: 'Fish & chips <3', b: '  Hello ', c: 'world' }
    const segments = [seg(data, 'a'), seg(data, 'b', 0), seg(data, 'c', 0)]
    const html = buildHtml(segments)

    expect(html).toContain('<meta charset="utf-8">')
    expect(html).toContain('<p data-st-id="0">Fish &amp; chips &lt;3</p>')
    expect(html).toContain('<p><span data-st-id="1">Hello</span> <span data-st-id="2">world</span></p>')

    const parsed = parseHtml(html)
    expect(parsed.get(0)).toBe('Fish & chips <3')
    expect(applyTranslations(segments, parsed)).toEqual([])
    // Whitespace around a text node is preserved.
    expect(data).toEqual({ a: 'Fish & chips <3', b: '  Hello ', c: 'world' })
  })

  it('skips empty strings', () => {
    expect(makeSegment({ a: '   ' }, 'a', '   ', 'a')).toBeNull()
  })

  it('keeps the source text for segments missing from the response', () => {
    const data = { a: 'one', b: 'two' }
    const segments = [seg(data, 'a'), seg(data, 'b')]
    const missing = applyTranslations(segments, new Map([[0, 'eins']]))
    expect(data).toEqual({ a: 'eins', b: 'two' })
    expect(missing).toEqual(['b'])
  })

  it('collapses whitespace the translator introduces', () => {
    const parsed = parseHtml('<p data-st-id="0">\n  Bonjour\n  le monde </p>')
    expect(parsed.get(0)).toBe('Bonjour le monde')
  })
})
