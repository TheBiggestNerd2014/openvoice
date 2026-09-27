export interface KeyInput {
  key: string
  code: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
  repeat?: boolean
}

const MODIFIERS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'OS'])

const CODE_KEYS: Record<string, string> = {
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Space: 'Space',
  Enter: 'Enter',
  NumpadEnter: 'Enter',
  Escape: 'Escape',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Tab: 'Tab',
  CapsLock: 'Capslock',
  NumLock: 'Numlock',
  ScrollLock: 'Scrolllock',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Comma: ',',
  Period: '.',
  Slash: '/',
  NumpadAdd: 'numadd',
  NumpadSubtract: 'numsub',
  NumpadMultiply: 'nummult',
  NumpadDivide: 'numdiv',
  NumpadDecimal: 'numdec',
  Numpad0: 'num0',
  Numpad1: 'num1',
  Numpad2: 'num2',
  Numpad3: 'num3',
  Numpad4: 'num4',
  Numpad5: 'num5',
  Numpad6: 'num6',
  Numpad7: 'num7',
  Numpad8: 'num8',
  Numpad9: 'num9',
  AudioVolumeUp: 'VolumeUp',
  AudioVolumeDown: 'VolumeDown',
  AudioVolumeMute: 'VolumeMute',
  MediaTrackNext: 'MediaNextTrack',
  MediaTrackPrevious: 'MediaPreviousTrack',
  MediaPlayPause: 'MediaPlayPause',
  MediaStop: 'MediaStop',
  PrintScreen: 'PrintScreen',
  Pause: 'Pause',
  ContextMenu: 'Apps'
}

const SIDE_KEYS: Record<string, string> = {
  ControlLeft: 'LCtrl',
  ControlRight: 'RCtrl',
  ShiftLeft: 'LShift',
  ShiftRight: 'RShift',
  AltLeft: 'LAlt',
  AltRight: 'RAlt',
  MetaLeft: 'LWin',
  MetaRight: 'RWin'
}

const SUPPORTED = new Set([
  ...'0123456789'.split(''),
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
  ...'F1 F2 F3 F4 F5 F6 F7 F8 F9 F10 F11 F12 F13 F14 F15 F16 F17 F18 F19 F20 F21 F22 F23 F24'.split(' '),
  ')', '!', '@', '#', '$', '%', '^', '&', '*', '(', ':', ';', '+', '=', '<', ',', '_', '-', '>', '.', '?', '/', '~', '`', '{', ']', '[', '|', '\\', '}', '"', "'",
  'Plus', 'Space', 'Tab', 'Capslock', 'Numlock', 'Scrolllock', 'Backspace', 'Delete', 'Insert', 'Return', 'Enter',
  'Up', 'Down', 'Left', 'Right', 'Home', 'End', 'PageUp', 'PageDown', 'Escape', 'Esc', 'PrintScreen', 'Pause', 'Apps',
  'LCtrl', 'RCtrl', 'LShift', 'RShift', 'LAlt', 'RAlt', 'LWin', 'RWin',
  'VolumeUp', 'VolumeDown', 'VolumeMute', 'MediaNextTrack', 'MediaPreviousTrack', 'MediaStop', 'MediaPlayPause',
  'numdec', 'numadd', 'numsub', 'nummult', 'numdiv',
  'num0', 'num1', 'num2', 'num3', 'num4', 'num5', 'num6', 'num7', 'num8', 'num9'
])

const ALIASES: Record<string, string> = {
  arrowup: 'Up',
  arrowdown: 'Down',
  arrowleft: 'Left',
  arrowright: 'Right',
  ' ': 'Space',
  spacebar: 'Space',
  capslock: 'Capslock',
  numlock: 'Numlock',
  scrolllock: 'Scrolllock',
  '+': 'Plus',
  plus: 'Plus',
  return: 'Enter',
  esc: 'Escape',
  audiovolumeup: 'VolumeUp',
  audiovolumedown: 'VolumeDown',
  audiovolumemute: 'VolumeMute',
  mediatracknext: 'MediaNextTrack',
  mediatrackprevious: 'MediaPreviousTrack',
  mediaplaypause: 'MediaPlayPause',
  mediastop: 'MediaStop',
  printscreen: 'PrintScreen',
  pause: 'Pause',
  apps: 'Apps',
  contextmenu: 'Apps',
  lctrl: 'LCtrl',
  leftctrl: 'LCtrl',
  leftcontrol: 'LCtrl',
  rctrl: 'RCtrl',
  rightctrl: 'RCtrl',
  rightcontrol: 'RCtrl',
  lshift: 'LShift',
  leftshift: 'LShift',
  rshift: 'RShift',
  rightshift: 'RShift',
  lalt: 'LAlt',
  leftalt: 'LAlt',
  ralt: 'RAlt',
  rightalt: 'RAlt',
  lwin: 'LWin',
  leftwin: 'LWin',
  rwin: 'RWin',
  rightwin: 'RWin',
  pgup: 'PageUp',
  pgdn: 'PageDown',
  pageup: 'PageUp',
  pagedown: 'PageDown'
}

const LABELS: Record<string, string> = {
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
  Space: 'Space',
  Enter: 'Enter',
  Escape: 'Esc',
  PageUp: 'Page Up',
  PageDown: 'Page Down',
  Capslock: 'Caps Lock',
  Numlock: 'Num Lock',
  Scrolllock: 'Scroll Lock',
  VolumeUp: 'Volume Up',
  VolumeDown: 'Volume Down',
  VolumeMute: 'Mute',
  MediaNextTrack: 'Next Track',
  MediaPreviousTrack: 'Previous Track',
  MediaPlayPause: 'Play/Pause',
  MediaStop: 'Stop Media',
  PrintScreen: 'Print Screen',
  numadd: 'Num +',
  numsub: 'Num −',
  nummult: 'Num ×',
  numdiv: 'Num ÷',
  numdec: 'Num .',
  num0: 'Num 0',
  num1: 'Num 1',
  num2: 'Num 2',
  num3: 'Num 3',
  num4: 'Num 4',
  num5: 'Num 5',
  num6: 'Num 6',
  num7: 'Num 7',
  num8: 'Num 8',
  num9: 'Num 9',
  LCtrl: 'Left Ctrl',
  RCtrl: 'Right Ctrl',
  LShift: 'Left Shift',
  RShift: 'Right Shift',
  LAlt: 'Left Alt',
  RAlt: 'Right Alt',
  LWin: 'Left Win',
  RWin: 'Right Win',
  Pause: 'Pause',
  Apps: 'Menu'
}

function canonicalKey(raw: string): string | null {
  const alias = ALIASES[raw.toLowerCase()]
  if (alias) {
    return alias
  }
  if (SUPPORTED.has(raw)) {
    return raw
  }
  const match = [...SUPPORTED].find((key) => key.toLowerCase() === raw.toLowerCase())
  return match ?? null
}

function sideAccelerator(event: KeyInput, side: string): string {
  const ownCtrl = side === 'LCtrl' || side === 'RCtrl'
  const ownShift = side === 'LShift' || side === 'RShift'
  const ownAlt = side === 'LAlt' || side === 'RAlt'
  const ownMeta = side === 'LWin' || side === 'RWin'
  const parts: string[] = []
  if (event.ctrlKey && !ownCtrl) parts.push('Control')
  if (event.altKey && !ownAlt) parts.push('Alt')
  if (event.shiftKey && !ownShift) parts.push('Shift')
  if (event.metaKey && !ownMeta) parts.push('Super')
  parts.push(side)
  return parts.join('+')
}

export function acceleratorFromEvent(event: KeyInput): string | null {
  if (event.repeat) {
    return null
  }
  const side = SIDE_KEYS[event.code]
  if (side) {
    return sideAccelerator(event, side)
  }
  if (MODIFIERS.has(event.key)) {
    return null
  }

  let key = CODE_KEYS[event.code]
  if (!key && /^Key[A-Z]$/.test(event.code)) {
    key = event.code.slice(3)
  }
  if (!key && /^Digit[0-9]$/.test(event.code)) {
    key = event.code.slice(5)
  }
  if (!key && /^F(?:[1-9]|1[0-9]|2[0-4])$/.test(event.key)) {
    key = event.key
  }
  if (!key && event.key.startsWith('Arrow') && event.key.length > 5) {
    key = event.key.slice(5)
  }
  if (!key) {
    key = canonicalKey(event.key) ?? undefined
  }
  if (!key || !SUPPORTED.has(key)) {
    return null
  }

  const parts: string[] = []
  if (event.ctrlKey) parts.push('Control')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  if (event.metaKey) parts.push('Super')
  parts.push(key)
  return parts.join('+')
}

export function normalizeAccelerator(raw: string): string | null {
  if (/^\s+$/.test(raw)) {
    return 'Space'
  }
  const parts = raw.trim().split('+').map((part) => part.trim()).filter(Boolean)
  if (parts.length === 0) {
    return null
  }
  const key = canonicalKey(parts[parts.length - 1])
  if (!key) {
    return null
  }
  const mods: string[] = []
  for (const part of parts.slice(0, -1)) {
    const lower = part.toLowerCase()
    if (lower === 'control' || lower === 'ctrl' || lower === 'commandorcontrol' || lower === 'cmdorctrl') {
      mods.push('Control')
    } else if (lower === 'alt' || lower === 'option') {
      mods.push('Alt')
    } else if (lower === 'shift') {
      mods.push('Shift')
    } else if (lower === 'super' || lower === 'meta' || lower === 'command' || lower === 'cmd') {
      mods.push('Super')
    } else {
      return null
    }
  }
  return [...mods, key].join('+')
}

export function formatAccelerator(accelerator: string): string {
  return accelerator
    .split('+')
    .map((part) => LABELS[part] ?? part)
    .join(' + ')
}

const MOD_ALT = 0x0001
const MOD_CONTROL = 0x0002
const MOD_SHIFT = 0x0004
const MOD_WIN = 0x0008

const SIDE_HOTKEYS = new Set(['LCtrl', 'RCtrl', 'LShift', 'RShift', 'LAlt', 'RAlt', 'LWin', 'RWin'])

const NATIVE_PREFERRED = new Set([
  ...SIDE_HOTKEYS,
  'PageUp',
  'PageDown',
  'Pause',
  'Apps',
  'PrintScreen',
  'Home',
  'End',
  'Insert'
])

const VK: Record<string, number> = {
  LCtrl: 0xa2,
  RCtrl: 0xa3,
  LShift: 0xa0,
  RShift: 0xa1,
  LAlt: 0xa4,
  RAlt: 0xa5,
  LWin: 0x5b,
  RWin: 0x5c,
  PageUp: 0x21,
  PageDown: 0x22,
  Home: 0x24,
  End: 0x23,
  Insert: 0x2d,
  Pause: 0x13,
  Apps: 0x5d,
  PrintScreen: 0x2c,
  Up: 0x26,
  Down: 0x28,
  Left: 0x25,
  Right: 0x27,
  Space: 0x20,
  Tab: 0x09,
  Enter: 0x0d,
  Escape: 0x1b,
  Backspace: 0x08,
  Delete: 0x2e,
  Capslock: 0x14,
  Numlock: 0x90,
  Scrolllock: 0x91,
  VolumeMute: 0xad,
  VolumeDown: 0xae,
  VolumeUp: 0xaf,
  MediaNextTrack: 0xb0,
  MediaPreviousTrack: 0xb1,
  MediaStop: 0xb2,
  MediaPlayPause: 0xb3,
  num0: 0x60,
  num1: 0x61,
  num2: 0x62,
  num3: 0x63,
  num4: 0x64,
  num5: 0x65,
  num6: 0x66,
  num7: 0x67,
  num8: 0x68,
  num9: 0x69,
  nummult: 0x6a,
  numadd: 0x6b,
  numsub: 0x6d,
  numdec: 0x6e,
  numdiv: 0x6f
}

function virtualKey(key: string): number | null {
  if (VK[key] != null) {
    return VK[key]
  }
  if (/^[A-Z]$/.test(key)) {
    return key.charCodeAt(0)
  }
  if (/^[0-9]$/.test(key)) {
    return key.charCodeAt(0)
  }
  const fn = /^F(\d+)$/.exec(key)
  if (fn) {
    const n = Number(fn[1])
    if (n >= 1 && n <= 24) {
      return 0x70 + n - 1
    }
  }
  return null
}

export function prefersNativeHotkey(accelerator: string): boolean {
  return NATIVE_PREFERRED.has(accelerator.split('+').at(-1) ?? '')
}

export function nativeHotkeySpec(accelerator: string): { mods: number; vk: number } | null {
  const parts = accelerator.split('+')
  const key = parts.at(-1) ?? ''
  const vk = virtualKey(key)
  if (vk == null) {
    return null
  }
  let mods = 0
  for (const part of parts.slice(0, -1)) {
    if (part === 'Control') mods |= MOD_CONTROL
    else if (part === 'Alt') mods |= MOD_ALT
    else if (part === 'Shift') mods |= MOD_SHIFT
    else if (part === 'Super') mods |= MOD_WIN
    else return null
  }
  return { mods, vk }
}
