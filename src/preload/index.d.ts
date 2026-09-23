import type { OpenVoiceApi } from './index'

declare global {
  interface Window {
    openvoice: OpenVoiceApi
  }
}

export {}
