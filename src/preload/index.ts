import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, AudioStatus, DeviceLists, Meters, UpdateStatus } from '../shared/types'

const api = {
  listDevices: (): Promise<DeviceLists> => ipcRenderer.invoke('devices:list'),
  status: (): Promise<AudioStatus> => ipcRenderer.invoke('audio:status'),
  meters: (): Promise<Meters> => ipcRenderer.invoke('audio:meters'),
  setVoice: (on: boolean): Promise<AudioStatus> => ipcRenderer.invoke('audio:setVoice', on),
  setMonitor: (on: boolean): Promise<AudioStatus> => ipcRenderer.invoke('audio:setMonitor', on),
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:update', patch),
  restartAudio: (ids: { inputId: string; cableId: string; monitorId: string }): Promise<AudioStatus> =>
    ipcRenderer.invoke('audio:restart', ids),
  addPads: (): Promise<AppSettings> => ipcRenderer.invoke('pads:add'),
  removePad: (id: number): Promise<AppSettings> => ipcRenderer.invoke('pads:remove', id),
  playPad: (id: number): Promise<void> => ipcRenderer.invoke('pads:play', id),
  stopPad: (id: number): Promise<void> => ipcRenderer.invoke('pads:stop', id),
  installerInfo: (): Promise<{ path: string | null; bundled: boolean }> =>
    ipcRenderer.invoke('cable:installer'),
  installCable: (): Promise<{ ok: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('cable:install'),
  findCable: (): Promise<{ found: boolean; id: string; name: string }> =>
    ipcRenderer.invoke('cable:find'),
  updateStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke('update:status'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('update:install'),
  onUpdate: (fn: (status: UpdateStatus) => void): (() => void) => {
    const handler = (_e: unknown, status: UpdateStatus): void => fn(status)
    ipcRenderer.on('update:changed', handler)
    return () => {
      ipcRenderer.removeListener('update:changed', handler)
    }
  }
}

contextBridge.exposeInMainWorld('openvoice', api)

export type OpenVoiceApi = typeof api
