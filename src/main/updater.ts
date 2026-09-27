import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { request as httpsRequest } from 'node:https'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import type { IncomingMessage } from 'node:http'
import { app } from 'electron'
import buildInfo from '../shared/build-info.json'
import type { UpdateChange, UpdateStatus } from '../shared/types'

const FEED = 'https://raw.githubusercontent.com/TheBiggestNerd2014/openvoice/updater/update.json'

interface RemoteUpdate {
  commit: string
  version: string
  file: string
  sha512: string
  size: number
  url: string
  changes?: UpdateChange[]
}

let status: UpdateStatus = { state: 'idle' }
const listeners = new Set<(next: UpdateStatus) => void>()
let installerPath: string | null = null
let installing = false
let busy = false
let currentChanges: UpdateChange[] = []

const setStatus = (next: UpdateStatus): void => {
  status = next
  for (const fn of listeners) {
    fn(status)
  }
}

export function getUpdateStatus(): UpdateStatus {
  return status
}

export function onUpdateStatus(fn: (next: UpdateStatus) => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

function openUrl(url: string): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(url, { headers: { 'User-Agent': 'OpenVoice', Accept: 'application/json' } }, (res) => {
      const code = res.statusCode ?? 0
      const location = res.headers.location
      if (code >= 300 && code < 400 && location) {
        res.resume()
        const next = new URL(location, url).toString()
        resolve(openUrl(next))
        return
      }
      resolve(res)
    })
    req.on('error', reject)
    req.end()
  })
}

async function readFeed(): Promise<RemoteUpdate> {
  const res = await openUrl(FEED)
  const chunks: Buffer[] = []
  for await (const chunk of res) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  if ((res.statusCode ?? 0) === 404) {
    throw new Error('missing')
  }
  if ((res.statusCode ?? 0) < 200 || (res.statusCode ?? 0) >= 300) {
    throw new Error(`HTTP ${res.statusCode}`)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as RemoteUpdate
}

function asChanges(value: unknown): UpdateChange[] {
  if (!Array.isArray(value)) {
    return []
  }
  const changes: UpdateChange[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const title = 'title' in item && typeof item.title === 'string' ? item.title.trim() : ''
    const detail = 'detail' in item && typeof item.detail === 'string' ? item.detail.trim() : ''
    if (!title) {
      continue
    }
    changes.push(detail ? { title: title.slice(0, 160), detail: detail.slice(0, 400) } : { title: title.slice(0, 160) })
    if (changes.length >= 12) {
      break
    }
  }
  return changes
}

function messageToChange(message: string): UpdateChange | null {
  const [titleRaw, ...rest] = message.split(/\r?\n/)
  const title = titleRaw.trim().slice(0, 160)
  const detail = rest.join('\n').trim().slice(0, 400)
  if (!title) {
    return null
  }
  return detail ? { title, detail } : { title }
}

async function changesSince(local: string, remote: string, fallback: UpdateChange[]): Promise<UpdateChange[]> {
  try {
    const res = await openUrl(
      `https://api.github.com/repos/TheBiggestNerd2014/openvoice/compare/${local}...${remote}`
    )
    const chunks: Buffer[] = []
    for await (const chunk of res) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    if ((res.statusCode ?? 0) < 200 || (res.statusCode ?? 0) >= 300) {
      return fallback
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
      commits?: { commit?: { message?: string } }[]
    }
    const changes = (body.commits ?? [])
      .map((commit) => messageToChange(commit.commit?.message ?? ''))
      .filter((change): change is UpdateChange => change !== null)
      .slice(-12)
      .reverse()
    return changes.length > 0 ? changes : fallback
  } catch {
    return fallback
  }
}

function download(update: RemoteUpdate, dest: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const open = (url: string): void => {
      const req = httpsRequest(url, { headers: { 'User-Agent': 'OpenVoice' } }, (res) => {
        const code = res.statusCode ?? 0
        const location = res.headers.location
        if (code >= 300 && code < 400 && location) {
          res.resume()
          open(new URL(location, url).toString())
          return
        }
        if (code < 200 || code >= 300) {
          res.resume()
          reject(new Error(`HTTP ${code}`))
          return
        }
        const file = createWriteStream(dest)
        const hash = createHash('sha512')
        let received = 0
        res.on('data', (chunk: Buffer) => {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
          received += buf.length
          hash.update(buf)
          if (!file.write(buf)) {
            res.pause()
            file.once('drain', () => res.resume())
          }
          const percent = update.size > 0 ? Math.min(100, Math.round((received / update.size) * 100)) : 0
          setStatus({
            state: 'downloading',
            version: update.commit.slice(0, 7),
            message: `Downloading update… ${percent}%`,
            changes: currentChanges
          })
        })
        res.on('error', reject)
        res.on('end', () => {
          file.end(() => {
            const digest = hash.digest('base64')
            if (digest !== update.sha512) {
              reject(new Error('Update file did not match the published checksum'))
              return
            }
            resolve(dest)
          })
        })
      })
      req.on('error', reject)
      req.end()
    }
    open(update.url)
  })
}

async function checkForUpdates(): Promise<void> {
  if (busy) {
    return
  }
  busy = true
  try {
    setStatus({ state: 'checking', message: 'Checking for updates…' })
    const remote = await readFeed()
    const local = buildInfo.commit.trim().toLowerCase()
    if (!remote.commit || remote.commit.trim().toLowerCase() === local) {
      setStatus({ state: 'current', version: '1.0', message: 'Up to date' })
      return
    }
    const label = remote.commit.slice(0, 7)
    currentChanges = await changesSince(local, remote.commit.trim(), asChanges(remote.changes))
    setStatus({
      state: 'available',
      version: label,
      message: 'A newer build is available',
      changes: currentChanges
    })
    const dest = join(app.getPath('temp'), 'OpenVoice-Setup-1.0.0.exe')
    installerPath = await download(remote, dest)
    setStatus({
      state: 'ready',
      version: label,
      message: 'Update ready. Restart to install.',
      changes: currentChanges
    })
  } catch (err) {
    const raw = err instanceof Error ? err.message : 'Update check failed'
    if (raw === 'missing') {
      setStatus({ state: 'idle', message: '' })
      return
    }
    setStatus({
      state: 'error',
      message: /ENOTFOUND|ETIMEDOUT|ECONN|HTTP/i.test(raw) ? 'Couldn’t check for updates.' : raw.split('\n')[0]
    })
  } finally {
    busy = false
  }
}

export function startAutoUpdater(): void {
  app.on('will-quit', () => {
    if (installerPath && !installing) {
      installing = true
      spawn(installerPath, ['/S'], { detached: true, stdio: 'ignore' }).unref()
    }
  })

  if (!app.isPackaged) {
    setStatus({ state: 'idle', message: 'Updates run from an installed build' })
    return
  }

  void checkForUpdates()
  setInterval(() => {
    void checkForUpdates()
  }, 4 * 60 * 60 * 1000)
}

export function quitAndInstall(): void {
  if (!installerPath || installing) {
    return
  }
  installing = true
  spawn(installerPath, ['/S'], { detached: true, stdio: 'ignore' }).unref()
  app.quit()
}
