import type { Block, Field } from 'payload'

import { makeSegment, type Segment } from './segments.js'

/**
 * Walks a Payload field schema alongside a document and collects every localized
 * text value as a {@link Segment}. Works on a deep clone, so the clone (restricted to
 * the top-level keys that hold translatable content) becomes the update payload for
 * the target locale once translations are applied.
 *
 * Translated: `text` (incl. `hasMany`), `textarea`, `richText` (Lexical JSON).
 * Structure followed: group, row, collapsible, tabs, array, blocks.
 * A field counts as localized when it, or any ancestor, has `localized: true`.
 */

export type CollectOptions = {
  /** Block configs by slug, for `blockReferences` (Payload 3 config.blocks). */
  blocksBySlug?: Record<string, Block>
  /** Field names never translated, at any depth. */
  skipFieldNames?: string[]
}

export type CollectResult = {
  segments: Segment[]
  /** Data to save into the target locale (after applying translations). */
  updateData: Record<string, unknown>
}

type Ctx = {
  blocksBySlug: Record<string, Block>
  nextGroup: number
  segments: Segment[]
  skip: Set<string>
}

type Data = Record<string, unknown>

const isObject = (v: unknown): v is Data => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Fields can opt out with `custom: { supertext: false }` or `custom: { supertext: { translate: false } }`. */
export function isOptedOut(field: Field): boolean {
  const custom = (field as { custom?: Data }).custom
  const st = custom?.supertext
  return st === false || (isObject(st) && st.translate === false)
}

export function collectSegments(fields: Field[], data: Data, options: CollectOptions = {}): CollectResult {
  const ctx: Ctx = {
    blocksBySlug: options.blocksBySlug ?? {},
    nextGroup: 0,
    segments: [],
    skip: new Set(options.skipFieldNames ?? []),
  }
  const clone = structuredClone(data) as Data

  walkFields(fields, clone, '', false, false, ctx)

  // Segment paths always start with the top-level key that holds them. Trim the
  // clone in place (rather than copying values out) so segment holders that are the
  // clone itself — top-level text fields — still write into the returned object.
  const used = new Set(ctx.segments.map((seg) => seg.path.split('.')[0] as string))
  for (const key of Object.keys(clone)) if (!used.has(key)) delete clone[key]
  return { segments: ctx.segments, updateData: clone }
}

/**
 * @param localized   an ancestor is localized
 * @param freshRows   inside a localized array/blocks: rows are new in the target locale,
 *                    so their `id`s are dropped and Payload generates fresh ones
 */
function walkFields(
  fields: Field[],
  data: Data,
  prefix: string,
  localized: boolean,
  freshRows: boolean,
  ctx: Ctx,
): void {
  for (const field of fields) {
    if (isOptedOut(field)) continue
    const f = field as Field & { fields?: Field[]; localized?: boolean; name?: string }
    const name = 'name' in f && typeof f.name === 'string' ? f.name : undefined
    if (name && ctx.skip.has(name)) continue
    const isLocalized = localized || f.localized === true
    const path = name ? (prefix ? `${prefix}.${name}` : name) : prefix

    switch (f.type) {
      case 'text':
      case 'textarea': {
        if (!isLocalized || !name) break
        const value = data[name]
        if (typeof value === 'string') {
          pushSegment(ctx, data, name, value, path)
        } else if (Array.isArray(value)) {
          value.forEach((v, i) => {
            if (typeof v === 'string') pushSegment(ctx, value, i, v, `${path}.${i}`)
          })
        }
        break
      }
      case 'richText': {
        if (!isLocalized || !name) break
        collectLexical(data[name], path, ctx)
        break
      }
      case 'group': {
        if (name) {
          const value = data[name]
          if (isObject(value)) walkFields(f.fields ?? [], value, path, isLocalized, freshRows, ctx)
        } else {
          walkFields(f.fields ?? [], data, prefix, isLocalized, freshRows, ctx)
        }
        break
      }
      case 'row':
      case 'collapsible':
        walkFields(f.fields ?? [], data, prefix, isLocalized, freshRows, ctx)
        break
      case 'tabs': {
        const tabs = (f as unknown as { tabs: Array<{ fields: Field[]; localized?: boolean; name?: string }> }).tabs
        for (const tab of tabs) {
          const tabLocalized = isLocalized || tab.localized === true
          if (tab.name) {
            const value = data[tab.name]
            const tabPath = prefix ? `${prefix}.${tab.name}` : tab.name
            if (isObject(value)) walkFields(tab.fields, value, tabPath, tabLocalized, freshRows, ctx)
          } else {
            walkFields(tab.fields, data, prefix, tabLocalized, freshRows, ctx)
          }
        }
        break
      }
      case 'array': {
        if (!name) break
        const rows = data[name]
        if (!Array.isArray(rows)) break
        const fresh = freshRows || f.localized === true
        rows.forEach((row, i) => {
          if (!isObject(row)) return
          if (fresh) delete row.id
          walkFields(f.fields ?? [], row, `${path}.${i}`, isLocalized, fresh, ctx)
        })
        break
      }
      case 'blocks': {
        if (!name) break
        const rows = data[name]
        if (!Array.isArray(rows)) break
        const fresh = freshRows || f.localized === true
        const blocks = resolveBlocks(f as unknown as BlocksLike, ctx)
        rows.forEach((row, i) => {
          if (!isObject(row)) return
          if (fresh) delete row.id
          const block = blocks.find((b) => b.slug === row.blockType)
          if (!block) return
          walkFields(block.fields, row, `${path}.${i}`, isLocalized, fresh, ctx)
        })
        break
      }
      default:
        break
    }
  }
}

type BlocksLike = { blockReferences?: Array<Block | string>; blocks?: Block[] }

function resolveBlocks(field: BlocksLike, ctx: Ctx): Block[] {
  const refs = field.blockReferences ?? field.blocks ?? []
  return refs
    .map((b) => (typeof b === 'string' ? ctx.blocksBySlug[b] : b))
    .filter((b): b is Block => Boolean(b))
}

function pushSegment(ctx: Ctx, holder: Segment['holder'], key: Segment['key'], value: string, path: string, group?: number) {
  const seg = makeSegment(holder, key, value, path, group)
  if (seg) ctx.segments.push(seg)
}

/* ------------------------------------------------------------------ Lexical */

type LexicalNode = { children?: unknown[]; text?: unknown; type?: unknown }

/** Inline element nodes whose text belongs to the surrounding paragraph. */
const INLINE_TYPES = new Set(['autolink', 'link', 'mark'])

const isTextNode = (n: unknown): n is LexicalNode & { text: string } =>
  isObject(n) && n.type === 'text' && typeof n.text === 'string'

const isInline = (n: unknown) => isTextNode(n) || (isObject(n) && INLINE_TYPES.has(String(n.type)))

/**
 * Lexical editor state: `{ root: { children: [...] } }`. Every element whose children
 * contain text (paragraph, heading, list item, quote, ...) becomes one segment group,
 * with one segment per text node, so formatting (bold, links) stays on the right words.
 * Code blocks (`code-highlight` nodes) and Payload Lexical blocks are not translated.
 */
export function collectLexical(value: unknown, path: string, ctx: Pick<Ctx, 'nextGroup' | 'segments'>): void {
  if (!isObject(value) || !isObject(value.root)) return
  walkLexical(value.root as LexicalNode, `${path}.root`, ctx)
}

function walkLexical(node: LexicalNode, path: string, ctx: Pick<Ctx, 'nextGroup' | 'segments'>): void {
  const children = node.children
  if (!Array.isArray(children)) return
  if (children.some(isInline)) {
    const group = ctx.nextGroup++
    collectInline(node, path, group, ctx)
    return
  }
  children.forEach((child, i) => {
    if (isObject(child)) walkLexical(child as LexicalNode, `${path}.${i}`, ctx)
  })
}

function collectInline(node: LexicalNode, path: string, group: number, ctx: Pick<Ctx, 'segments'>): void {
  node.children?.forEach((child, i) => {
    if (isTextNode(child)) {
      const seg = makeSegment(child as unknown as Data, 'text', child.text, `${path}.${i}`, group)
      if (seg) ctx.segments.push(seg)
    } else if (isObject(child) && Array.isArray(child.children)) {
      collectInline(child as LexicalNode, `${path}.${i}`, group, ctx)
    }
  })
}
