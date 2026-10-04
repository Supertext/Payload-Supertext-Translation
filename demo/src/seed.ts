import type { Payload } from 'payload'

/** Minimal Lexical editor state from paragraphs; `**x**` marks bold, `[t](url)` a link. */
function richText(...paragraphs: string[]) {
  const textNode = (text: string, format = 0) => ({
    detail: 0, format, mode: 'normal', style: '', text, type: 'text', version: 1,
  })
  const parse = (p: string) =>
    p.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/).filter(Boolean).map((part) => {
      const bold = part.match(/^\*\*(.+)\*\*$/)
      if (bold) return textNode(bold[1] as string, 1)
      const link = part.match(/^\[(.+)\]\((.+)\)$/)
      if (link) {
        return {
          children: [textNode(link[1] as string)],
          direction: 'ltr', fields: { linkType: 'custom', newTab: true, url: link[2] },
          format: '', indent: 0, type: 'link', version: 3,
        }
      }
      return textNode(part)
    })
  return {
    root: {
      children: paragraphs.map((p) => ({
        children: parse(p), direction: 'ltr' as const, format: '' as const, indent: 0, textFormat: 0, type: 'paragraph', version: 1,
      })),
      direction: 'ltr' as const, format: '' as const, indent: 0, type: 'root', version: 1,
    },
  }
}

/**
 * Runs on every start. Creates the admin from PAYLOAD_ADMIN_EMAIL / PAYLOAD_ADMIN_PASSWORD
 * when no user exists, and English sample content when there are no pages yet.
 * Without those variables, Payload shows its "create first user" screen instead.
 */
export async function seed(payload: Payload): Promise<void> {
  const email = process.env.PAYLOAD_ADMIN_EMAIL
  const password = process.env.PAYLOAD_ADMIN_PASSWORD
  const { totalDocs: users } = await payload.count({ collection: 'users' })
  if (users === 0 && email && password) {
    await payload.create({ collection: 'users', data: { email, password } })
    payload.logger.info(`[demo] created admin user ${email}`)
  }

  const { totalDocs: pages } = await payload.count({ collection: 'pages' })
  if (pages > 0) return

  await payload.create({
    collection: 'pages',
    data: {
      _status: 'published',
      body: richText(
        'Supertext combines **AI translation** with Swiss language experts. This page was written in English — use the **Translate** button above to create the German, French and Italian versions.',
        'Formatting and [links](https://www.supertext.com) survive translation, and the slug stays the same in every language.',
      ),
      internalNote: 'Demo page — this field is not localized.',
      layout: [
        {
          blockType: 'hero',
          heading: 'Content that speaks every language',
          subheading: 'Translate your Payload pages into German, French and Italian in seconds.',
        },
        {
          blockType: 'faq',
          items: [
            { answer: 'Only fields marked as localized. Images, numbers and relations stay untouched.', question: 'What gets translated?' },
            { answer: 'Into a draft, so an editor can review it before publishing.', question: 'Where does the translation go?' },
          ],
        },
        {
          blockType: 'cta',
          buttonLabel: 'Talk to us',
          buttonUrl: 'https://www.supertext.com/en/contact',
          text: richText('Need a **human review** on top? Supertext linguists can check every translation.'),
        },
      ],
      meta: { description: 'Demo of the Supertext translation plugin for Payload CMS.', title: 'Supertext × Payload demo' },
      slug: 'home',
      title: 'Welcome to the Supertext demo',
    },
    locale: 'en',
  })

  await payload.create({
    collection: 'pages',
    data: {
      _status: 'published',
      body: richText(
        'We are a Swiss language company. Our team combines technology with linguists who know your market.',
        'Every translation can be **reviewed** and edited before it goes live.',
      ),
      slug: 'about',
      title: 'About us',
    },
    locale: 'en',
  })

  await payload.updateGlobal({
    data: {
      nav: [
        { href: '/home', label: 'Home' },
        { href: '/about', label: 'About us' },
      ],
      tagline: 'Swiss quality, in every language',
    },
    locale: 'en',
    slug: 'header',
  })

  payload.logger.info('[demo] seeded sample pages')
}
