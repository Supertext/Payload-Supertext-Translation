# Installation guide

For administrators and developers who set up a Payload project. Editors: see the [User guide](USER_GUIDE.md).

## Requirements

| | |
| --- | --- |
| Payload | 3.x (tested with 3.90) |
| Node.js | 20.9 or newer |
| React | 19 (as required by Payload 3) |
| Database | any Payload adapter (tested with SQLite and Postgres; MongoDB uses the same Local API) |
| Payload localization | must be enabled — the plugin translates between your configured locales |
| Supertext | an API key with access to AI translation (<https://www.supertext.com/en/integrations/api>) |

The server must be able to reach `https://api.supertext.com` over HTTPS.

## Install

The package is not on npm yet. Install it from GitHub (it builds itself on install):

```bash
npm install github:Supertext/Payload-Supertext-Translation
# or: pnpm add github:Supertext/Payload-Supertext-Translation
```

Add the plugin to `payload.config.ts`:

```ts
import { buildConfig } from 'payload'
import { supertextTranslation } from 'payload-supertext-translation'

export default buildConfig({
  localization: {
    defaultLocale: 'en',
    locales: ['en', 'de-CH', 'fr-CH', 'it-CH'],
  },
  collections: [/* ... */],
  plugins: [
    supertextTranslation({
      collections: ['pages', 'posts'],
      globals: ['header', 'footer'],
    }),
  ],
})
```

Then regenerate the admin import map (the plugin adds a client component) and restart:

```bash
npx payload generate:importmap
```

If you skip this step, the admin panel shows an error about `payload-supertext-translation/client#TranslateButton` missing from the import map.

## API key

Set the key as an environment variable on the server — never commit it:

```bash
SUPERTEXT_API_KEY=your-key-here
```

Alternatively pass `apiKey` in the plugin options (read it from your own secret store, not a literal). Without a key the Translate panel shows "No Supertext API key is configured" and the endpoint answers HTTP 500.

## Which fields are translated

Only fields that are **localized** — the field itself, or a parent array/group/tab/blocks field, has `localized: true`:

- `text` (including `hasMany`), `textarea`
- `richText` with the Lexical editor (paragraphs, headings, lists, quotes, links; formatting is kept)
- everything of those types nested in `group`, `row`, `collapsible`, `tabs`, `array` and `blocks` (including `blockReferences`)

Not translated: non-localized fields, `slug` (see `skipFieldNames`), numbers, selects, relationships, uploads, JSON, code fields, Lexical code blocks and Payload blocks inside Lexical.

To exclude a single localized field:

```ts
{ name: 'sku', type: 'text', localized: true, custom: { supertext: false } }
```

## Language setup

Payload locale codes are sent to Supertext as-is, so BCP-47 codes such as `en`, `de`, `de-CH`, `fr-FR`, `pt-BR` need no setup. The source language is always sent as its primary subtag (`de-CH` → `de`), because Supertext rejects regional source codes.

If your locale codes are not BCP-47, map them:

```ts
supertextTranslation({
  collections: ['pages'],
  languageMap: { ch: 'de-CH', romand: 'fr-CH' },
  politeness: { 'de-CH': 'more' }, // formal "Sie"; use 'less' for informal
})
```

## All settings

| Option | Default | Description |
| --- | --- | --- |
| `collections` | `[]` | Collection slugs that get the Translate panel and may be translated via the endpoint. |
| `globals` | `[]` | Global slugs, same as above. |
| `apiKey` | `process.env.SUPERTEXT_API_KEY` | Supertext API key. |
| `environment` | `'live'` | `live`, `staging` or `testing` Supertext API. |
| `apiUrl` | — | Explicit API base URL (e.g. a proxy). Overrides `environment`. |
| `languageMap` | `{}` | Payload locale → Supertext language code. |
| `politeness` | `{}` | Payload locale → `default`, `more` (formal) or `less` (informal). |
| `skipFieldNames` | `['slug']` | Field names never translated, at any depth. |
| `saveAsDraft` | `true` | With drafts enabled, translations are saved as a draft for review. Set `false` to save straight into the current version. |
| `pollIntervalMs` | `2000` | How often the server asks Supertext whether a translation is ready. |
| `timeoutMs` | `180000` | Maximum wait per document and locale (3 minutes). |
| `access` | logged-in user | `({ req }) => boolean` — who may start translations. The collection's/global's own read and update access is always enforced as well. |
| `disabled` | `false` | Leave the endpoints and panel out of the config (the plugin adds no fields, so the schema is unaffected). |

## Recommended: publish one language at a time

With drafts, translations are saved as drafts. Payload's default **Publish** button publishes the latest draft of **all** languages at once, so pending translations in other languages would go live too. To review and release each language on its own, set:

```ts
localization: {
  defaultLocale: 'en',
  defaultLocalePublishOption: 'active', // "Publish" = only the language being viewed
  locales: [/* ... */],
}
```

"Publish all locales" remains available in the publish button's dropdown. This is a Payload setting; the plugin works either way.

## Hosting notes

A translation request stays open until Supertext finishes (usually seconds, at most `timeoutMs`). That is fine on long-running Node servers and containers (e.g. Railway, Docker). On serverless platforms with short function limits (Vercel's default), raise the function timeout for `/api/supertext/*` or expect timeouts on long documents.

## Update

```bash
npm install github:Supertext/Payload-Supertext-Translation
npx payload generate:importmap
```

Check [CHANGELOG.md](../CHANGELOG.md) for changes.

## Uninstall

1. Remove `supertextTranslation(...)` from `plugins`.
2. `npm uninstall payload-supertext-translation`
3. `npx payload generate:importmap`

The plugin adds no collections or fields, so no migration is needed. Translations already saved stay in your documents.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| No Translate button | Collection/global not listed in `collections`/`globals`; localization not enabled; only one locale configured; or the user fails the `access` option. Regenerate the import map after changing the plugin config. |
| "PayloadComponent not found in importMap" | Run `npx payload generate:importmap` and restart. |
| "No Supertext API key is configured" | Set `SUPERTEXT_API_KEY` on the server and restart. |
| "Authentication failure" | The key is wrong or for another environment (`live` vs `staging`). |
| "Your Supertext translation limit is exceeded" | The Supertext subscription quota is used up. |
| `INVALID_LANGUAGE_PAIR` in the error | The target code isn't a language Supertext supports; add a `languageMap` entry. |
| "Timed out waiting…" | Very long document or slow service; raise `timeoutMs` (and the platform's request timeout). |
| "Collection … is not enabled" | The endpoint only accepts slugs listed in the options. |

Server logs show each failure with the prefix `[supertext]`.
