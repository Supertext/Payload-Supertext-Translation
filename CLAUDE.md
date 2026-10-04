# Working on this repository

Part of Supertext's "translation plugins for the top 20 open source CMS" project. Each CMS has its own repo named `Supertext/<CMS>-Supertext-Translation`. This one is the **Payload CMS 3** plugin (TypeScript, npm package `payload-supertext-translation`).

## Documentation rule (always)

Every plugin repo keeps three guides, and **every change that affects behaviour, settings, installation or the code structure updates them in the same commit**:

| File | Audience | Must cover |
| --- | --- | --- |
| `docs/INSTALLATION.md` | Administrators | Requirements, install/update/uninstall, API key, language setup, all settings, troubleshooting |
| `docs/USER_GUIDE.md` | Editors | How to translate and review in the CMS's own UI, what is and isn't translated, what errors mean |
| `docs/DEVELOPER.md` | Developers | Architecture, Supertext API protocol, local setup, tests, CI/deploy, releasing, known limitations/roadmap |

Also: `README.md` stays a short overview linking the three guides, and `CHANGELOG.md` gets an entry under *Unreleased* for every user-visible change. Before finishing any task, check the docs still match the code.

## Shared Supertext protocol

AI file translation API v1, same as the WordPress plugin: POST HTML file → poll status → GET translation → DELETE. Details in `docs/DEVELOPER.md`. Never commit API keys; use the `SUPERTEXT_API_KEY` environment variable or the plugin's `apiKey` option.

## This repo

- `npm test` (Vitest; includes a real Payload instance on in-memory SQLite), `npm run typecheck`, `npm run build`. All three must pass before committing.
- New options go in `src/types.ts` **and** the settings table in `docs/INSTALLATION.md`.
- Field-walking rules live in `src/collect.ts`; keep the "Field rules" section of `docs/DEVELOPER.md` in sync.
- The admin component is referenced by import-map path `payload-supertext-translation/client#TranslateButton`; renaming it is a breaking change for users (they must regenerate the import map).
