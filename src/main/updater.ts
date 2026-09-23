import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateStatus } from '../shared/types'

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
    setStatus({ state: 'error', message: err.message })
  })

  if (!app.isPackaged) {
    setStatus({ state: 'idle', message: 'Updates run from an installed build' })
    return
  }

  const poll = (): void => {
    autoUpdater.checkForUpdates().catch((err: Error) => {
      setStatus({ state: 'error', message: err.message })
    })
  }

  poll()
  setInterval(poll, 4 * 60 * 60 * 1000)
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall()
}
