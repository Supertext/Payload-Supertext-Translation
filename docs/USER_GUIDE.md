# User guide

For editors working in the Payload admin panel.

## Translate a document

1. Open the page, post or global you want to translate.
2. Switch the **locale selector** (top of the edit view) to the language you are translating **from** — usually your default language.
3. Make sure the document is **saved**. Supertext translates the saved version, not unsaved edits.
4. Click **Translate** next to the Save/Publish buttons.
5. Tick the languages to translate **into** (or click *All*), then click **Translate into …**.
6. Wait for the confirmation. Short pages take a few seconds; long ones can take up to a few minutes. Keep the tab open.

You get a green message per success, and a red one for any language that failed — the other languages are still saved.

## Review and publish

Switch the locale selector to a translated language to see the result.

- If the collection uses **drafts**, the translation is saved as a **draft**. The published version in that language stays unchanged until you review and publish it.
- Without drafts, the translation is saved immediately.

### Publishing

Publish each language after reviewing it, with the locale selector set to that language:

- **Publish in &lt;language&gt;** (in the arrow menu next to Publish, or the main button if your administrator set it up that way) releases only that language.
- **Publish** / **Publish all locales** releases the drafts of **every** language at once — including translations nobody has reviewed yet.

If you are unsure which one the main button does, use the arrow menu and pick the language explicitly.

Translating again overwrites the earlier translation of the translated fields in that language, including any manual edits you made there.

## What is translated

- Localized text and text area fields
- Rich text: paragraphs, headings, lists, quotes and link texts — bold, italic and links stay on the right words
- The same fields inside groups, tabs, arrays and blocks

## What is not translated

- The **slug** (URL) — set it per language yourself
- Fields that are the same in every language (non-localized), such as images, relations, dates, numbers and choices
- Code blocks and embedded blocks inside rich text
- Fields your administrator excluded

## Messages

| Message | Meaning |
| --- | --- |
| *Save the document before translating it.* | New documents must be saved once first. |
| *You have unsaved changes…* | Save first; otherwise your latest edits are not translated. |
| *No Supertext API key is configured.* | Ask your administrator to set up the Supertext key. |
| *Some passages came back empty and kept the source text* | Supertext returned nothing for a few passages; check them in the translated language. |
| *Authentication failure…* | The Supertext key is invalid. Ask your administrator. |
| *Your Supertext translation limit is exceeded…* | The company's Supertext quota is used up. |
| *Timed out waiting…* | The document is very long or Supertext is slow. Try again, or ask your administrator to raise the timeout. |
| *Too many requests…* | Wait a moment and try again. |

If you don't see the **Translate** button at all, the collection may not be enabled for Supertext, or you may not have permission — ask your administrator.
