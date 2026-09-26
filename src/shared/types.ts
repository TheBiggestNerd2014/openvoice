export type VoiceMode = 'pitch' | 'squeaky' | 'robot' | 'chords'
export type ThemeMode = 'light' | 'dark'

export interface AudioDevice {
  id: string
  name: string
  isDefault: boolean
}

export interface DeviceLists {
  inputs: AudioDevice[]
  outputs: AudioDevice[]
}

export interface PadBinding {
  id: number
  name: string
  path: string
  hotkey: string
  volume: number
}

export interface AppSettings {
  inputId: string
  cableId: string
  monitorId: string
  voiceMode: VoiceMode
  pitchSemitones: number
  inputGain: number
  outputGain: number
  padGain: number
  harmonyGain: number
  chordHoldMs: number
  theme: ThemeMode
  pads: PadBinding[]
}

export interface SettingsUpdate {
  settings: AppSettings
  warning?: string
}

export interface AudioStatus {
  running: boolean
  cablePresent: boolean
  voiceOn: boolean
  monitorOn: boolean
}

export interface Meters {
  input: number
  output: number
}

export type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'current' | 'error'

export interface UpdateStatus {
  state: UpdateState
  version?: string
  message?: string
}

export const defaultSettings = (): AppSettings => ({
  inputId: '',
  cableId: '',
  monitorId: '',
  voiceMode: 'pitch',
  pitchSemitones: 0,
  inputGain: 1,
  outputGain: 1,
  padGain: 1,
  harmonyGain: 1,
  chordHoldMs: 90,
  theme: 'light',
  pads: []
})
