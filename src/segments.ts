import { parse } from 'node-html-parser'

/**
 * A translatable piece of plain text and where to write its translation.
 *
 * `holder[key]` is the location in a cloned copy of the document data; applying a
 * translation simply assigns to it. Leading/trailing whitespace is stored apart so
 * spacing between Lexical text nodes ("Hello " + **bold**) survives translation.
 */
export type Segment = {
  holder: Record<string, unknown> | unknown[]
  key: number | string
  /** Trimmed source text sent to Supertext. */
  text: string
  lead: string
  trail: string
  /**
   * Segments sharing a group are rendered inside one paragraph so the translator sees
   * the whole sentence (e.g. all text nodes of one Lexical paragraph).
   */
  group?: number
  /** Dotted path for logs and error messages, e.g. `layout.0.heading`. */
  path: string
}

export function makeSegment(
  holder: Segment['holder'],
  key: Segment['key'],
  value: string,
  path: string,
  group?: number,
): Segment | null {
  const text = value.trim()
  if (text === '') return null
  const start = value.indexOf(text)
  return {
    group,
    holder,
    key,
    lead: value.slice(0, start),
    path,
    text,
    trail: value.slice(start + text.length),
  }
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const SEGMENT_ATTR = 'data-st-id'

/**
 * Renders segments as one HTML document. Ungrouped segments become `<p data-st-id>`;
 * grouped segments become `<span data-st-id>` inside a shared `<p>`.
 */
export function buildHtml(segments: Segment[]): string {
  const parts: string[] = []
  let openGroup: number | undefined
  segments.forEach((seg, i) => {
    if (openGroup !== undefined && seg.group !== openGroup) {
      parts.push('</p>\n')
      openGroup = undefined
    }
    if (seg.group === undefined) {
      parts.push(`<p ${SEGMENT_ATTR}="${i}">${escapeHtml(seg.text)}</p>\n`)
      return
    }
    if (openGroup === undefined) {
      parts.push('<p>')
      openGroup = seg.group
    } else {
      parts.push(' ')
    }
    parts.push(`<span ${SEGMENT_ATTR}="${i}">${escapeHtml(seg.text)}</span>`)
  })
  if (openGroup !== undefined) parts.push('</p>\n')

  return `<!DOCTYPE html>\n<html><head><meta charset="utf-8"></head><body>\n${parts.join('')}</body></html>`
}

/** Extracts translated plain text per segment index from the returned HTML. */
export function parseHtml(html: string): Map<number, string> {
  const root = parse(html)
  const out = new Map<number, string>()
  for (const el of root.querySelectorAll(`[${SEGMENT_ATTR}]`)) {
    const id = Number(el.getAttribute(SEGMENT_ATTR))
    if (Number.isInteger(id)) out.set(id, el.text.replace(/\s+/g, ' ').trim())
  }
  return out
}

/**
 * Writes translations into the segment holders. Segments the response lost keep their
 * source text; their paths are returned so the caller can report them.
 */
export function applyTranslations(segments: Segment[], translated: Map<number, string>): string[] {
  const missing: string[] = []
  segments.forEach((seg, i) => {
    const value = translated.get(i)
    const text = value === undefined || value === '' ? seg.text : value
    if (value === undefined || value === '') missing.push(seg.path)
    ;(seg.holder as Record<number | string, unknown>)[seg.key] = seg.lead + text + seg.trail
  })
  return missing
}
