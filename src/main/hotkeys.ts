import { globalShortcut } from 'electron'
import { nativeHotkeySpec, normalizeAccelerator, prefersNativeHotkey } from '../shared/accelerator'
import type { PadBinding } from '../shared/types'
import { loadAddon } from './addon'

type PlayFn = (id: number) => void

let play: PlayFn = () => undefined
let callbackSet = false

export function setPlayHandler(fn: PlayFn): void {
  play = fn
}

function ensureCallback(): boolean {
  try {
    if (!callbackSet) {
      loadAddon().setHotkeyCallback((id: number) => play(id))
      callbackSet = true
    }
    return true
  } catch {
    return false
  }
}

function registerNative(id: number, spec: { mods: number; vk: number }): boolean {
  if (!ensureCallback()) {
    return false
  }
  try {
    return loadAddon().registerHotkey(id, spec.mods, spec.vk)
  } catch {
    return false
  }
}

function clearNative(): void {
  try {
    loadAddon().clearHotkeys()
  } catch {
    // The native addon is optional for ordinary Electron shortcuts.
  }
}

function registerElectron(accelerator: string, id: number): boolean {
  try {
    return globalShortcut.register(accelerator, () => play(id))
  } catch {
    return false
  }
}

export function applyHotkeys(pads: PadBinding[]): { pads: PadBinding[]; warning?: string; changed: boolean } {
  globalShortcut.unregisterAll()
  clearNative()
  const failed: string[] = []
  const next = pads.map((pad) => {
    if (!pad.hotkey) {
      return pad
    }
    const accelerator = normalizeAccelerator(pad.hotkey)
    if (!accelerator) {
      failed.push(pad.hotkey)
      return { ...pad, hotkey: '' }
    }
    const spec = nativeHotkeySpec(accelerator)
    const nativeFirst = prefersNativeHotkey(accelerator)
    let bound = false
    if (nativeFirst) {
      bound = spec != null && registerNative(pad.id, spec)
    } else {
      bound = registerElectron(accelerator, pad.id)
      if (!bound && spec) {
        bound = registerNative(pad.id, spec)
      }
    }
    if (!bound) {
      failed.push(accelerator)
      return { ...pad, hotkey: '' }
    }
    return { ...pad, hotkey: accelerator }
  })
  const changed = pads.some((pad, index) => pad.hotkey !== next[index]?.hotkey)
  return {
    pads: next,
    changed,
    warning: failed.length > 0 ? `Could not register ${failed.join(', ')}. Pick another key.` : undefined
  }
}

export function clearHotkeys(): void {
  globalShortcut.unregisterAll()
  clearNative()
}

export function stopHotkeys(): void {
  clearHotkeys()
  try {
    loadAddon().stopHotkeys()
  } catch {
    // ignore
  }
  callbackSet = false
}
