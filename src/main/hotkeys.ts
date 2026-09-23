import { globalShortcut } from 'electron'
import type { PadBinding } from '../shared/types'

type PlayFn = (id: number) => void

let play: PlayFn = () => undefined

export function setPlayHandler(fn: PlayFn): void {
  play = fn
}

export function applyHotkeys(pads: PadBinding[]): void {
  globalShortcut.unregisterAll()
  for (const pad of pads) {
    if (!pad.hotkey) {
      continue
    }
    try {
      const ok = globalShortcut.register(pad.hotkey, () => play(pad.id))
      if (!ok) {
        console.warn(`Hotkey in use: ${pad.hotkey}`)
      }
    } catch (err) {
      console.warn(`Invalid hotkey ${pad.hotkey}`, err)
    }
  }
}

export function clearHotkeys(): void {
  globalShortcut.unregisterAll()
}
