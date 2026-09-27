import { createHash } from 'node:crypto'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const exe = process.argv[2]
const outDir = process.argv[3]
const commit = process.env.OPENVOICE_COMMIT?.trim()
if (!exe || !outDir || !commit) {
  throw new Error('Usage: OPENVOICE_COMMIT=... node scripts/write-update-json.mjs <exe> <outDir>')
}

function changesFromLog(raw) {
  return raw
    .split('\x1e')
    .map((block) => {
      const [titleRaw, ...rest] = block.split('\x1f')
      const title = titleRaw.trim().slice(0, 160)
      const detail = rest.join('\x1f').trim().slice(0, 400)
      if (!title) {
        return null
      }
      return detail ? { title, detail } : { title }
    })
    .filter(Boolean)
    .slice(0, 12)
}

const file = basename(exe)
const data = readFileSync(exe)
const update = {
  commit,
  version: '1.0.0',
  file,
  sha512: createHash('sha512').update(data).digest('base64'),
  size: statSync(exe).size,
  url: `https://github.com/TheBiggestNerd2014/openvoice/raw/updater/${file}`,
  changes: changesFromLog(process.env.OPENVOICE_CHANGES ?? '')
}

writeFileSync(join(outDir, 'update.json'), JSON.stringify(update, null, 2))
