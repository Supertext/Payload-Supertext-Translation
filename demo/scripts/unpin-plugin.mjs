// The plugin is installed from a tarball packed from this repo (vendor/), and its
// content changes with every plugin edit. npm pins a hash of the tarball in
// package-lock.json and would either fail (EINTEGRITY) or silently install a stale
// copy from its cache. Drop that one hash so `npm install` always takes the new pack.
import { readFileSync, writeFileSync } from 'node:fs'

const file = new URL('../package-lock.json', import.meta.url)
const lock = JSON.parse(readFileSync(file, 'utf8'))
const entry = lock.packages?.['node_modules/payload-supertext-translation']
if (entry && 'integrity' in entry) {
  delete entry.integrity
  writeFileSync(file, `${JSON.stringify(lock, null, 2)}\n`)
}
