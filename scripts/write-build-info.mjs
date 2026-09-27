import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const commit =
  process.env.OPENVOICE_COMMIT?.trim() ||
  execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()

writeFileSync(
  new URL('../src/shared/build-info.json', import.meta.url),
  JSON.stringify({ commit, version: '1.0.0' }, null, 2)
)
