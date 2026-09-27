import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { DeviceLists, Meters, AudioStatus } from '../shared/types'

interface NativeAddon {
  listDevices(): DeviceLists
  start(opts: { inputId: string; cableId: string; monitorId: string }): void
  stop(): void
  status(): AudioStatus
  findCable(): { found: boolean; id: string; name: string }
  setVoiceEnabled(on: boolean): void
  setMonitorEnabled(on: boolean): void
  setMode(mode: number): void
  setPitchSemitones(semis: number): void
  setInputGain(g: number): void
  setOutputGain(g: number): void
  setPadGain(g: number): void
  setHarmonyGain(g: number): void
  setChordHoldMs(ms: number): void
  getMeters(): Meters
  loadPad(id: number, path: string): boolean
  unloadPad(id: number): void
  playPad(id: number): void
  stopPad(id: number): void
  setHotkeyCallback(fn: (id: number) => void): void
  registerHotkey(id: number, mods: number, vk: number): boolean
  clearHotkeys(): void
  stopHotkeys(): void
}

let cached: NativeAddon | null = null

export function addonPath(): string {
  const name = 'openvoice_audio.node'
  const candidates = [
    join(app.getAppPath(), 'build', 'Release', name),
    join(process.cwd(), 'build', 'Release', name),
    join(process.resourcesPath, 'native', name),
    join(process.resourcesPath, 'app.asar.unpacked', 'build', 'Release', name)
  ]
  for (const p of candidates) {
    if (existsSync(p)) {
      return p
    }
  }
  return candidates[0]
}

export function loadAddon(): NativeAddon {
  if (cached) {
    return cached
  }
  const require = createRequire(import.meta.url)
  cached = require(addonPath()) as NativeAddon
  return cached
}
