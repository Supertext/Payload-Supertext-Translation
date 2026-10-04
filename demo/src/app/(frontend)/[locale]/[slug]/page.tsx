import config from '@payload-config'
import { RichText } from '@payloadcms/richtext-lexical/react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

export const dynamic = 'force-dynamic'

const LOCALES = ['en', 'de-CH', 'fr-CH', 'it-CH']

type Args = { params: Promise<{ locale: string; slug: string }> }

type AnyRichText = Parameters<typeof RichText>[0]['data']

export default async function PageView({ params }: Args) {
  const { locale, slug } = await params
  if (!LOCALES.includes(locale)) notFound()

  const payload = await getPayload({ config })
  const [{ docs }, header] = await Promise.all([
    payload.find({ collection: 'pages', depth: 0, limit: 1, locale: locale as never, where: { slug: { equals: slug } } }),
    payload.findGlobal({ depth: 0, locale: locale as never, slug: 'header' }),
  ])
  const page = docs[0]
  if (!page) notFound()

  const layout = (page.layout ?? []) as Array<Record<string, unknown> & { blockType: string; id?: string }>

  return (
    <main>
      <header className="site">
        <div>
          <Link href="/">
            <b>Supertext demo</b>
          </Link>{' '}
          {header.tagline && <span className="tagline">— {header.tagline}</span>}
        </div>
        <nav>
          {(header.nav ?? []).map((item, i) => (
            <Link key={item.id ?? i} href={`/${locale}${item.href}`}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="locales">
          {LOCALES.map((l) => (
            <Link key={l} aria-current={l === locale} href={`/${l}/${slug}`}>
              {l}
            </Link>
          ))}
        </div>
      </header>

      {!page.title ? (
        <div className="missing">
          This page has no published <b>{locale}</b> version yet. Translate it in the <Link href="/admin">admin</Link> and
          publish the draft.
        </div>
      ) : (
        <>
          <h1>{page.title}</h1>
          {layout.map((block, i) => {
            const key = block.id ?? i
            if (block.blockType === 'hero') {
              return (
                <section key={key} className="block hero">
                  <h2>{String(block.heading ?? '')}</h2>
                  {block.subheading ? <p>{String(block.subheading)}</p> : null}
                </section>
              )
            }
            if (block.blockType === 'faq') {
              const items = (block.items ?? []) as Array<{ answer?: string; id?: string; question?: string }>
              return (
                <dl key={key} className="block faq">
                  {items.map((item, j) => (
                    <div key={item.id ?? j}>
                      <dt>{item.question}</dt>
                      <dd>{item.answer}</dd>
                    </div>
                  ))}
                </dl>
              )
            }
            if (block.blockType === 'cta') {
              return (
                <section key={key} className="block">
                  {block.text ? <RichText data={block.text as AnyRichText} /> : null}
                  {block.buttonLabel ? (
                    <a className="button" href={String(block.buttonUrl ?? '#')}>
                      {String(block.buttonLabel)}
                    </a>
                  ) : null}
                </section>
              )
            }
            return null
          })}
          {page.body ? <RichText data={page.body as AnyRichText} /> : null}
        </>
      )}
    </main>
  )
}
