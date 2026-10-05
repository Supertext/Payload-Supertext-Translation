import type { Block, Field } from 'payload'
import { describe, expect, it } from 'vitest'

import { collectSegments } from '../src/collect.js'

const lexical = (...paragraphs: unknown[][]) => ({
  root: { children: paragraphs.map((children) => ({ children, type: 'paragraph' })), type: 'root' },
})
const text = (t: string, format = 0) => ({ format, text: t, type: 'text' })

const hero: Block = {
  fields: [
    { localized: true, name: 'heading', type: 'text' },
    { name: 'image', type: 'text' },
  ],
  slug: 'hero',
}

const fields: Field[] = [
  { localized: true, name: 'title', type: 'text' },
  { localized: true, name: 'slug', type: 'text' },
  { name: 'internalNote', type: 'text' },
  { custom: { supertext: false }, localized: true, name: 'sku', type: 'text' },
  { localized: true, name: 'tags', hasMany: true, type: 'text' },
  { localized: true, name: 'body', type: 'richText' },
  { fields: [{ localized: true, name: 'metaTitle', type: 'text' }], name: 'seo', type: 'group' },
  { fields: [{ localized: true, name: 'subtitle', type: 'textarea' }], type: 'row' },
  {
    tabs: [
      { fields: [{ name: 'caption', type: 'text' }], localized: true, name: 'media' },
      { fields: [{ localized: true, name: 'teaser', type: 'text' }], label: 'Teaser' },
    ],
    type: 'tabs',
  },
  { fields: [{ localized: true, name: 'label', type: 'text' }], name: 'links', type: 'array' },
  { fields: [{ name: 'q', type: 'text' }], localized: true, name: 'faq', type: 'array' },
  { blockReferences: ['hero'], blocks: [], name: 'layout', type: 'blocks' },
  { name: 'untranslatedGroup', type: 'group', fields: [{ name: 'x', type: 'text' }] },
]

const doc = {
  body: lexical([text('Hello '), text('bold', 1), { children: [text('link')], type: 'link' }], [text('Second')]),
  faq: [{ id: 'faq1', q: 'Why?' }],
  id: 1,
  internalNote: 'do not touch',
  layout: [{ blockType: 'hero', heading: 'Welcome', id: 'b1', image: 'hero.jpg' }],
  links: [{ id: 'l1', label: 'Home' }],
  media: { caption: 'A cat' },
  seo: { metaTitle: 'Meta' },
  sku: 'SKU-1',
  slug: 'hello',
  subtitle: 'Sub',
  tags: ['news', 'tech'],
  teaser: 'Tease',
  title: 'Title',
  untranslatedGroup: { x: 'y' },
}

describe('collectSegments', () => {
  const { segments, updateData } = collectSegments(fields, doc, {
    blocksBySlug: { hero },
    skipFieldNames: ['slug'],
  })

  it('collects every localized text in document order', () => {
    expect(segments.map((s) => `${s.path}=${s.text}`)).toEqual([
      'title=Title',
      'tags.0=news',
      'tags.1=tech',
      'body.root.0=Hello boldlink',
      'body.root.1=Second',
      'seo.metaTitle=Meta',
      'subtitle=Sub',
      'media.caption=A cat',
      'teaser=Tease',
      'links.0.label=Home',
      'faq.0.q=Why?',
      'layout.0.heading=Welcome',
    ])
  })

  it('sends each Lexical paragraph as one segment with formatting as tags', () => {
    const body = segments.filter((s) => s.path.startsWith('body'))
    expect(body.map((s) => s.html)).toEqual(['Hello <b data-n="0">bold</b><a data-n="1">link</a>', 'Second'])
  })

  it('only sends top-level keys that hold localized text', () => {
    expect(Object.keys(updateData).sort()).toEqual(
      ['body', 'faq', 'layout', 'links', 'media', 'seo', 'subtitle', 'tags', 'teaser', 'title'].sort(),
    )
  })

  it('keeps row ids of shared arrays and drops them in localized arrays', () => {
    expect((updateData.links as Array<Record<string, unknown>>)[0]?.id).toBe('l1')
    expect((updateData.layout as Array<Record<string, unknown>>)[0]?.id).toBe('b1')
    expect((updateData.faq as Array<Record<string, unknown>>)[0]?.id).toBeUndefined()
  })

  it('never mutates the source document', () => {
    for (const s of segments) (s.holder as Record<string | number, unknown>)[s.key] = 'X'
    expect(doc.title).toBe('Title')
    expect(doc.faq[0]?.id).toBe('faq1')
  })
})
