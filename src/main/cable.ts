import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'

const execFileAsync = promisify(execFile)

export function vbcableDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'vbcable')
  }
  return join(app.getAppPath(), 'resources', 'vbcable')
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) {
    return []
  }
  const found: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      found.push(...walk(path))
    } else {
      found.push(path)
    }
  }
  return found
}

function setupRank(path: string): number {
  const name = path.toLowerCase()
  if (!name.endsWith('.exe')) {
    return 0
  }
  if (name.includes('x64') && name.includes('setup')) {
    return 4
  }
  if (name.includes('x64')) {
    return 3
  }
  if (name.includes('setup')) {
    return 2
  }
  return 1
}

function findSetupExe(dir: string): string | null {
  let best: string | null = null
  let bestRank = 0
  for (const path of walk(dir)) {
    const rank = setupRank(path)
    if (rank > bestRank) {
      best = path
      bestRank = rank
    }
  }
  return best
}

export function findBundledInstaller(): string | null {
  const dir = vbcableDir()
  if (!existsSync(dir)) {
    return null
  }
  const names = readdirSync(dir)
  const zip = names.find((name) => name.toLowerCase().endsWith('.zip'))
  if (zip) {
    return join(dir, zip)
  }
  return findSetupExe(dir)
}

async function extractZip(zipPath: string, dest: string): Promise<void> {
  mkdirSync(dest, { recursive: true })
  await execFileAsync('tar', ['-xf', zipPath, '-C', dest], { windowsHide: true })
}

function psLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

async function launchSetup(exe: string): Promise<void> {
  const dir = dirname(exe)
  const command = [
    `Get-ChildItem -LiteralPath ${psLiteral(dir)} -Recurse -File | Unblock-File`,
    `Start-Process -FilePath ${psLiteral(exe)} -WorkingDirectory ${psLiteral(dir)} -Verb RunAs`
  ].join('; ')
  await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
    { windowsHide: true }
  )
}

export async function launchBundledInstaller(): Promise<{ ok: boolean; path?: string; error?: string }> {
  const bundled = findBundledInstaller()
  if (!bundled) {
    return { ok: false, error: 'This build does not include the VB-CABLE installer.' }
  }

  let setupDir = vbcableDir()
  if (bundled.toLowerCase().endsWith('.zip')) {
    setupDir = join(app.getPath('temp'), 'openvoice-vbcable')
    try {
      await extractZip(bundled, setupDir)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unpack failed'
      return { ok: false, path: bundled, error: `Couldn't unpack VB-CABLE. ${message}` }
    }
  }

  const exe = findSetupExe(setupDir)
  if (!exe) {
    return { ok: false, path: bundled, error: 'The VB-CABLE package does not contain a setup program.' }
  }

  try {
    await launchSetup(exe)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Launch failed'
    return { ok: false, path: exe, error: `Couldn't start the VB-CABLE setup. ${message}` }
  }
  return { ok: true, path: exe }
}
