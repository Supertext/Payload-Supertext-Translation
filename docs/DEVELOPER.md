# Developer guide

## Architecture

```
src/
  index.ts                 plugin factory: adds endpoints + admin component to configured collections/globals
  types.ts                 plugin options and endpoint request/response types
  endpoints.ts             GET /api/supertext/status, POST /api/supertext/translate (auth, validation)
  translate.ts             translateDocument(): read source locale → collect → Supertext → write target locales
  collect.ts               walks the field schema + document; returns Segments and the update payload
  segments.ts              Segment type, HTML build/parse, applying translations
  languages.ts             Payload locale → Supertext code (target keeps region, source = primary subtag)
  supertext/client.ts      Supertext AI file API v1 client (fetch-based, no Payload dependency)
  components/TranslateButton.tsx   client component in the edit view header
  exports/client.ts        'payload-supertext-translation/client' entry (import map)
demo/                      demo Payload site (Next.js), deployed to Railway — see "Demo app"
```

### Flow of one translation

1. The editor clicks **Translate** (`TranslateButton`, in `admin.components.edit.beforeDocumentControls` for collections and `admin.components.elements.beforeDocumentControls` for globals). It POSTs `{ collection | global, id, sourceLocale, targetLocales }` to `/api/supertext/translate`.
2. `endpoints.ts` checks the user, the `access` option, the API key, the slug allow-list and the locales.
3. `translateDocument` reads the saved source with `findByID`/`findGlobal` (`depth: 0`, `fallbackLocale: false`, latest draft when drafts are enabled) with `overrideAccess: false` and the editor as `user`.
4. Per target locale (in parallel): `collectSegments` deep-clones the document and walks the **sanitized** field config (`payload.collections[slug].config.fields`; `blockReferences` resolve via `payload.config.blocks`). Each localized text becomes a `Segment` that points at its location in the clone (`holder[key]`). The clone is trimmed to the top-level keys holding segments; it is the update payload.
5. `buildHtml` renders segments into one HTML file; `SupertextClient.translateHtml` runs the API round trip; `parseHtml` + `applyTranslations` write results into the clone.
6. Saves run **serialized** (`payload.update` / `updateGlobal` with `locale`, `draft`), because parallel saves of one document race on its version history and lose a locale.
7. The response lists a result per locale; one failing locale doesn't stop the others.

### Field rules

- Localized = field or any ancestor has `localized: true`.
- Translated leaf types: `text` (incl. `hasMany`), `textarea`, `richText` (Lexical JSON).
- Opt-out: `custom: { supertext: false }` or `custom: { supertext: { translate: false } }`; names in `skipFieldNames` (default `slug`).
- **Row ids**: rows of non-localized arrays/blocks keep their `id` (rows are shared across locales; Payload matches them by id). Rows inside a localized array/blocks field (and below) have `id` removed, so the target locale gets fresh rows instead of colliding with the source locale's row ids.
- Non-localized siblings inside included arrays are sent with their unchanged source values.

### HTML format

```html
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head><body>
<p data-st-id="0">Plain field text</p>
<p><span data-st-id="1">Hello </span> <span data-st-id="2">bold</span></p>   <!-- one Lexical paragraph -->
</body></html>
```

- Text is HTML-escaped; every segment carries `data-st-id` = its index. Supertext keeps markup and attributes and translates text nodes.
- Text nodes of one Lexical block element (paragraph, heading, list item, quote; inline `link`/`autolink` descend) share a `<p>`, so the translator sees the whole sentence; formatting stays per text node.
- Leading/trailing whitespace is stored on the segment and re-applied, so spacing between text nodes survives.
- A segment missing or empty in the response keeps its source text and is reported in `missing` (logged as a warning, surfaced to the editor).

## Supertext API protocol

AI file translation API v1, same as the WordPress plugin. Base URLs: `https://api.supertext.com/v1/` (live), `https://api.staging.supertext.com/v1/`, `https://api.testing.supertext.com/v1/`. Header `Authorization: Supertext-Auth-Key <key>`, `Accept: application/json`.

| Step | Request | Notes |
| --- | --- | --- |
| Upload | `POST translate/ai/file` multipart: `file` (`content.html`, type exactly `text/html`), `target_lang`, optional `source_lang`, optional `politeness` (`more`/`less`) | Returns `{ file_id }`. A `; charset=` suffix on the part type is rejected with 415. Up to 1,000,000 characters per file. |
| Poll | `GET translate/ai/file/{id}/status` | `translating` → keep polling; `done`; `error`; `limit_exceeded`; `deleted`. |
| Download | `GET translate/ai/file/{id}/translation` | Translated HTML. |
| Delete | `DELETE translate/ai/file/{id}` | Best effort, always attempted; files expire after 24 h. |
| Key check | `GET features` | Cost-free (`SupertextClient.validateApiKey`, not yet wired to the UI). |

`source_lang` must be a primary subtag (`de`, not `de-CH`) or Supertext answers `INVALID_LANGUAGE_PAIR`; `target_lang` keeps its region. HTTP errors map to `SupertextError` codes: 401/403 `authentication_failure`, 404 `not_found`, 413 `payload_too_large`, 429 `too_many_requests`, 500/502/503 `service_unavailable`, otherwise `unexpected_status`; the first 200 characters of the response body are appended to the message.

## Endpoints

| Method | Path | Body / response |
| --- | --- | --- |
| GET | `/api/supertext/status` | `{ apiKeyConfigured, canTranslate, locales }` — used by the panel. 401 when not logged in. |
| POST | `/api/supertext/translate` | Body `TranslateRequestBody`. 200 with `{ results: LocaleResult[] }` if any locale succeeded, 502 if all failed, 400/401/403/500 with `{ error }` for validation, auth, permission and missing-key errors. |

`LocaleResult` is `{ locale, ok: true, segments, missing: string[] }` or `{ locale, ok: false, error, code? }`.

`translateDocument` is exported for server-side use (hooks, jobs, scripts); without `req` it runs with `overrideAccess: true`.

## Local setup

```bash
git clone https://github.com/Supertext/Payload-Supertext-Translation.git
cd Payload-Supertext-Translation
npm install          # also builds dist/ via the prepare script
npm test             # unit + integration tests
npm run typecheck
npm run build
```

To try it in a Payload app, link it (`npm link`, or `"payload-supertext-translation": "file:../Payload-Supertext-Translation"`), add the plugin, run `npx payload generate:importmap`, and set `SUPERTEXT_API_KEY` (use `environment: 'staging'` with a staging key while developing).

## Tests

Vitest, in `test/`:

- `segments.test.ts` — HTML build/parse, escaping, whitespace, missing segments
- `collect.test.ts` — schema walking for every supported field type, Lexical grouping, row-id rules, opt-outs
- `client.test.ts` — API round trip, form fields, status and HTTP error mapping, timeout, language codes
- `integration.test.ts` — boots a real Payload 3 instance on in-memory SQLite with Lexical, drafts, arrays, blocks and a global; covers translating into several locales, drafts, globals, failures and the endpoint (auth, validation, happy path)

`test/fakeSupertext.ts` is an in-memory Supertext API that "translates" by prefixing `[<target_lang>]`. No test calls the real API.

## CI / deploy

`.github/workflows/ci.yml` runs typecheck, tests and build on Node 20 and 22 for pushes to `main` and pull requests.

### Demo app (`demo/`)

A small Payload 3 + Next.js 16 site that uses the plugin the way a customer would: Pages (drafts, blocks in tabs, rich text, SEO group, a non-localized field) and a Header global, locales `en`, `de-CH`, `fr-CH`, `it-CH`, SQLite. A public frontend at `/<locale>/<slug>` shows the published version of each language.

- `src/seed.ts` runs on start: creates the admin from `PAYLOAD_ADMIN_EMAIL`/`PAYLOAD_ADMIN_PASSWORD` when there are no users, and English sample content when there are no pages.
- Schema changes need a migration: `cd demo && npm run payload migrate:create <name>`, commit `src/migrations/`. Production applies them on start (`prodMigrations`); there is no automatic schema push in production.
- `localization.defaultLocalePublishOption: 'active'` makes **Publish** release only the language being viewed (see "Publishing" in the user guide).

Run locally:

```bash
cd demo
cp .env.example .env        # set PAYLOAD_SECRET, SUPERTEXT_API_KEY (staging key + SUPERTEXT_ENVIRONMENT=staging while developing)
npm run plugin              # build + pack the plugin from the repo root into demo/vendor/
npm install
npm run dev                 # http://localhost:3000, admin at /admin
```

After changing plugin code, run `npm run plugin && npm install` again. The plugin is installed from a packed tarball (not a symlink) so Payload/React resolve to a single copy.

`SUPERTEXT_API_URL` points the demo at any API base URL, e.g. a local fake Supertext for offline testing.

### Railway deployment

Service **Payload** in the Railway project `supertext-cms-demos` (region Amsterdam), deployed from this repo's `main` on every push.

| Setting | Value |
| --- | --- |
| Builder | Dockerfile, path `demo/Dockerfile`, build context = repo root |
| Volume | mounted at `/data` (SQLite database `/data/payload-demo.db`) |
| Healthcheck | `/` |
| Variables | `PAYLOAD_SECRET`, `SUPERTEXT_API_KEY`, `SUPERTEXT_ENVIRONMENT`, `PAYLOAD_ADMIN_EMAIL`, `PAYLOAD_ADMIN_PASSWORD` (set in Railway, never in the repo) |

The Dockerfile packs the plugin from the repo root, installs it into the demo, builds Next.js in standalone mode and runs `node server.js` on port 3000. To reset the demo content, delete `/data/payload-demo.db` (or recreate the volume) and redeploy.

## Releasing

1. Move *Unreleased* entries in `CHANGELOG.md` under a new version heading.
2. Bump `version` in `package.json`.
3. Commit, tag `vX.Y.Z`, push with tags.
4. Publishing to npm is not set up yet; until then installs use the GitHub URL (optionally `#vX.Y.Z`).

## Known limitations / roadmap

- Translation is synchronous within the HTTP request (like the WordPress plugin). Next: run it as a Payload Jobs Queue task so long documents and bulk translation don't depend on request timeouts.
- No bulk action in list views yet.
- Payload blocks embedded in Lexical (BlocksFeature) and Lexical code blocks are not translated.
- Slate rich text (Payload 2 legacy) is not supported.
- Re-translating overwrites the target locale's translated fields; there is no change detection or translation memory.
- No API key check button in the admin panel yet (`validateApiKey` exists in the client).
- Human (professional) translation orders, as in the WordPress plugin, are not implemented.
- Not published on npm yet.
