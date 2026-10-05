import { type HTMLElement, type Node as HtmlNode, NodeType, parse } from 'node-html-parser'

import { escapeHtml } from './segments.js'

/**
 * Lexical inline content <-> HTML fragment, so a whole paragraph is translated as one
 * sentence while bold, italic, links etc. stay on the right words.
 *
 * Every inline node is tagged with `data-n` (its index in `nodes`); plain text nodes
 * without formatting are written as bare text. Rebuilding clones the original node
 * for each tag and creates plain text nodes for bare text.
 */

export type LexicalNode = { [key: string]: unknown; children?: unknown[]; type?: unknown }

const isObject = (v: unknown): v is LexicalNode => typeof v === 'object' && v !== null && !Array.isArray(v)

// Lexical text format bits
const FORMAT_TAGS: Array<[number, string]> = [
  [1, 'b'],
  [2, 'i'],
  [8, 'u'],
  [4, 's'],
  [16, 'code'],
  [32, 'sub'],
  [64, 'sup'],
]

const isPlainText = (n: LexicalNode) =>
  n.type === 'text' && !n.format && !n.style && (n.mode === undefined || n.mode === 'normal')

export function toInlineHtml(children: unknown[], nodes: LexicalNode[]): string {
  return children
    .map((child) => {
      if (!isObject(child)) return ''
      if (child.type === 'text' && typeof child.text === 'string') {
        if (isPlainText(child)) return escapeHtml(child.text)
        const n = nodes.push(child) - 1
        const tag = FORMAT_TAGS.find(([bit]) => Number(child.format) & bit)?.[1] ?? 'span'
        return `<${tag} data-n="${n}">${escapeHtml(child.text)}</${tag}>`
      }
      if (child.type === 'linebreak') {
        return `<br data-n="${nodes.push(child) - 1}">`
      }
      if (child.type === 'tab') {
        return `<span data-n="${nodes.push(child) - 1}" translate="no">\t</span>`
      }
      const n = nodes.push(child) - 1
      if (Array.isArray(child.children)) {
        const fields = isObject(child.fields) ? child.fields : {}
        const href = typeof fields.url === 'string' ? ` href="${escapeHtml(fields.url)}"` : ''
        const tag = child.type === 'link' || child.type === 'autolink' ? 'a' : 'span'
        return `<${tag} data-n="${n}"${href}>${toInlineHtml(child.children, nodes)}</${tag}>`
      }
      // Anything else inline (inline blocks, mentions...) is kept as is.
      return `<span data-n="${n}" translate="no"></span>`
    })
    .join('')
}

const clone = <T>(v: T): T => structuredClone(v)

const plainTextNode = (text: string): LexicalNode => ({
  detail: 0,
  format: 0,
  mode: 'normal',
  style: '',
  text,
  type: 'text',
  version: 1,
})

function rebuild(parent: HTMLElement, nodes: LexicalNode[], used: Set<number>): LexicalNode[] {
  const out: LexicalNode[] = []
  for (const child of parent.childNodes as HtmlNode[]) {
    if (child.nodeType === NodeType.TEXT_NODE) {
      const text = child.text
      if (text !== '') out.push(plainTextNode(text))
      continue
    }
    if (child.nodeType !== NodeType.ELEMENT_NODE) continue
    const el = child as HTMLElement
    const n = Number(el.getAttribute('data-n'))
    const orig = Number.isInteger(n) ? nodes[n] : undefined
    if (!orig || used.has(n)) {
      // A tag the translator added or duplicated: keep its text, drop the tag.
      out.push(...rebuild(el, nodes, used))
      continue
    }
    used.add(n)
    const copy = clone(orig)
    if (orig.type === 'text') {
      copy.text = el.text
      if (copy.text !== '') out.push(copy)
    } else if (Array.isArray(orig.children)) {
      copy.children = rebuild(el, nodes, used)
      out.push(copy)
    } else {
      out.push(copy)
    }
  }
  return out
}

/** Rebuilds Lexical children from translated inline HTML; null if nothing usable came back. */
export function fromInlineHtml(html: string, nodes: LexicalNode[]): LexicalNode[] | null {
  const root = parse(`<div>${html}</div>`).querySelector('div')
  if (!root) return null
  const children = rebuild(root, nodes, new Set())
  // Lexical trims nothing for us; drop leading/trailing whitespace of the paragraph.
  const first = children[0]
  if (first?.type === 'text' && typeof first.text === 'string') first.text = first.text.replace(/^\s+/, '')
  const last = children[children.length - 1]
  if (last?.type === 'text' && typeof last.text === 'string') last.text = last.text.replace(/\s+$/, '')
  const result = children.filter((c) => !(c.type === 'text' && c.text === ''))
  return result.length ? result : null
}
