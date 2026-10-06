# Payload Supertext Translation

AI translation for [Payload CMS 3](https://payloadcms.com) by [Supertext](https://www.supertext.com). Adds a **Translate** button to your localized collections and globals: pick target languages, and the plugin sends the document's localized fields to Supertext and saves the translations into those locales — as drafts for review when drafts are enabled.

```ts
import { supertextTranslation } from 'payload-supertext-translation'

plugins: [supertextTranslation({ collections: ['pages', 'posts'], globals: ['header'] })]
```

Translates localized `text`, `textarea` and Lexical `richText` fields, including inside groups, tabs, arrays and blocks. Formatting and links in rich text are preserved.

**Live demo:** <https://payload-production-cfd2.up.railway.app> (admin at `/admin`, credentials from the Supertext team)

**Requirements:** a Supertext account ([create one or log in](https://www.supertext.com/person/en/account/signin)) and an API key from supertext.com → [Integrations → API](https://www.supertext.com/en/integrations/api) (requires the Admin role), set as `SUPERTEXT_API_KEY`.

## Guides

- [Installation guide](docs/INSTALLATION.md) — requirements, install, API key, languages, all settings, troubleshooting
- [User guide](docs/USER_GUIDE.md) — translating and reviewing in the admin panel
- [Developer guide](docs/DEVELOPER.md) — architecture, Supertext API protocol, tests, releasing, roadmap

Part of Supertext's translation plugins for open source CMSs. See also the [WordPress plugin](https://github.com/Supertext/supertext-wordpress-polylang) and the [Drupal module](https://www.drupal.org/project/tmgmt_supertext_ai).

[Changelog](CHANGELOG.md) · MIT licensed

<!-- supertext-plugins:start (shared list, keep identical in every Supertext plugin repo) -->
## Supertext plugins for other systems

Supertext offers AI and professional translation plugins for these systems:

| System | Plugin | What it does |
| --- | --- | --- |
| Adobe Experience Manager | [supertext-aem-connector](https://github.com/Supertext/supertext-aem-connector) | Translation connector for AEM 6.5's Translation Integration Framework |
| Contao | [Contao-Supertext-Translation](https://github.com/Supertext/Contao-Supertext-Translation) | *Translate with Supertext* in the site structure: pages or whole websites into other languages |
| Craft CMS | [CraftCms-Supertext-Translation](https://github.com/Supertext/CraftCms-Supertext-Translation) | Translates entries into your other sites, Matrix and rich text included |
| Directus | [Directus-Supertext-Translation](https://github.com/Supertext/Directus-Supertext-Translation) | *Translate with Supertext* box on the item form, fills the Translations field |
| django CMS | [djangoCMS-Supertext-Translation](https://github.com/Supertext/djangoCMS-Supertext-Translation) | Translates pages and their plugins from the toolbar |
| Drupal | [tmgmt_supertext_ai](https://www.drupal.org/project/tmgmt_supertext_ai) | Supertext AI provider for Drupal's Translation Management Tool (TMGMT), by MD Systems |
| Ghost | [Ghost-Supertext-Translation](https://github.com/Supertext/Ghost-Supertext-Translation) | Tag a post `#translate-…` and a translated draft appears |
| Grav | [Grav-Supertext-Translation](https://github.com/Supertext/Grav-Supertext-Translation) | Supertext panel in Grav 2's page editor, Markdown kept intact |
| Joomla | [Joomla-Supertext-Translation](https://github.com/Supertext/Joomla-Supertext-Translation) | Translates articles into linked, unpublished language versions |
| Neos | [Neos-Supertext-Translation](https://github.com/Supertext/Neos-Supertext-Translation) | Translates automatically when an editor creates a page in another language |
| Orchard Core | [OrchardCore-Supertext-Translation](https://github.com/Supertext/OrchardCore-Supertext-Translation) | Translates content items into other cultures, on demand or on localization |
| Payload CMS | [Payload-Supertext-Translation](https://github.com/Supertext/Payload-Supertext-Translation) | *Translate* button for localized collections and globals |
| Silverstripe | [Silverstripe-Supertext-Translation](https://github.com/Supertext/Silverstripe-Supertext-Translation) | Supertext tab translates pages and Elemental blocks into Fluent locales |
| Strapi | [Strapi-Supertext-Translation](https://github.com/Supertext/Strapi-Supertext-Translation) | Translates entries into other locales from the Content Manager |
| TYPO3 | [Typo3-Supertext-Translation](https://github.com/Supertext/Typo3-Supertext-Translation) | Translates pages and content elements as editors localize them |
| Umbraco | [Umbraco-Supertext-Translation](https://github.com/Supertext/Umbraco-Supertext-Translation) | *Translate with Supertext* for pages, block lists and grids included |
| Wagtail | [Wagtail-Supertext-Translation](https://github.com/Supertext/Wagtail-Supertext-Translation) | Machine translator for wagtail-localize |
| WordPress (Polylang) | [supertext-wordpress-polylang](https://github.com/Supertext/supertext-wordpress-polylang) | Supertext as Polylang Pro's machine-translation service, plus professional translation orders |
<!-- supertext-plugins:end -->
