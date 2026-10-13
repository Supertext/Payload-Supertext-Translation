# Developer guide

## Architecture

```
src/
  index.ts                 plugin factory: adds endpoints, the Translate control and the dashboard panel
  types.ts                 plugin options and endpoint request/response types
  endpoints.ts             /api/supertext/status, /translate, /check-key, /ping (auth, validation)
  reporting.ts             Commando Center glue: site URL, state in payload.kv, when the SDK reporter runs
  versions.ts              plugin version (its package.json) and Payload version at runtime
  translate.ts             translateDocument(): read source locale → collect → Supertext → write target locales
  collect.ts               walks the field schema + document; returns Segments and the update payload
  segments.ts              Segment type, HTML build/parse, applying translations
  lexical.ts               Lexical inline content <-> inline HTML (one segment per paragraph)
  languages.ts             Payload locale → Supertext code (the SDK's Languages, no guessing)
  supertext/client.ts      the plugin's Supertext client on top of the Supertext SDK (no Payload dependency)
  vendor/supertext-sdk/    Supertext SDK sources (TypeScript), compiled with the plugin; see *Supertext SDK*
scripts/vendor-sdk.sh      updates src/vendor/supertext-sdk
  translations.ts          UI and error strings in en/de/fr/it (namespace `supertext`)
  i18n.ts                  merges them into config.i18n.translations; req.t()-based messages for the endpoints
  components/TranslateButton.tsx   client component in the edit view header
  components/SupertextStatus.tsx   client component on the dashboard (admin.components.afterDashboard)
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

`SupertextError.message` stays English (logs, API clients). UIs translate `code` (`error_<code>` keys) and append `detail`, the API's own text.

New or changed strings need all four languages in the same commit: formal address (Sie, vous, Lei), Payload's own terms (*Dokument*/*document*/*documento*, *Entwurf*/*brouillon*/*bozza*), "Supertext", `{{placeholders}}` and URLs unchanged. `test/translations.test.ts` checks keys, placeholders and URLs.

## Supertext API protocol

AI file translation API v1, same as the WordPress plugin and every other Supertext plugin, done by the Supertext SDK. Base URLs: `https://api.supertext.com/v1/` (live), `https://api.staging.supertext.com/v1/`, `https://api.testing.supertext.com/v1/`. Header `Authorization: Supertext-Auth-Key <key>`; the key may be configured with or without the `Supertext-Auth-Key ` prefix, exactly one is sent.

| Step | Request | Notes |
| --- | --- | --- |
| Upload | `POST translate/ai/file` multipart: `file` (`content.html`, type exactly `text/html`), `target_lang`, optional `source_lang`, optional `politeness` (`more`/`less`) | Returns `{ file_id }`. A `; charset=` suffix on the part type is rejected with 415. Up to 1,000,000 characters per file. |
| Poll | `GET translate/ai/file/{id}/status` | `translating` → keep polling; `done`; `error`; `limit_exceeded`; `deleted`. |
| Download | `GET translate/ai/file/{id}/translation` | Translated HTML. |
| Delete | `DELETE translate/ai/file/{id}` | Always attempted, also after errors; files expire after 24 h. |
| Key check | `GET features` | Cost-free (`SupertextClient.checkApiKey`, through the SDK reporter; see *Commando Center*). |

Errors are the SDK's `SupertextError` with a stable `code`: `missing_api_key`, `authentication_failure` (401/403), `invalid_language_pair` (404 `INVALID_LANGUAGE_PAIR`), `unsupported_language` (the locale has no Supertext code; nothing sent; `targetLang`/`sourceLang` name it, shown as `{{language}}`), `unsupported_feature` (400 `FEATURE_ERROR`, e.g. politeness for `en-US`), `not_found` (404), `payload_too_large` (413), `too_many_requests` (429), `service_unavailable` (5xx), `unexpected_status`, `transport_error`, `no_file_id`, `translation_error`, `quota_exceeded`, `file_deleted`, `timeout`, `incomplete_response`; `detail` carries the API's own text (at most 200 characters). Each code has an `error_<code>` message in all four languages. The API key never appears in messages.

**Rate limit:** the API limits requests per second per key (HTTP 429, `RATE_LIMIT_EXCEEDED`); translating into several languages at once hits it. A 429 is retried up to 4 times, waiting for `Retry-After` if sent, otherwise 1, 2, 4 and 8 seconds (plus jitter, at most 30 s), before reporting *Too many requests*.

### Supertext SDK

All Supertext calls go through the [Supertext SDK](https://github.com/Supertext/Supertext-API-SDK-and-Guide) (`sdk/typescript`), the shared client of all Supertext plugins. Its TypeScript sources (the whole `src/` tree, with the API in the versioned folder `v1/`) are copied into `src/vendor/supertext-sdk/` and compiled with the plugin into `dist/vendor/supertext-sdk/`, so sites install nothing besides the plugin; `COMMIT` and `VERSION` name the SDK commit and version. Never edit the copy: fix the SDK repository and copy it again:

```bash
scripts/vendor-sdk.sh                  # latest main of the SDK repository
scripts/vendor-sdk.sh <commit-or-tag>
SDK_DIR=../Supertext-API-SDK-and-Guide scripts/vendor-sdk.sh   # a local clone
```

Then run typecheck, tests and build, and note the update in `CHANGELOG.md`. The plugin imports the API from `src/vendor/supertext-sdk/v1/index.js` (the SDK's `supertext-sdk/v1`) and `SDK_VERSION` from `src/vendor/supertext-sdk/version.js`. `src/supertext/client.ts` wraps the SDK client (options in milliseconds, a `fetch` for tests, the User-Agent `supertext-sdk-typescript payload-supertext-translation`) and keeps the plugin's exported `SupertextClient`, `SupertextError` and `SUPERTEXT_ENVIRONMENTS`.

### Language codes

Supertext accepts exactly the codes of its `GET features` list (the SDK's `Languages.TARGETS` / `Languages.SOURCES`, `spec/languages.json` in the SDK repo): **sources are bare** (`en`, `de`); **targets** are regional only for German, English, French, Italian and Portuguese (`de-CH`, `en-US`, `pt-BR`), `zh-Hans`/`zh-Hant`, `sr-Latn`/`sr-Cyrl`, `gsw-u-sd-chzh`/`gsw-u-sd-chbe`, and **bare for all others** (`es`, `nl`, `sl`). Anything else is rejected (`INVALID_LANGUAGE_PAIR`, HTTP 404) — including the old guessed defaults `es-ES`, `sl-SI`, `zh-CN`.

`src/languages.ts`, no guessing:

- `targetCode(locale, languageMap)` = `Languages.target()`: the `languageMap` entry wins (sent as given), else a locale equal to a Supertext code apart from case and `_`/`-` (`de_ch` → `de-CH`, `es`), else `SupertextError('unsupported_language')` and nothing is sent. `targetCodeOrNull` is the same without throwing (status panel, Translate menu).
- `sourceCode(locale, languageMap)`: `Languages.source()` of the mapped code, else of the locale (`de-CH` → `de`). The plugin has one map for both directions, holding target codes, so a mapped value is reduced to its language rather than sent as it is (the SDK's `Languages.source(code, mapping)` would send `de-CH` as the source).
- `politenessForTarget(locale, target, politeness)`: `more`/`less` for a target where `Languages.supportsPoliteness()` is false throws `unsupported_feature` before anything is sent, so a setting is never dropped silently; the status panel shows the same as a warning.

`test/fakeSupertext.ts` accepts exactly the SDK's target list (HTTP 404 otherwise), bare sources, and politeness only where offered (HTTP 400 `FEATURE_ERROR`), like the live API.

### Commando Center (version reports, API key check, ping)

The protocol is the SDK's (`InstallationReporter`, `pingResponse`, `reporterState`, `reportsEnabled`; Commando-Center-Supertext-Translation → `docs/DEVELOPER.md` → *Report protocol*). `src/reporting.ts` only supplies what Payload knows:

- **Options:** `plugin.name` = `Payload-Supertext-Translation` (the GitHub repo name), `plugin.version` from the plugin's `package.json` (`src/versions.ts`: searched upwards from the module, else in `<cwd>/node_modules`, because Next.js bundles the plugin), `system` = `Payload` and the version of the app's `payload` package, runtime and SDK version from the SDK, `siteUrl` = `config.serverURL`, else the request's `x-forwarded-host`/`host` (and `x-forwarded-proto`), `callbackUrl` = `<siteUrl><routes.api>/supertext/ping`.
- **Setting:** the `versionReports` option (default on); `SUPERTEXT_VERSION_REPORTS` wins (`reportsEnabled`). `SUPERTEXT_REPORT_URL` points reports elsewhere (tests, screenshots).
- **When:** the settings are code, so there is no `afterSettingsSaved`. `onRequest` runs in the background on `GET /status` (the Translate control and the dashboard panel load it) and `POST /translate`; the SDK checks the key when its fingerprint changed and reports `installed`, `upgraded` or a changed key status. `authenticationFailed` runs when a translation came back with `authentication_failure` (401/403). `testConnection` runs on `POST /check-key` (*Check again* on the panel), which waits for the result and returns it.
- **State:** `payload.kv` (Payload's key-value store; by default the `payload-kv` collection Payload adds itself, so the plugin needs no migration), key `supertext-reporter`, the SDK's `ReporterState` as JSON. Without `payload.kv` (older Payload 3) it is kept in memory. The fingerprint stays there; the endpoints return the check without it. Calls are queued (one at a time per plugin instance) and never throw: storage errors are logged at debug level and swallowed.
- **Ping:** `GET /api/supertext/ping` (`Reporting.ping` → `pingResponse`), public, status, headers (`Content-Type`, `Cache-Control: no-store`) and body exactly as the SDK returns them; 404 while reports are off.

## Endpoints

| Method | Path | Body / response |
| --- | --- | --- |
| GET | `/api/supertext/status` | `StatusResponse`: `{ apiKeyConfigured, canTranslate, locales, languages, version, releaseUrl, sdkVersion, reports: { enabled, pingUrl }, keyCheck }` — used by the Translate control and the dashboard panel. 401 when not logged in. Runs the reporter's `onRequest` in the background. |
| POST | `/api/supertext/translate` | Body `TranslateRequestBody`. 200 with `{ results: LocaleResult[] }` if any locale succeeded, 502 if all failed, 400/401/403/500 with `{ error }` for validation, auth, permission and missing-key errors. |

| POST | `/api/supertext/check-key` | Checks the API key now (`testConnection`), returns `{ keyCheck }`. 401/403 like `/translate`. |
| GET | `/api/supertext/ping?challenge=…` | Public reachability check for the Commando Center (see above). |

`LocaleResult` is `{ locale, ok: true, segments, missing: string[] }` or `{ locale, ok: false, error, code?, status? }`.

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
- `client.test.ts` — the plugin's client on the SDK: API round trip, form fields, status and HTTP error mapping, timeout, 429 retries, key prefix, language codes (exact matches, no default regions, mapping, source from the mapped code, politeness) (the SDK's own tests run in the SDK repository)
- `reporting.test.ts` — the Commando Center glue: repo name and version, the setting and `SUPERTEXT_VERSION_REPORTS`, site URL, state in `payload.kv` or memory, `installed` → nothing → `upgraded`, back-off and never throwing, ping answers, the language table
- `translations.test.ts` — all four languages have the English keys, placeholders and URLs; every key the control and endpoints use and every error code of the SDK has a message; config merging; French messages through Payload's own `initI18n`
- `integration.test.ts` — boots a real Payload 3 instance on in-memory SQLite with Lexical, drafts, arrays, blocks and a global; covers translating into several locales, drafts, globals, failures, unmapped locales, politeness and the endpoints (auth, validation, happy path; status with languages, one `installed` report to a fake center, `api_key_check` after a 401, *Check again*, reports off, the ping)

`test/fakeSupertext.ts` is an in-memory Supertext API that "translates" by prefixing `[<target_lang>]`, and a fake Commando Center (`POST …/report` → 202, recorded in `reports`). No test calls the real API or the real center.

## CI / deploy

`.github/workflows/ci.yml` runs typecheck, tests and build on Node 20 and 22 for pushes to `main` and pull requests.

### Demo app (`demo/`)

A small Payload 3 + Next.js 16 site that uses the plugin the way a customer would: Pages (drafts, blocks in tabs, rich text, SEO group, a non-localized field) and a Header global, locales `en`, `de-CH`, `fr-CH`, `it-CH`, Postgres. A public frontend at `/<locale>/<slug>` shows the published version of each language.

- `src/seed.ts` runs on every start: creates the demo accounts from `DEMO_ADMIN_EMAIL`/`DEMO_ADMIN_PASSWORD` (fallback: `PAYLOAD_ADMIN_*`) and `DEMO_EDITOR_EMAIL`/`DEMO_EDITOR_PASSWORD` if they don't exist yet — existing accounts are never changed, and the demo has no roles, so both accounts have full access — and English sample content when there are no pages. With an account variable set, Payload's "create first user" screen no longer appears.
- `languageMap: { en: 'en-US' }`: `de-CH`, `fr-CH` and `it-CH` are Supertext codes already; `en` isn't (English is `en-US` or `en-GB`).
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
| Variables | `DATABASE_URL` (Railway reference to the Postgres service's user, password, host and port, with database `payload_demo`), `PAYLOAD_SECRET`, `SUPERTEXT_API_KEY`, `SUPERTEXT_ENVIRONMENT`, optionally `SUPERTEXT_VERSION_REPORTS` (`0` turns version reports off), `DEMO_ADMIN_EMAIL`, `DEMO_ADMIN_PASSWORD`, `DEMO_EDITOR_EMAIL`, `DEMO_EDITOR_PASSWORD` (older `PAYLOAD_ADMIN_*` still work) — set in Railway, never in the repo |

The Dockerfile packs the plugin from the repo root, installs it into the demo, builds Next.js in standalone mode and runs `node server.js` on port 3000. If a push does not start a deployment, Railway's GitHub app has no access to this repository: in the Supertext GitHub organisation settings → *GitHub Apps* → **Railway** → *Configure*, add the repository under *Repository access*. A manual redeploy in Railway works in the meantime.

Migrations run on start. To reset the demo content, drop the `payload_demo` database on the Postgres service and redeploy; it is recreated and re-seeded.

## Docs screenshots

The images in `docs/images/` are generated by `test/docs/screenshots.mjs` (Playwright) from the local demo on a **fresh database**, against `test/docs/stand-in.mjs`, which answers like the Supertext API and returns real German for the seeded content (`test/docs/sample-de.json`). Regenerate them whenever the Translate control, the edit view or the demo content changes:

```bash
cd test/docs && npm install && npx playwright install chromium
npm run stand-in &                                  # http://127.0.0.1:8765/v1/ (and a fake center at /report)
cd ../../demo && npm run plugin                      # pack the current plugin into the demo
# empty database, e.g. dropdb payload_demo, then:
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/payload_demo PAYLOAD_SECRET=local \
  SUPERTEXT_API_KEY=test-key SUPERTEXT_API_URL=http://127.0.0.1:8765/v1/ SUPERTEXT_REPORT_URL=http://127.0.0.1:8765/report \
  DEMO_ADMIN_EMAIL=anna.muster@example.com DEMO_ADMIN_PASSWORD='Docs12345!' npm run dev &
cd ../test/docs && BASE_URL=http://localhost:3000 npm run screenshots
```

Use `localhost`, not `127.0.0.1`: `next dev` blocks its dev assets for other origins and the admin stays blank. Always set `SUPERTEXT_REPORT_URL` to the stand-in, so a screenshot run never reports to the live Commando Center. The dashboard panel (`status-panel.png`) shows the live demo's ping URL instead of the local one. The script hides the Next.js dev badge and the account avatar (Gravatar). When the seeded content changes, add the new English strings and their German to `sample-de.json`.

## Dependency updates

Dependabot (`.github/dependabot.yml`) opens weekly pull requests: minor and patch updates grouped into one, GitHub Actions in another, each major update on its own. Merge one when CI is green and it doesn't change what the plugin supports.

Some major versions are ignored on purpose: TypeScript (7.x is the native compiler, which the type-checking and build tools here don't support yet) and `@types/node` (the types must match the oldest Node version the plugin supports, not the newest). Lift an ignore rule when the plugin moves to the new version.

## Code quality and security checks

- **Checks** workflow (`.github/workflows/checks.yml`): [actionlint](https://github.com/rhysd/actionlint) and [zizmor](https://docs.zizmor.sh/) lint the workflows on every push and pull request. Dependency review fails a pull request that adds a package with a known vulnerability (moderate or worse). Third-party actions are pinned to commit SHAs; Dependabot keeps the pins up to date. To run the workflow lint locally: `pip install actionlint-py zizmor`, then `actionlint` and `zizmor .github/workflows` in the repo root.
- **Links** workflow (`.github/workflows/links.yml`): [lychee](https://lychee.cli.rs/) checks the links in all Markdown files weekly and whenever docs change on `main`. Broken links open (or update) the issue "Broken links in the docs". Links that can't work from CI (local URLs, placeholders, pages behind a login) are excluded in `.lycheeignore`.
- JavaScript and TypeScript are analysed by CodeQL (see below), so this repo runs no separate static analyser.
- GitHub settings (set by Remy's setup script, not stored in the repo): **secret scanning with push protection** (a push containing a known token format is rejected; findings under *Security → Secret scanning*) and **CodeQL default setup** (findings under *Security → Code scanning* and as comments on pull requests; PHP isn't covered by CodeQL, which is why the PHP plugins run PHPStan).

Before starting work in this repo, look at its open findings: code scanning alerts, secret scanning alerts, Dependabot PRs and the "Broken links in the docs" issue.

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
- No settings form: options are code, so the Supertext panel only shows them, and there is no `settings_saved` report (the key check runs when the key's fingerprint changes and on *Check again*).
- Human (professional) translation orders, as in the WordPress plugin, are not implemented.
- Not published on npm yet.
