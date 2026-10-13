# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- **Languages: no more guessed codes** (bundled Supertext SDK 0.2.0, commit `c66cb4d`). Supertext accepts only the codes of its language list: `de-CH`, `en-US`, `pt-BR`, but bare `es`, `nl`, `sl`, and `zh-Hans`, `sr-Latn`. A Payload locale that is such a code (apart from case and `_`/`-`) is used as it is; every other locale needs an entry in `languageMap` (e.g. `{ en: 'en-US', de: 'de-CH', fr: 'fr-FR' }`). The default regions (`de` → `de-DE`, `es` → `es-ES`, `zh` → `zh-CN`, …) are gone: several were rejected by Supertext. **Check your locales after updating:** an unmapped locale is marked *no Supertext language yet* in the Translate menu, *Not mapped* on the new Supertext panel, and a translation into it fails with *The language … has no Supertext language yet* (nothing is sent). For a mapped locale used as the source, the mapped code's language is sent.
- A formal or informal tone (`politeness`) for a target without one (English, Swiss German, Romansh, Albanian, Serbian) now fails with *Supertext offers no formal or informal tone for this language* instead of being sent; the Supertext panel warns about it.
- After updating, run `npx payload generate:importmap`: the plugin adds a second client component (`payload-supertext-translation/client#SupertextStatus`).

### Added

- **Supertext panel** on the admin dashboard (for users who may translate; `dashboardPanel: false` hides it): plugin and SDK version, the latest API key check with its time and **Check again**, every locale with the Supertext code and tone it is sent with, and whether version information is sent.
- **Automatic API key check** (Supertext's cost-free `features` call) when the plugin first runs with a new key, on *Check again* and when Supertext rejects the key during a translation; messages in English, German, French and Italian with the links to create an account and generate a key.
- **Send version information to Supertext** (option `versionReports`, on by default; `SUPERTEXT_VERSION_REPORTS=0` turns it off): after an update and when the key check changes, the plugin sends the site URL, the plugin, Payload, Node.js and SDK versions, whether a key is set, the key check result and the ping URL to the Supertext Commando Center. No content, no API key, no personal data. The state is kept in Payload's key-value store (`payload.kv`); no migration needed.
- Public ping endpoint `GET /api/supertext/ping` (answers only while version information is sent), so Supertext can see that the site is reachable.
- Messages for the new Supertext errors `unsupported_language` and `unsupported_feature` in all four languages.

### Changed

- The connection to Supertext now uses the shared [Supertext SDK](https://github.com/Supertext/Supertext-API-SDK-and-Guide) (TypeScript SDK 0.1.0), compiled into the plugin, so nothing else needs installing. Translation works as before; an unsupported language pair now has its own message (*Supertext does not support this language pair*) in all four languages, and the file at Supertext is also deleted after errors. An unknown language (e.g. `xx-YY`) is now reported as an unsupported language pair too, not as "resource not found" (Supertext answers it with HTTP 404).

### Added

- French and Italian interface (and German where it was missing): the Translate control, its messages and the endpoints' errors follow the user's Payload admin language (English, German, French, Italian; other languages show English). Strings are merged into `i18n.translations` under the `supertext` namespace and can be overridden there. The demo offers all four admin languages.

### Changed

- The *Authentication failure* message now links to Supertext account signup and API key generation.

### Fixed

- Bare locales such as `de` were sent as bare targets, which Supertext rejected with `INVALID_LANGUAGE_PAIR`. (An interim fix gave them a default region; that is replaced by the language mapping above.) Regional codes are matched regardless of case and `_`/`-` (`de_ch` → `de-CH`).

## [0.1.0] - 2026-10-07

### Changed

- Where the API key is set up (installation guide, README, `apiKey` option docs, demo `.env.example`) and in the "No Supertext API key is configured" server error, administrators now get links to create a Supertext account and to generate the API key at supertext.com → Integrations → API (requires the Admin role).

### Fixed

- Rich text is translated a whole paragraph at a time with formatting and links as inline tags, instead of one piece per formatted run. Sentences that contain bold text or links now translate naturally.
- Translating into several locales at once no longer fails with *Too many requests*: requests that hit Supertext's per-second rate limit are retried automatically.
- The API key now works whether it is entered with or without the `Supertext-Auth-Key ` prefix Supertext shows it with.

### Added

- Payload 3 plugin `supertextTranslation()` for collections and globals.
- **Translate** control in the edit view: translate the saved document from the current locale into one or more locales.
- Translation of localized `text` (incl. `hasMany`), `textarea` and Lexical `richText` fields, also inside groups, rows, collapsibles, tabs, arrays and blocks (incl. `blockReferences`). Rich-text formatting and links are preserved.
- Translations are saved as drafts when the collection/global has drafts enabled (`saveAsDraft`, default `true`).
- Endpoints `GET /api/supertext/status` and `POST /api/supertext/translate`, enforcing login, the `access` option and collection/global access.
- Supertext AI file translation API v1 client (live/staging/testing environments, custom `apiUrl`).
- Options: `languageMap`, `politeness`, `skipFieldNames` (default `slug`), per-field opt-out via `custom: { supertext: false }`, `pollIntervalMs`, `timeoutMs`, `disabled`.
- Installation, user and developer guides; CI on Node 20 and 22.
- Demo Payload site in `demo/` (Pages + Header, four Swiss locales, sample content, Postgres) with a Dockerfile for the Railway demo.
- Docs: screenshots in the user and installation guides (Translate control, result, rich text, locales), regenerated with `test/docs/screenshots.mjs`.
- Demo: accounts from `DEMO_ADMIN_*` and `DEMO_EDITOR_*` variables, created on every start if missing (`PAYLOAD_ADMIN_*` still work).
- Docs: how to publish one language at a time (`defaultLocalePublishOption: 'active'`), since Payload's default Publish releases all languages' drafts.
