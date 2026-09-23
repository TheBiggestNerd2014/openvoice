import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { loadAddon } from './addon'
import { loadSettings, saveSettings } from './settings'
import { applyHotkeys, clearHotkeys, setPlayHandler } from './hotkeys'
import { findBundledInstaller, launchBundledInstaller } from './cable'
import { startAutoUpdater, getUpdateStatus, onUpdateStatus, quitAndInstall } from './updater'
import { defaultSettings, type AppSettings, type VoiceMode } from '../shared/types'

function appIcon(): string | undefined {
  const packed = join(app.getAppPath(), 'resources', 'build', 'icon.png')
  if (existsSync(packed)) {
    return packed
  }
  const dev = join(process.cwd(), 'resources', 'build', 'icon.png')
  return existsSync(dev) ? dev : undefined
}

const voiceModeIndex = (mode: VoiceMode): number => {
  switch (mode) {
    case 'pitch':
      return 0
    case 'squeaky':
      return 1
    case 'robot':
      return 2
    case 'chords':
      return 3
    default:
      return 0
  }
}

let mainWindow: BrowserWindow | null = null
let settings: AppSettings = defaultSettings()

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 920,
    height: 720,
    minWidth: 780,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    icon: appIcon(),
    backgroundColor: '#12141a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function pushAudioParams(): void {
  const audio = loadAddon()
  audio.setMode(voiceModeIndex(settings.voiceMode))
  audio.setPitchSemitones(settings.pitchSemitones)
  audio.setInputGain(settings.inputGain)
  audio.setOutputGain(settings.outputGain)
  audio.setPadGain(settings.padGain)
  audio.setHarmonyGain(settings.harmonyGain)
  audio.setChordHoldMs(settings.chordHoldMs)
}

async function reloadPads(): Promise<void> {
  const audio = loadAddon()
  for (const pad of settings.pads) {
    if (existsSync(pad.path)) {
      try {
        audio.loadPad(pad.id, pad.path)
      } catch (err) {
        console.warn('Failed to load pad', pad.path, err)
      }
    }
  }
}

app.whenReady().then(async () => {
  settings = loadSettings()

  try {
    const audio = loadAddon()
    setPlayHandler((id) => audio.playPad(id))
    applyHotkeys(settings.pads)

    const cable = audio.findCable()
    if (cable.found && !settings.cableId) {
      settings.cableId = cable.id
    }

    audio.start({
      inputId: settings.inputId,
      cableId: settings.cableId,
      monitorId: settings.monitorId
    })
    pushAudioParams()
    await reloadPads()
  } catch (err) {
    console.error('Audio engine failed to start', err)
  }

  ipcMain.handle('devices:list', () => loadAddon().listDevices())
  ipcMain.handle('audio:status', () => {
    try {
      return loadAddon().status()
    } catch {
      return { running: false, cablePresent: false, voiceOn: false, monitorOn: false }
    }
  })
  ipcMain.handle('audio:meters', () => {
    try {
      return loadAddon().getMeters()
    } catch {
      return { input: 0, output: 0 }
    }
  })
  ipcMain.handle('audio:setVoice', (_e, on: boolean) => {
    loadAddon().setVoiceEnabled(on)
    if (!on) {
      loadAddon().setMonitorEnabled(false)
    }
    return loadAddon().status()
  })
  ipcMain.handle('audio:setMonitor', (_e, on: boolean) => {
    loadAddon().setMonitorEnabled(on)
    return loadAddon().status()
  })
  ipcMain.handle('settings:get', () => settings)
  ipcMain.handle('settings:update', (_e, patch: Partial<AppSettings>) => {
    settings = { ...settings, ...patch, pads: patch.pads ?? settings.pads }
    saveSettings(settings)
    try {
      pushAudioParams()
    } catch {
      // addon may be missing during first-run UI
    }
    if (patch.pads) {
      applyHotkeys(settings.pads)
    }
    return settings
  })
  ipcMain.handle('audio:restart', async (_e, ids: { inputId: string; cableId: string; monitorId: string }) => {
    settings.inputId = ids.inputId
    settings.cableId = ids.cableId
    settings.monitorId = ids.monitorId
    saveSettings(settings)
    const audio = loadAddon()
    audio.stop()
    audio.start(ids)
    pushAudioParams()
    await reloadPads()
    return audio.status()
  })
  ipcMain.handle('pads:add', async () => {
    if (!mainWindow) {
      return settings
    }
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Add soundboard clip',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Audio', extensions: ['wav', 'mp3', 'ogg', 'flac'] }]
    })
    if (result.canceled) {
      return settings
    }
    const used = new Set(settings.pads.map((p) => p.id))
    const audio = loadAddon()
    for (const path of result.filePaths) {
      let id = 0
      while (used.has(id) && id < 32) {
        id += 1
      }
      if (id >= 32) {
        break
      }
      used.add(id)
      try {
        audio.loadPad(id, path)
        const name = path.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') ?? `Pad ${id + 1}`
        settings.pads = [...settings.pads, { id, name, path, hotkey: '', volume: 1 }]
      } catch (err) {
        console.warn(err)
      }
    }
    saveSettings(settings)
    applyHotkeys(settings.pads)
    return settings
  })
  ipcMain.handle('pads:remove', (_e, id: number) => {
    try {
      loadAddon().unloadPad(id)
    } catch {
      // ignore
    }
    settings.pads = settings.pads.filter((p) => p.id !== id)
    saveSettings(settings)
    applyHotkeys(settings.pads)
    return settings
  })
  ipcMain.handle('pads:play', (_e, id: number) => {
    loadAddon().playPad(id)
  })
  ipcMain.handle('pads:stop', (_e, id: number) => {
    loadAddon().stopPad(id)
  })
  ipcMain.handle('cable:installer', () => ({
    path: findBundledInstaller(),
    bundled: Boolean(findBundledInstaller())
  }))
  ipcMain.handle('cable:install', () => launchBundledInstaller())
  ipcMain.handle('cable:find', () => loadAddon().findCable())
  ipcMain.handle('update:status', () => getUpdateStatus())
  ipcMain.handle('update:install', () => {
    quitAndInstall()
  })

  startAutoUpdater()
  onUpdateStatus((next) => {
    mainWindow?.webContents.send('update:changed', next)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('will-quit', () => {
  clearHotkeys()
  try {
    loadAddon().stop()
  } catch {
    // ignore
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
