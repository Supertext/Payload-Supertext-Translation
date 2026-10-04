import config from '@payload-config'
import Link from 'next/link'
import { getPayload } from 'payload'

export const dynamic = 'force-dynamic'

const LOCALES = ['en', 'de-CH', 'fr-CH', 'it-CH'] as const

export default async function Home() {
  const payload = await getPayload({ config })
  const pages = await payload.find({ collection: 'pages', depth: 0, limit: 50, locale: 'en', sort: 'createdAt' })

  return (
    <main>
      <h1>Supertext × Payload demo</h1>
      <p>
        This Payload CMS 3 site runs the{' '}
        <a href="https://github.com/Supertext/Payload-Supertext-Translation">Supertext translation plugin</a>. Sign in to
        the <Link href="/admin">admin panel</Link>, open a page, and click <b>Translate</b>.
      </p>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Page</th>
              {LOCALES.map((l) => (
                <th key={l}>{l}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pages.docs.map((p) => (
              <tr key={p.id}>
                <td>{p.title}</td>
                {LOCALES.map((l) => (
                  <td key={l}>
                    <Link href={`/${l}/${p.slug}`}>view</Link>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tagline">Published versions are shown here. Translations are saved as drafts — publish them in the admin to see them on this site.</p>
    </main>
  )
}
