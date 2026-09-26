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
  PrintScreen: 'PrintScreen'
}

const SUPPORTED = new Set([
  ...'0123456789'.split(''),
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
  ...'F1 F2 F3 F4 F5 F6 F7 F8 F9 F10 F11 F12 F13 F14 F15 F16 F17 F18 F19 F20 F21 F22 F23 F24'.split(' '),
  ')', '!', '@', '#', '$', '%', '^', '&', '*', '(', ':', ';', '+', '=', '<', ',', '_', '-', '>', '.', '?', '/', '~', '`', '{', ']', '[', '|', '\\', '}', '"', "'",
  'Plus', 'Space', 'Tab', 'Capslock', 'Numlock', 'Scrolllock', 'Backspace', 'Delete', 'Insert', 'Return', 'Enter',
  'Up', 'Down', 'Left', 'Right', 'Home', 'End', 'PageUp', 'PageDown', 'Escape', 'Esc', 'PrintScreen',
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
  printscreen: 'PrintScreen'
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
  num9: 'Num 9'
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

export function acceleratorFromEvent(event: KeyInput): string | null {
  if (event.repeat || MODIFIERS.has(event.key)) {
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
