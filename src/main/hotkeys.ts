import { globalShortcut } from 'electron'
import { normalizeAccelerator } from '../shared/accelerator'
import type { PadBinding } from '../shared/types'

type PlayFn = (id: number) => void

let play: PlayFn = () => undefined

export function setPlayHandler(fn: PlayFn): void {
  play = fn
}

export function applyHotkeys(pads: PadBinding[]): { pads: PadBinding[]; warning?: string; changed: boolean } {
  globalShortcut.unregisterAll()
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
    try {
      const ok = globalShortcut.register(accelerator, () => play(pad.id))
      if (!ok) {
        failed.push(accelerator)
        return { ...pad, hotkey: '' }
      }
      return { ...pad, hotkey: accelerator }
    } catch {
      failed.push(accelerator)
      return { ...pad, hotkey: '' }
    }
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
}
