import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const commit =
  process.env.OPENVOICE_COMMIT?.trim() ||
  execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

writeFileSync(
  new URL('../src/shared/build-info.json', import.meta.url),
  JSON.stringify({ commit, version }, null, 2)
)
