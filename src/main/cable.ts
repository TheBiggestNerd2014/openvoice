import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { app, shell } from 'electron'

export function vbcableDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'vbcable')
  }
  return join(app.getAppPath(), 'resources', 'vbcable')
}

export function findBundledInstaller(): string | null {
  const dir = vbcableDir()
  if (!existsSync(dir)) {
    return null
  }
  const exe = readdirSync(dir).find((name) => name.toLowerCase().endsWith('.exe'))
  return exe ? join(dir, exe) : null
}

export async function launchBundledInstaller(): Promise<{ ok: boolean; path?: string; error?: string }> {
  const path = findBundledInstaller()
  if (!path) {
    return {
      ok: false,
      error: 'No VB-CABLE installer found. Place the official setup .exe in resources/vbcable/.'
    }
  }
  const err = await shell.openPath(path)
  if (err) {
    return { ok: false, path, error: err }
  }
  return { ok: true, path }
}
