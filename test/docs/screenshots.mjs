#!/usr/bin/env node
/**
 * Regenerates docs/images from the local demo (fresh database) whose plugin talks
 * to stand-in.mjs. See docs/DEVELOPER.md -> Docs screenshots.
 *
 *   BASE_URL (default http://localhost:3000 - use localhost, not 127.0.0.1, with `next dev`),
 *   DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD
 */
import { chromium } from 'playwright'

const B = process.env.BASE_URL || 'http://localhost:3000'
const EMAIL = process.env.DEMO_ADMIN_EMAIL || 'anna.muster@example.com'
const PASSWORD = process.env.DEMO_ADMIN_PASSWORD || 'Docs12345!'
const OUT = new URL('../../docs/images', import.meta.url).pathname

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1400, height: 940 } })).newPage()
const shot = (name, clip) => page.screenshot({ path: `${OUT}/${name}.png`, ...(clip ? { clip } : {}) })
const pad = (r, p = 8) => ({ x: Math.max(0, r.x - p), y: Math.max(0, r.y - p), width: r.width + 2 * p, height: r.height + 2 * p })
// Hide the Next.js dev-mode badge and toasts' entry animation.
const tidy = () => page.addStyleTag({ content: 'nextjs-portal{display:none!important} a[href$="/admin/account"] img{visibility:hidden} *{animation-duration:0s!important;transition-duration:0s!important}' })

await page.goto(`${B}/admin/login`)
await page.fill('input[name=email]', EMAIL)
await page.fill('input[name=password]', PASSWORD)
await page.click('button[type=submit]')
await page.waitForURL(/\/admin\/?$/, { timeout: 60000 })

// The seeded home page
const res = await page.request.get(`${B}/api/pages?where[slug][equals]=home&locale=en&limit=1`)
const id = (await res.json()).docs[0].id
const open = async (locale) => {
  await page.goto(`${B}/admin/collections/pages/${id}?locale=${locale}`)
  await page.getByRole('button', { name: /^Translate$/ }).waitFor({ timeout: 60000 })
  await tidy()
  await page.waitForTimeout(1000)
}

// --- User guide -------------------------------------------------------------
await open('en')
await shot('edit-view')

await page.getByRole('button', { name: /^Translate$/ }).click()
const popover = page.getByText('Translate with Supertext').locator('xpath=..')
await popover.waitFor()
await page.getByRole('checkbox', { name: /Deutsch/ }).check()
await page.waitForTimeout(300)
await shot('translate-menu', pad(await popover.boundingBox()))

await page.getByRole('button', { name: /^Translate into/ }).click()
const toast = page.getByText(/^Translated into /).first()
await toast.waitFor({ timeout: 120000 })
await page.waitForTimeout(800)
const t = await toast.boundingBox()
await shot('translated-toast', { x: t.x - 60, y: t.y - 40, width: t.width + 140, height: t.height + 80 })

await open('de-CH')
await shot('translated-de')
await page.getByRole('button', { name: 'Body' }).click().catch(() => page.getByText('Body', { exact: true }).first().click())
await page.waitForTimeout(1200)
await shot('translated-de-body')

// --- Installation guide: the configured languages -----------------------------
await page.getByText('Locale:', { exact: false }).first().click({ force: true })
await page.waitForTimeout(600)
await shot('locales', { x: 700, y: 0, width: 700, height: 300 })

await browser.close()
console.log(`Screenshots written to ${OUT}`)
