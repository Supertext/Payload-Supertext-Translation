import type { Block, CollectionConfig } from 'payload'

const Hero: Block = {
  fields: [
    { localized: true, name: 'heading', required: true, type: 'text' },
    { localized: true, name: 'subheading', type: 'textarea' },
  ],
  slug: 'hero',
}

const CallToAction: Block = {
  fields: [
    { localized: true, name: 'text', type: 'richText' },
    { localized: true, name: 'buttonLabel', type: 'text' },
    { name: 'buttonUrl', type: 'text' },
  ],
  slug: 'cta',
}

const Faq: Block = {
  fields: [
    {
      fields: [
        { localized: true, name: 'question', type: 'text' },
        { localized: true, name: 'answer', type: 'textarea' },
      ],
      name: 'items',
      type: 'array',
    },
  ],
  slug: 'faq',
}

export const Pages: CollectionConfig = {
  access: { read: () => true },
  admin: { defaultColumns: ['title', 'slug', '_status', 'updatedAt'], useAsTitle: 'title' },
  fields: [
    { localized: true, name: 'title', required: true, type: 'text' },
    { admin: { position: 'sidebar' }, index: true, name: 'slug', required: true, type: 'text', unique: true },
    {
      tabs: [
        { fields: [{ name: 'layout', type: 'blocks', blocks: [Hero, CallToAction, Faq] }], label: 'Content' },
        { fields: [{ localized: true, name: 'body', type: 'richText' }], label: 'Body' },
        {
          fields: [
            { localized: true, name: 'title', type: 'text' },
            { localized: true, name: 'description', type: 'textarea' },
          ],
          label: 'SEO',
          name: 'meta',
        },
      ],
      type: 'tabs',
    },
    {
      admin: { description: 'Not localized: identical in every language, never translated.', position: 'sidebar' },
      name: 'internalNote',
      type: 'text',
    },
  ],
  slug: 'pages',
  versions: { drafts: true },
}
