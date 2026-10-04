import type { GlobalConfig } from 'payload'

export const Header: GlobalConfig = {
  access: { read: () => true },
  fields: [
    { localized: true, name: 'tagline', type: 'text' },
    {
      fields: [
        { localized: true, name: 'label', required: true, type: 'text' },
        { name: 'href', required: true, type: 'text' },
      ],
      name: 'nav',
      type: 'array',
    },
  ],
  slug: 'header',
}
