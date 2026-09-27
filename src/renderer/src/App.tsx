import { useCallback, useEffect, useMemo, useState } from 'react'
import { acceleratorFromEvent, formatAccelerator } from '../../shared/accelerator'
import {
  defaultSettings,
  type AppSettings,
  type AudioDevice,
  type AudioStatus,
  type ThemeMode,
  type UpdateStatus,
  type VoiceMode
} from '../../shared/types'
import logo from './assets/logo.png'

const isCableOutput = (name: string): boolean => /cable output/i.test(name)
const isCableInput = (name: string): boolean => /cable input/i.test(name)
const isLoopback = (name: string): boolean => /loopback|stereo mix/i.test(name)

const voices: { id: VoiceMode; label: string; wip?: boolean }[] = [
  { id: 'pitch', label: 'Pitch' },
  { id: 'squeaky', label: 'Squeaky' },
  { id: 'robot', label: 'Robot' },
  { id: 'chords', label: 'Auto Chords', wip: true }
]

function DeviceSelect({
  label,
  value,
  devices,
  onChange,
  allowEmpty,
  emptyLabel
}: {
  label: string
  value: string
  devices: AudioDevice[]
  onChange: (id: string) => void
  allowEmpty?: boolean
  emptyLabel?: string
}) {
  return (
    <label className="field grow">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {allowEmpty ? <option value="">{emptyLabel ?? 'Default'}</option> : null}
        {devices.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
            {d.isDefault ? ' (default)' : ''}
          </option>
        ))}
      </select>
    </label>
  )
}

export function App() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [inputs, setInputs] = useState<AudioDevice[]>([])
  const [outputs, setOutputs] = useState<AudioDevice[]>([])
  const [status, setStatus] = useState<AudioStatus>({
    running: false,
    cablePresent: false,
    voiceOn: false,
    monitorOn: false
  })
  const [meters, setMeters] = useState({ input: 0, output: 0 })
  const [installerBundled, setInstallerBundled] = useState(false)
  const [bindId, setBindId] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [update, setUpdate] = useState<UpdateStatus>({ state: 'idle' })
  const [updateDismissed, setUpdateDismissed] = useState('')

  const refresh = useCallback(async () => {
    if (!window.openvoice) {
      return
    }
    const [nextSettings, devices, nextStatus, installer, nextUpdate] = await Promise.all([
      window.openvoice.getSettings(),
      window.openvoice.listDevices(),
      window.openvoice.status(),
      window.openvoice.installerInfo(),
      window.openvoice.updateStatus()
    ])
    setSettings(nextSettings)
    setInputs(devices.inputs)
    setOutputs(devices.outputs)
    setStatus(nextStatus)
    setInstallerBundled(installer.bundled)
    setUpdate(nextUpdate)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
  }, [settings.theme])

  useEffect(() => {
    void refresh()
    if (!window.openvoice) {
      return
    }
    return window.openvoice.onUpdate(setUpdate)
  }, [refresh])

  useEffect(() => {
    if (!window.openvoice) {
      return
    }
    const timer = window.setInterval(async () => {
      setMeters(await window.openvoice.meters())
      setStatus(await window.openvoice.status())
    }, 80)
    return () => window.clearInterval(timer)
  }, [])

  const commit = useCallback(async (patch: Partial<AppSettings>) => {
    if (!window.openvoice) {
      setSettings((current) => ({ ...current, ...patch }))
      return
    }
    const result = await window.openvoice.updateSettings(patch)
    if (patch.pads || result.warning) {
      setMessage(result.warning ?? '')
    }
    setSettings(result.settings)
  }, [])

  useEffect(() => {
    if (bindId === null) {
      return
    }
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setBindId(null)
        return
      }
      const accel = acceleratorFromEvent(e)
      if (!accel) {
        setMessage('That key can’t be a global hotkey. Left and right Ctrl, Shift, Alt, Page Up, and Page Down can.')
        return
      }
      const pads = settings.pads.map((p) => (p.id === bindId ? { ...p, hotkey: accel } : p))
      void commit({ pads })
      setBindId(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [bindId, settings.pads, commit])

  const updatePending = update.state === 'available' || update.state === 'downloading' || update.state === 'ready'
  const showUpdate = updatePending && update.version !== updateDismissed
  const cableMissing = !status.cablePresent && Boolean(window.openvoice)
  const micDevices = inputs.filter((d) => !isCableOutput(d.name) && !isLoopback(d.name))
  const monitorDevices = outputs.filter((d) => !isCableInput(d.name))

  const applyDevices = async (patch: Partial<Pick<AppSettings, 'inputId' | 'cableId' | 'monitorId'>>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    if (!window.openvoice) {
      return
    }
    setStatus(
      await window.openvoice.restartAudio({
        inputId: next.inputId,
        cableId: next.cableId,
        monitorId: next.monitorId
      })
    )
  }

  const setTheme = (theme: ThemeMode) => {
    void commit({ theme })
  }

  const inWidth = useMemo(() => `${Math.min(100, meters.input * 140)}%`, [meters.input])
  const outWidth = useMemo(() => `${Math.min(100, meters.output * 140)}%`, [meters.output])

  return (
    <div className="app">
      {showUpdate ? (
        <div className="update-pop" role="dialog" aria-modal="true" aria-labelledby="update-title">
          <div className="update-card">
            <p className="update-kicker">New update</p>
            <h2 id="update-title" className="update-title">
              {update.state === 'ready' ? 'A new build is ready to install' : 'A new build is on the way'}
            </h2>
            <p className="sub">Build {update.version}</p>
            {update.changes && update.changes.length > 0 ? (
              <ul className="update-changes">
                {update.changes.map((change, index) => (
                  <li key={`${change.title}-${index}`}>
                    <strong>{change.title}</strong>
                    {change.detail ? <span>{change.detail}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sub">Restart after it finishes downloading to install this build.</p>
            )}
            <div className="row">
              <button
                className="btn primary"
                disabled={update.state !== 'ready'}
                onClick={() => void window.openvoice?.installUpdate()}
              >
                {update.state === 'ready' ? 'Restart and install' : (update.message ?? 'Downloading…')}
              </button>
              <button className="btn" onClick={() => setUpdateDismissed(update.version ?? '')}>
                Later
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <header className="top">
        <div className="brand">
          <img className="logo" src={logo} alt="" />
          <div>
            <h1>OpenVoice</h1>
            <p className="sub">Mic, effects, and soundboard into VB-CABLE.</p>
          </div>
        </div>
        <div className="theme-switch" role="group" aria-label="Color theme">
          <button className={settings.theme === 'light' ? 'on' : ''} onClick={() => setTheme('light')}>
            Light
          </button>
          <button className={settings.theme === 'dark' ? 'on' : ''} onClick={() => setTheme('dark')}>
            Dark
          </button>
        </div>
      </header>

      {cableMissing ? (
        <div className="banner">
          <p>
            VB-CABLE was not found. Install it, then pick <strong>CABLE Input</strong> as the output
            here. Discord and games should use <strong>CABLE Output</strong> as the mic.
          </p>
          <button
            className="btn primary"
            onClick={async () => {
              if (!window.openvoice) {
                return
              }
              const result = await window.openvoice.installCable()
              setMessage(result.ok ? 'Installer launched. Re-scan devices after it finishes.' : result.error ?? 'Install failed')
              if (result.ok) {
                window.setTimeout(() => void refresh(), 4000)
              }
            }}
            disabled={!installerBundled}
            title={installerBundled ? 'Install VB-CABLE' : 'This build does not include the VB-CABLE installer'}
          >
            Install VB-CABLE
          </button>
        </div>
      ) : null}

      {message ? <p className="toast">{message}</p> : null}

      <section className="panel hero">
        <div className="row">
          <button
            className={`btn ${status.voiceOn ? 'primary' : ''}`}
            onClick={async () => {
              if (!window.openvoice) {
                return
              }
              setStatus(await window.openvoice.setVoice(!status.voiceOn))
            }}
          >
            VC {status.voiceOn ? 'On' : 'Off'}
          </button>
          <button
            className={`btn ${status.monitorOn ? 'primary' : ''}`}
            disabled={!status.voiceOn}
            onClick={async () => {
              if (!window.openvoice) {
                return
              }
              setStatus(await window.openvoice.setMonitor(!status.monitorOn))
            }}
          >
            Monitor {status.monitorOn ? 'On' : 'Off'}
          </button>
          <div className="meters grow">
            <div>
              <div className="hint">Input</div>
              <div className="meter">
                <i style={{ width: inWidth }} />
              </div>
            </div>
            <div>
              <div className="hint">Output</div>
              <div className="meter">
                <i style={{ width: outWidth }} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Route</h2>
        <div className="row">
          <DeviceSelect
            label="Microphone"
            value={settings.inputId}
            devices={micDevices}
            allowEmpty
            emptyLabel="System default"
            onChange={(inputId) => void applyDevices({ inputId })}
          />
          <DeviceSelect
            label="VB-CABLE (CABLE Input)"
            value={settings.cableId}
            devices={outputs}
            allowEmpty
            emptyLabel="Not selected"
            onChange={(cableId) => void applyDevices({ cableId })}
          />
          <DeviceSelect
            label="Monitor headphones"
            value={settings.monitorId}
            devices={monitorDevices}
            allowEmpty
            emptyLabel="System default"
            onChange={(monitorId) => void applyDevices({ monitorId })}
          />
        </div>
        <p className="hint">
          Use headphones for monitor. CABLE Output is not offered as a mic, so the output cannot loop back into the input.
        </p>
      </section>

      <section className="panel">
        <h2>Voice</h2>
        <div className="voices">
          {voices.map((v) => (
            <button
              key={v.id}
              className={`voice ${settings.voiceMode === v.id ? 'sel' : ''}`}
              onClick={() => void commit({ voiceMode: v.id })}
            >
              <span>{v.label}</span>
              {v.wip ? <span className="badge">WIP</span> : null}
            </button>
          ))}
        </div>
        {settings.voiceMode === 'pitch' ? (
          <label className="field">
            Pitch ({settings.pitchSemitones > 0 ? '+' : ''}{settings.pitchSemitones.toFixed(1)} st)
            <input
              type="range"
              min={-12}
              max={12}
              step={0.5}
              value={settings.pitchSemitones}
              onChange={(e) => void commit({ pitchSemitones: Number(e.target.value) })}
            />
          </label>
        ) : null}
        {settings.voiceMode === 'chords' ? (
          <>
            <p className="wip-note">Work in progress. The chord code is still here, and it is not finished.</p>
            <div className="row">
              <label className="field grow">
                Chord level ({Math.round(settings.harmonyGain * 100)}%)
                <input
                  type="range"
                  min={0}
                  max={1.5}
                  step={0.01}
                  value={settings.harmonyGain}
                  onChange={(e) => void commit({ harmonyGain: Number(e.target.value) })}
                />
              </label>
              <label className="field grow">
                Chord hold ({Math.round(settings.chordHoldMs)} ms)
                <input
                  type="range"
                  min={40}
                  max={220}
                  step={5}
                  value={settings.chordHoldMs}
                  onChange={(e) => void commit({ chordHoldMs: Number(e.target.value) })}
                />
              </label>
            </div>
          </>
        ) : null}
        <div className="row gains">
          <label className="field grow">
            Input gain
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={settings.inputGain}
              onChange={(e) => void commit({ inputGain: Number(e.target.value) })}
            />
          </label>
          <label className="field grow">
            Output gain
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={settings.outputGain}
              onChange={(e) => void commit({ outputGain: Number(e.target.value) })}
            />
          </label>
          <label className="field grow">
            Soundboard gain
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={settings.padGain}
              onChange={(e) => void commit({ padGain: Number(e.target.value) })}
            />
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>Soundboard</h2>
          <button
            className="btn"
            onClick={async () => {
              if (!window.openvoice) {
                return
              }
              setSettings(await window.openvoice.addPads())
            }}
          >
            Add clips
          </button>
        </div>
        {settings.pads.length === 0 ? (
          <p className="empty">No clips yet. Add your own wav, mp3, or ogg files.</p>
        ) : (
          <div className="grid">
            {settings.pads.map((pad) => (
              <div key={pad.id} className={`pad ${bindId === pad.id ? 'binding' : ''}`}>
                <strong>{pad.name}</strong>
                <div className="meta">
                  {bindId === pad.id ? 'Press a key…' : pad.hotkey ? formatAccelerator(pad.hotkey) : 'No hotkey'}
                </div>
                <div className="pad-actions">
                  <button className="btn tiny" onClick={() => void window.openvoice?.playPad(pad.id)}>
                    Play
                  </button>
                  <button
                    className={`btn tiny ${pad.stopOnRetrigger ? 'on' : ''}`}
                    onClick={() => {
                      const pads = settings.pads.map((item) =>
                        item.id === pad.id ? { ...item, stopOnRetrigger: !item.stopOnRetrigger } : item
                      )
                      void commit({ pads })
                    }}
                  >
                    {pad.stopOnRetrigger ? 'Press stops' : 'Press replays'}
                  </button>
                  <button className="btn tiny" onClick={() => void window.openvoice?.stopPad(pad.id)}>
                    Stop
                  </button>
                  <button className="btn tiny" onClick={() => setBindId(pad.id)}>
                    Bind
                  </button>
                  <button
                    className="btn tiny danger"
                    onClick={async () => {
                      if (!window.openvoice) {
                        return
                      }
                      setSettings(await window.openvoice.removePad(pad.id))
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="update">
        <button
          className="btn tiny"
          disabled={update.state === 'checking' || update.state === 'downloading'}
          onClick={() => {
            setUpdateDismissed('')
            void window.openvoice?.checkForUpdates()
          }}
        >
          Check for updates
        </button>
        {update.state === 'ready' ? (
          <button className="btn tiny" onClick={() => void window.openvoice?.installUpdate()}>
            Restart and install {update.version}
          </button>
        ) : (
          <span>{update.message ?? ''}</span>
        )}
      </div>
    </div>
  )
}
