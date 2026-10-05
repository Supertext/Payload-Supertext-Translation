import { parse } from 'node-html-parser'

/**
 * A translatable piece of text and where to write its translation.
 *
 * Plain segments: `holder[key]` is the location in a cloned copy of the document data;
 * applying a translation assigns to it. Leading/trailing whitespace is stored apart.
 *
 * Rich segments (one Lexical paragraph, heading, list item...) carry `html`, the
 * element's inline content with formatting and links as tags, and an `apply` callback
 * that rebuilds the Lexical children from the translated HTML. Sending a whole
 * paragraph as one segment lets the translator reorder words across formatting.
 */
export type Segment = {
  holder: Record<string, unknown> | unknown[]
  key: number | string
  /** Trimmed source text (plain segments: sent to Supertext; rich: for length and logs). */
  text: string
  lead: string
  trail: string
  /** Inline HTML sent instead of `text` (rich segments). */
  html?: string
  /** Writes a translated inline HTML fragment back; returns false if it could not be used. */
  apply?: (translatedHtml: string) => boolean
  /** Dotted path for logs and error messages, e.g. `layout.0.heading`. */
  path: string
}

export function makeSegment(holder: Segment['holder'], key: Segment['key'], value: string, path: string): Segment | null {
  const text = value.trim()
  if (text === '') return null
  const start = value.indexOf(text)
  return {
    holder,
    key,
    lead: value.slice(0, start),
    path,
    text,
    trail: value.slice(start + text.length),
  }
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const SEGMENT_ATTR = 'data-st-id'

/** Renders segments as one HTML document, one `<p data-st-id>` per segment. */
export function buildHtml(segments: Segment[]): string {
  const parts = segments.map((seg, i) => `<p ${SEGMENT_ATTR}="${i}">${seg.html ?? escapeHtml(seg.text)}</p>\n`)
  return `<!DOCTYPE html>\n<html><head><meta charset="utf-8"></head><body>\n${parts.join('')}</body></html>`
}

/** Extracts the translated inner HTML per segment index from the returned document. */
export function parseHtml(html: string): Map<number, string> {
  const root = parse(html)
  const out = new Map<number, string>()
  for (const el of root.querySelectorAll(`[${SEGMENT_ATTR}]`)) {
    const id = Number(el.getAttribute(SEGMENT_ATTR))
    if (Number.isInteger(id)) out.set(id, el.innerHTML)
  }
  return out
}

const plainText = (fragment: string) => parse(fragment).text.replace(/\s+/g, ' ').trim()

/**
 * Writes translations into the segments. Segments the response lost (or whose rich
 * text could not be rebuilt) keep their source text; their paths are returned so the
 * caller can report them.
 */
export function applyTranslations(segments: Segment[], translated: Map<number, string>): string[] {
  const missing: string[] = []
  segments.forEach((seg, i) => {
    const value = translated.get(i)
    if (seg.apply) {
      if (value === undefined || plainText(value) === '' || !seg.apply(value)) missing.push(seg.path)
      return
    }
    const text = value === undefined ? '' : plainText(value)
    if (text === '') missing.push(seg.path)
    ;(seg.holder as Record<number | string, unknown>)[seg.key] = seg.lead + (text || seg.text) + seg.trail
  })
  return missing
}
