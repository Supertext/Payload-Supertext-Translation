import { describe, expect, it } from 'vitest'

import { fromInlineHtml, type LexicalNode, toInlineHtml } from '../src/lexical.js'

const t = (text: string, format = 0) => ({ detail: 0, format, mode: 'normal', style: '', text, type: 'text', version: 1 })

describe('Lexical inline HTML', () => {
  const children = [
    t('Need a '),
    t('human review', 1),
    t(' on top? Read '),
    { children: [t('our guide')], fields: { url: 'https://example.com', linkType: 'custom' }, type: 'link', version: 3 },
    t('.'),
  ]

  it('renders formatting and links as tags', () => {
    const nodes: LexicalNode[] = []
    expect(toInlineHtml(children, nodes)).toBe(
      'Need a <b data-n="0">human review</b> on top? Read <a data-n="1" href="https://example.com">our guide</a>.',
    )
  })

  it('rebuilds reordered translations with the original formatting and link', () => {
    const nodes: LexicalNode[] = []
    toInlineHtml(children, nodes)
    const rebuilt = fromInlineHtml(
      'Sie wünschen eine <b data-n="0">menschliche Prüfung</b>? Lesen Sie <a data-n="1" href="https://example.com">unseren Leitfaden</a>.',
      nodes,
    )!
    expect(rebuilt.map((n) => [n.type, n.type === 'text' ? n.text : (n.children as LexicalNode[])[0]?.text, n.format])).toEqual([
      ['text', 'Sie wünschen eine ', 0],
      ['text', 'menschliche Prüfung', 1],
      ['text', '? Lesen Sie ', 0],
      ['link', 'unseren Leitfaden', undefined],
      ['text', '.', 0],
    ])
    expect((rebuilt[3]?.fields as { url: string }).url).toBe('https://example.com')
  })

  it('decodes entities and keeps text of tags the translator invented', () => {
    const rebuilt = fromInlineHtml('Fish &amp; <em>chips</em>', [])!
    expect(rebuilt.map((n) => n.text).join('')).toBe('Fish & chips')
  })

  it('returns null for an empty translation', () => {
    expect(fromInlineHtml('   ', [])).toBeNull()
  })
})
