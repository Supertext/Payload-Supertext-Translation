# Payload Supertext Translation

AI translation for [Payload CMS 3](https://payloadcms.com) by [Supertext](https://www.supertext.com). Adds a **Translate** button to your localized collections and globals: pick target languages, and the plugin sends the document's localized fields to Supertext and saves the translations into those locales — as drafts for review when drafts are enabled.

```ts
import { supertextTranslation } from 'payload-supertext-translation'

plugins: [supertextTranslation({ collections: ['pages', 'posts'], globals: ['header'] })]
```

Translates localized `text`, `textarea` and Lexical `richText` fields, including inside groups, tabs, arrays and blocks. Formatting and links in rich text are preserved.

## Guides

- [Installation guide](docs/INSTALLATION.md) — requirements, install, API key, languages, all settings, troubleshooting
- [User guide](docs/USER_GUIDE.md) — translating and reviewing in the admin panel
- [Developer guide](docs/DEVELOPER.md) — architecture, Supertext API protocol, tests, releasing, roadmap

Part of Supertext's translation plugins for open source CMSs. See also the [WordPress plugin](https://github.com/Supertext/supertext-wordpress-polylang) and the [Drupal module](https://www.drupal.org/project/tmgmt_supertext_ai).

[Changelog](CHANGELOG.md) · MIT licensed
