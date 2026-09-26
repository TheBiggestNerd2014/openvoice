# OpenVoice

Windows voice changer and soundboard that outputs through [VB-CABLE](https://vb-audio.com/Cable/). Other apps (Discord, games) should use **CABLE Output** as their microphone.

Pitch, Squeaky, Robot, and the soundboard are the stable features. Auto Chords is included and marked as a work in progress.

## Requirements

- Windows 10/11 x64
- Node.js 20+
- Visual Studio 2022 with the **Desktop development with C++** workload (for the native audio addon)
- [VB-CABLE](https://vb-audio.com/Cable/) (the app can launch the official installer)

## Develop

```bash
npm install
npm run native:build
npm run dev
```

## Installer

```bash
npm run dist
```

The NSIS installer is written to `dist/`.

## Updates

Installed builds use [electron-updater](https://www.electron.build/auto-update) and poll GitHub Releases while online. **Pre-releases are ignored** (`allowPrerelease: false`). Only published full releases are applied.

1. The GitHub repo is [thebiggestnerd2014/openvoice](https://github.com/thebiggestnerd2014/openvoice).
2. Publish a normal Release (not marked pre-release) that includes `OpenVoice-Setup-*.exe` and the generated `latest.yml`.
3. From a machine with a GitHub token: `GH_TOKEN=... npx electron-builder --win nsis --publish always`

The app checks on launch and every 4 hours. When a release is downloaded, it installs on quit, or immediately from **Restart and install**.

## VB-CABLE

Place the official, unmodified VB-CABLE setup executable in `resources/vbcable/` (for example `VBCABLE_Setup_x64.exe`). OpenVoice will offer to run it if **CABLE Input** is not found. Check VB-Audio’s redistribution terms before shipping that file.

## Soundboard clips

Drop wav/mp3/ogg files into `sounds/` when developing, or add them from the app. There are no built-in clips.
