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
  lexical.ts               Lexical inline content <-> inline HTML (one segment per paragraph)
  languages.ts             Payload locale → Supertext code (target keeps region, source = primary subtag)
  supertext/client.ts      Supertext AI file API v1 client (fetch-based, no Payload dependency)
  translations.ts          UI and error strings in en/de/fr/it (namespace `supertext`)
  i18n.ts                  merges them into config.i18n.translations; req.t()-based messages for the endpoints
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
<p data-st-id="1">Need a <b data-n="0">human review</b>? Read <a data-n="1" href="https://example.com">our guide</a>.</p>   <!-- one Lexical paragraph -->
</body></html>
```

- Text is HTML-escaped; every segment carries `data-st-id` = its index. Supertext keeps markup and attributes and translates text nodes.
- Each Lexical block element whose children are inline (paragraph, heading, list item, quote) is **one segment**, sent as inline HTML (`src/lexical.ts`): formatted text nodes become `<b>`, `<i>`, `<u>`, `<s>`, `<code>`, `<sub>`, `<sup>` (or `<span>`), links `<a href>`, line breaks `<br>`, each tagged `data-n` = index of the original node; unformatted text is bare. The translator can reorder words across formatting. On the way back each tagged element clones its original node (format, style, link fields) with the translated text; bare text becomes plain text nodes; tags the translator added are dropped, their text kept.
- Earlier versions sent every text node as its own `<span data-st-id>`. The live API translates each `data-st-id` element on its own, which broke sentences at formatting boundaries (lower-case sentence starts, text moved outside spans), so don't go back to that.
- Plain fields: leading/trailing whitespace is stored on the segment and re-applied.
- A segment missing or empty in the response keeps its source text and is reported in `missing` (logged as a warning, surfaced to the editor).

### Interface strings

All strings the plugin shows live in `src/translations.ts` (`en`, `de`, `fr`, `it`). `withSupertextTranslations` (in `src/i18n.ts`) merges them into `config.i18n.translations` under the `supertext` namespace: each language gets its own strings, every other supported language gets English, and strings the project defines itself win. The client component reads them with `useTranslation()` (`t('supertext:translate')`); the endpoints and `translateDocument` use the request's `req.t` through `translate(req, key)` and `errorMessage(req, err)`, so editors get server messages in their admin language too. Placeholders use Payload's `{{name}}` syntax.

`SupertextError.message` stays English (logs, API clients). UIs translate `code` (`error_<code>` keys) and append `detail`, the API's own text. The client file is shared with the Directus plugin; port changes both ways.

New or changed strings need all four languages in the same commit: formal address (Sie, vous, Lei), Payload's own terms (*Dokument*/*document*/*documento*, *Entwurf*/*brouillon*/*bozza*), "Supertext", `{{placeholders}}` and URLs unchanged. `test/translations.test.ts` checks keys, placeholders and URLs.

## Supertext API protocol

AI file translation API v1, same as the WordPress plugin. Base URLs: `https://api.supertext.com/v1/` (live), `https://api.staging.supertext.com/v1/`, `https://api.testing.supertext.com/v1/`. Header `Authorization: Supertext-Auth-Key <key>`, `Accept: application/json`. The key may be configured with or without the `Supertext-Auth-Key ` prefix; the client strips it and always sends exactly one. The header name must be `Authorization` (the live API answers 403 to `Authentication`).

| Step | Request | Notes |
| --- | --- | --- |
| Upload | `POST translate/ai/file` multipart: `file` (`content.html`, type exactly `text/html`), `target_lang`, optional `source_lang`, optional `politeness` (`more`/`less`) | Returns `{ file_id }`. A `; charset=` suffix on the part type is rejected with 415. Up to 1,000,000 characters per file. |
| Poll | `GET translate/ai/file/{id}/status` | `translating` → keep polling; `done`; `error`; `limit_exceeded`; `deleted`. |
| Download | `GET translate/ai/file/{id}/translation` | Translated HTML. |
| Delete | `DELETE translate/ai/file/{id}` | Best effort, always attempted; files expire after 24 h. |
| Key check | `GET features` | Cost-free (`SupertextClient.validateApiKey`, not yet wired to the UI). |

`source_lang` must be a primary subtag (`de`, not `de-CH`) or Supertext answers `INVALID_LANGUAGE_PAIR`; `target_lang` keeps its region. HTTP errors map to `SupertextError` codes: 401/403 `authentication_failure`, 404 `not_found`, 413 `payload_too_large`, 429 `too_many_requests`, 500/502/503 `service_unavailable`, otherwise `unexpected_status`; the first 200 characters of the response body are appended to the message.

**Rate limit:** the API limits requests per second per key (HTTP 429, `RATE_LIMIT_EXCEEDED`); translating into several languages at once hits it. The client retries a 429 up to 4 times, waiting for `Retry-After` if sent, otherwise 1, 2, 4 and 8 seconds (plus jitter), before reporting *Too many requests*.

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
- `translations.test.ts` — all four languages have the English keys, placeholders and URLs; every key the control and endpoints use and every `SupertextErrorCode` has a message; config merging; French messages through Payload's own `initI18n`
- `integration.test.ts` — boots a real Payload 3 instance on in-memory SQLite with Lexical, drafts, arrays, blocks and a global; covers translating into several locales, drafts, globals, failures and the endpoint (auth, validation, happy path)

`test/fakeSupertext.ts` is an in-memory Supertext API that "translates" by prefixing `[<target_lang>]`. No test calls the real API.

## CI / deploy

`.github/workflows/ci.yml` runs typecheck, tests and build on Node 20 and 22 for pushes to `main` and pull requests.

### Demo app (`demo/`)

A small Payload 3 + Next.js 16 site that uses the plugin the way a customer would: Pages (drafts, blocks in tabs, rich text, SEO group, a non-localized field) and a Header global, locales `en`, `de-CH`, `fr-CH`, `it-CH`, Postgres. A public frontend at `/<locale>/<slug>` shows the published version of each language.

- `src/seed.ts` runs on every start: creates the demo accounts from `DEMO_ADMIN_EMAIL`/`DEMO_ADMIN_PASSWORD` (fallback: `PAYLOAD_ADMIN_*`) and `DEMO_EDITOR_EMAIL`/`DEMO_EDITOR_PASSWORD` if they don't exist yet — existing accounts are never changed, and the demo has no roles, so both accounts have full access — and English sample content when there are no pages. With an account variable set, Payload's "create first user" screen no longer appears.
- Schema changes need a migration: `cd demo && npm run payload migrate:create <name>`, commit `src/migrations/`. Production applies them on start (`prodMigrations`); there is no automatic schema push in production.
- `i18n.supportedLanguages` offers English, German, French and Italian as admin languages.
- `localization.defaultLocalePublishOption: 'active'` makes **Publish** release only the language being viewed (see "Publishing" in the user guide).

Run locally:

```bash
cd demo
docker compose up -d        # local Postgres on :5432 (or point DATABASE_URL at any Postgres)
cp .env.example .env        # set PAYLOAD_SECRET, SUPERTEXT_API_KEY (staging key + SUPERTEXT_ENVIRONMENT=staging while developing)
npm run plugin              # build + pack the plugin from the repo root into demo/vendor/
npm install
npm run dev                 # http://localhost:3000, admin at /admin
```

After changing plugin code, run `npm run plugin && npm install` again. The plugin is installed from a packed tarball (not a symlink) so Payload/React resolve to a single copy. Because the tarball changes with every edit, `scripts/unpin-plugin.mjs` removes its hash from `package-lock.json` (otherwise npm fails with EINTEGRITY, or installs a stale copy from its cache); the Dockerfile runs it too.

`SUPERTEXT_API_URL` points the demo at any API base URL, e.g. a local fake Supertext for offline testing.

### Railway deployment

Service **Payload** in the Railway project `supertext-cms-demos` (region Amsterdam), deployed from this repo's `main` on every push.

| Setting | Value |
| --- | --- |
| Builder | Dockerfile, path `demo/Dockerfile`, build context = repo root |
| Database | Database `payload_demo` on the project's shared **Postgres** service (created automatically on first start; Strapi's data lives in its own database). No volume — the project is at Railway's 3-volume limit. |
| Healthcheck | `/` |
| Variables | `DATABASE_URL` (Railway reference to the Postgres service's user, password, host and port, with database `payload_demo`), `PAYLOAD_SECRET`, `SUPERTEXT_API_KEY`, `SUPERTEXT_ENVIRONMENT`, `DEMO_ADMIN_EMAIL`, `DEMO_ADMIN_PASSWORD`, `DEMO_EDITOR_EMAIL`, `DEMO_EDITOR_PASSWORD` (older `PAYLOAD_ADMIN_*` still work) — set in Railway, never in the repo |

The Dockerfile packs the plugin from the repo root, installs it into the demo, builds Next.js in standalone mode and runs `node server.js` on port 3000. If a push does not start a deployment, Railway's GitHub app has no access to this repository: in the Supertext GitHub organisation settings → *GitHub Apps* → **Railway** → *Configure*, add the repository under *Repository access*. A manual redeploy in Railway works in the meantime.

Migrations run on start. To reset the demo content, drop the `payload_demo` database on the Postgres service and redeploy; it is recreated and re-seeded.

## Docs screenshots

The images in `docs/images/` are generated by `test/docs/screenshots.mjs` (Playwright) from the local demo on a **fresh database**, against `test/docs/stand-in.mjs`, which answers like the Supertext API and returns real German for the seeded content (`test/docs/sample-de.json`). Regenerate them whenever the Translate control, the edit view or the demo content changes:

```bash
cd test/docs && npm install && npx playwright install chromium
npm run stand-in &                                  # http://127.0.0.1:8765/v1/
cd ../../demo && npm run plugin                      # pack the current plugin into the demo
# empty database, e.g. dropdb payload_demo, then:
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/payload_demo PAYLOAD_SECRET=local \
  SUPERTEXT_API_KEY=test-key SUPERTEXT_API_URL=http://127.0.0.1:8765/v1/ \
  DEMO_ADMIN_EMAIL=anna.muster@example.com DEMO_ADMIN_PASSWORD='Docs12345!' npm run dev &
cd ../test/docs && BASE_URL=http://localhost:3000 npm run screenshots
```

Use `localhost`, not `127.0.0.1`: `next dev` blocks its dev assets for other origins and the admin stays blank. The script hides the Next.js dev badge and the account avatar (Gravatar). When the seeded content changes, add the new English strings and their German to `sample-de.json`.

## Dependency updates

Dependabot (`.github/dependabot.yml`) opens weekly pull requests: minor and patch updates grouped into one, GitHub Actions in another, each major update on its own. Merge one when CI is green and it doesn't change what the plugin supports.

Some major versions are ignored on purpose: TypeScript (7.x is the native compiler, which the type-checking and build tools here don't support yet) and `@types/node` (the types must match the oldest Node version the plugin supports, not the newest). Lift an ignore rule when the plugin moves to the new version.

## Releasing

Releases are published by `.github/workflows/release.yml` when the version is officially bumped; nobody tags or creates releases by hand.

1. Move the *Unreleased* entries in `CHANGELOG.md` under a new `## [X.Y.Z] - YYYY-MM-DD` section, and keep an empty *Unreleased* above it.
2. Set the same version in:
   - `package.json`: the npm package version
3. Push to `main`. The workflow checks that the version files match `CHANGELOG.md`, then tags `vX.Y.Z` and creates the GitHub release with the CHANGELOG section as notes (0.x versions as pre-releases). A push that adds no new version does nothing, and a version that is already released is skipped. After fixing a failed run, start it again with *Run workflow* on the *Release* workflow.

Publishing to npm is not set up yet; until then installs use the GitHub URL (optionally `#vX.Y.Z`).
## Known limitations / roadmap

- Translation is synchronous within the HTTP request (like the WordPress plugin). Next: run it as a Payload Jobs Queue task so long documents and bulk translation don't depend on request timeouts.
- No bulk action in list views yet.
- Payload blocks embedded in Lexical (BlocksFeature) and Lexical code blocks are not translated.
- Slate rich text (Payload 2 legacy) is not supported.
- Re-translating overwrites the target locale's translated fields; there is no change detection or translation memory.
- No API key check button in the admin panel yet (`validateApiKey` exists in the client).
- Human (professional) translation orders, as in the WordPress plugin, are not implemented.
- Not published on npm yet.
