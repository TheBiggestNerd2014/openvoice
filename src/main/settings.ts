import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { defaultSettings, type AppSettings, type PadBinding } from '../shared/types'

const filePath = (): string => join(app.getPath('userData'), 'settings.json')

export function loadSettings(): AppSettings {
  const defaults = defaultSettings()
  try {
    const path = filePath()
    if (!existsSync(path)) {
      return defaults
    }
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<AppSettings>
    const harmonyGain =
      typeof parsed.harmonyGain === 'number' && parsed.harmonyGain > 0.25 ? parsed.harmonyGain : defaults.harmonyGain
    return {
      ...defaults,
      ...parsed,
      harmonyGain,
      pads: Array.isArray(parsed.pads) ? (parsed.pads as PadBinding[]) : []
    }
  } catch {
    return defaults
  }
}

export function saveSettings(settings: AppSettings): void {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(filePath(), JSON.stringify(settings, null, 2), 'utf8')
}
