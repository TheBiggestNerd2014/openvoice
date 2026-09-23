import { createRequire } from 'node:module'
import { app } from 'electron'
import type { UpdateStatus } from '../shared/types'
import type { AppUpdater } from 'electron-updater'

const require = createRequire(import.meta.url)
const { autoUpdater } = require('electron-updater') as { autoUpdater: AppUpdater }

let status: UpdateStatus = { state: 'idle' }
const listeners = new Set<(next: UpdateStatus) => void>()

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

export function startAutoUpdater(): void {
  autoUpdater.allowPrerelease = false
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    setStatus({ state: 'checking', message: 'Checking for updates…' })
  })
  autoUpdater.on('update-available', (info) => {
    setStatus({ state: 'available', version: info.version, message: `Update ${info.version} found` })
  })
  autoUpdater.on('update-not-available', (info) => {
    setStatus({ state: 'current', version: info.version, message: 'Up to date' })
  })
  autoUpdater.on('download-progress', (progress) => {
    setStatus({
      state: 'downloading',
      message: `Downloading update… ${Math.round(progress.percent)}%`
    })
  })
  autoUpdater.on('update-downloaded', (info) => {
    setStatus({
      state: 'ready',
      version: info.version,
      message: `Update ${info.version} ready. Restart to install.`
    })
  })
  autoUpdater.on('error', (err) => {
    const raw = err.message ?? 'Update check failed'
    const missingRelease = /404|releases\.atom|ENOTFOUND|ETIMEDOUT|ECONN/i.test(raw)
    setStatus({
      state: missingRelease ? 'idle' : 'error',
      message: missingRelease
        ? 'No public release yet. Updates start once the GitHub repo is public and a full release is published.'
        : raw.split('\n')[0]
    })
  })

  if (!app.isPackaged) {
    setStatus({ state: 'idle', message: 'Updates run from an installed build' })
    return
  }

  const poll = (): void => {
    autoUpdater.checkForUpdates().catch((err: Error) => {
      const raw = err.message ?? 'Update check failed'
      const missingRelease = /404|releases\.atom|ENOTFOUND|ETIMEDOUT|ECONN/i.test(raw)
      setStatus({
        state: missingRelease ? 'idle' : 'error',
        message: missingRelease
          ? 'No public release yet. Updates start once the GitHub repo is public and a full release is published.'
          : raw.split('\n')[0]
      })
    })
  }

  poll()
  setInterval(poll, 4 * 60 * 60 * 1000)
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall()
}
