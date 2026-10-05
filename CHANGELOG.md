# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
