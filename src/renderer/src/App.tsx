import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  defaultSettings,
  type AppSettings,
  type AudioDevice,
  type AudioStatus,
  type UpdateStatus,
  type VoiceMode
} from '../../shared/types'
import logo from './assets/logo.png'

const isCableOutput = (name: string): boolean => /cable output/i.test(name)
const isCableInput = (name: string): boolean => /cable input/i.test(name)
const isLoopback = (name: string): boolean => /loopback|stereo mix/i.test(name)

const voices: { id: VoiceMode; label: string }[] = [
  { id: 'pitch', label: 'Pitch' },
  { id: 'squeaky', label: 'Squeaky' },
  { id: 'robot', label: 'Robot' },
  { id: 'chords', label: 'Auto Chords' }
]

function eventToAccelerator(e: KeyboardEvent): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
    return null
  }
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Control')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Super')
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key
  parts.push(key)
  return parts.join('+')
}

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

  const refresh = useCallback(async () => {
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
    void refresh()
    return window.openvoice.onUpdate(setUpdate)
  }, [refresh])

  useEffect(() => {
    const timer = window.setInterval(async () => {
      setMeters(await window.openvoice.meters())
      setStatus(await window.openvoice.status())
    }, 80)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (bindId === null) {
      return
    }
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      if (e.key === 'Escape') {
        setBindId(null)
        return
      }
      const accel = eventToAccelerator(e)
      if (!accel) {
        return
      }
      const pads = settings.pads.map((p) => (p.id === bindId ? { ...p, hotkey: accel } : p))
      void window.openvoice.updateSettings({ pads }).then(setSettings)
      setBindId(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [bindId, settings.pads])

  const cableMissing = !status.cablePresent
  const micDevices = inputs.filter((d) => !isCableOutput(d.name) && !isLoopback(d.name))
  const monitorDevices = outputs.filter((d) => !isCableInput(d.name))

  const applyDevices = async (patch: Partial<Pick<AppSettings, 'inputId' | 'cableId' | 'monitorId'>>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    setStatus(
      await window.openvoice.restartAudio({
        inputId: next.inputId,
        cableId: next.cableId,
        monitorId: next.monitorId
      })
    )
  }

  const patchSettings = async (patch: Partial<AppSettings>) => {
    setSettings(await window.openvoice.updateSettings(patch))
  }

  const inWidth = useMemo(() => `${Math.min(100, meters.input * 140)}%`, [meters.input])
  const outWidth = useMemo(() => `${Math.min(100, meters.output * 140)}%`, [meters.output])

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <img className="logo" src={logo} alt="" />
          <div>
            <h1>OpenVoice</h1>
            <p className="sub">Mic → effects → CABLE Input. Other apps listen on CABLE Output.</p>
          </div>
        </div>
      </header>

      {cableMissing ? (
        <div className="banner">
          <p>
            VB-CABLE was not found. Install it, then pick <strong>CABLE Input</strong> as the output
            here. Discord / games should use <strong>CABLE Output</strong> as the mic.
          </p>
          <button
            className="toggle"
            onClick={async () => {
              const result = await window.openvoice.installCable()
              setMessage(result.ok ? 'Installer launched. Re-scan devices after it finishes.' : result.error ?? 'Install failed')
              if (result.ok) {
                window.setTimeout(() => void refresh(), 4000)
              }
            }}
            disabled={!installerBundled}
            title={installerBundled ? 'Launch bundled VB-CABLE setup' : 'Drop the official setup .exe into resources/vbcable'}
          >
            Install VB-CABLE
          </button>
        </div>
      ) : null}

      {message ? <p className="hint">{message}</p> : null}

      <section className="panel">
        <div className="row">
          <button
            className={`toggle ${status.voiceOn ? 'on' : ''}`}
            onClick={async () => setStatus(await window.openvoice.setVoice(!status.voiceOn))}
          >
            VC {status.voiceOn ? 'On' : 'Off'}
          </button>
          <button
            className={`toggle ${status.monitorOn ? 'on' : ''}`}
            disabled={!status.voiceOn}
            onClick={async () => setStatus(await window.openvoice.setMonitor(!status.monitorOn))}
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
        <p className="hint" style={{ marginTop: 10 }}>
          Use headphones for monitor. CABLE Output is not offered as a mic (that loop is what causes
          digital feedback).
        </p>
      </section>

      <section className="panel">
        <div className="voices">
          {voices.map((v) => (
            <button
              key={v.id}
              className={`voice ${settings.voiceMode === v.id ? 'sel' : ''}`}
              onClick={() => void patchSettings({ voiceMode: v.id })}
            >
              {v.label}
            </button>
          ))}
        </div>
        {settings.voiceMode === 'pitch' ? (
          <label className="field" style={{ marginTop: 12 }}>
            Pitch ({settings.pitchSemitones > 0 ? '+' : ''}
            {settings.pitchSemitones.toFixed(1)} st)
            <input
              type="range"
              min={-12}
              max={12}
              step={0.5}
              value={settings.pitchSemitones}
              onChange={(e) => void patchSettings({ pitchSemitones: Number(e.target.value) })}
            />
          </label>
        ) : null}
        {settings.voiceMode === 'chords' ? (
          <div className="row" style={{ marginTop: 12 }}>
            <label className="field grow">
              Harmony gain ({Math.round(settings.harmonyGain * 100)}%)
              <input
                type="range"
                min={0}
                max={0.6}
                step={0.01}
                value={settings.harmonyGain}
                onChange={(e) => void patchSettings({ harmonyGain: Number(e.target.value) })}
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
                onChange={(e) => void patchSettings({ chordHoldMs: Number(e.target.value) })}
              />
            </label>
          </div>
        ) : null}
        <div className="row" style={{ marginTop: 12 }}>
          <label className="field grow">
            Input gain
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={settings.inputGain}
              onChange={(e) => void patchSettings({ inputGain: Number(e.target.value) })}
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
              onChange={(e) => void patchSettings({ outputGain: Number(e.target.value) })}
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
              onChange={(e) => void patchSettings({ padGain: Number(e.target.value) })}
            />
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="row" style={{ marginBottom: 10 }}>
          <strong>Soundboard</strong>
          <button className="tiny" onClick={async () => setSettings(await window.openvoice.addPads())}>
            Add clips
          </button>
        </div>
        {settings.pads.length === 0 ? (
          <p className="empty">No clips yet. Add your own wav/mp3/ogg files.</p>
        ) : (
          <div className="grid">
            {settings.pads.map((pad) => (
              <div key={pad.id} className="pad">
                <strong>{pad.name}</strong>
                <div className="meta">{bindId === pad.id ? 'Press a key…' : pad.hotkey || 'No hotkey'}</div>
                <div className="pad-actions">
                  <button className="tiny" onClick={() => void window.openvoice.playPad(pad.id)}>
                    Play
                  </button>
                  <button className="tiny" onClick={() => void window.openvoice.stopPad(pad.id)}>
                    Stop
                  </button>
                  <button className="tiny" onClick={() => setBindId(pad.id)}>
                    Bind
                  </button>
                  <button
                    className="tiny danger"
                    onClick={async () => setSettings(await window.openvoice.removePad(pad.id))}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="update">
        {update.state === 'ready' ? (
          <button className="tiny" onClick={() => void window.openvoice.installUpdate()}>
            Restart and install {update.version}
          </button>
        ) : (
          <span>{update.message ?? ''}</span>
        )}
      </p>
    </div>
  )
}
