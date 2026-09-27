import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const electronVersion = require('electron/package.json').version
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const cmakeJs = [
  'npx cmake-js compile',
  `--directory "${join(root, 'src/native')}"`,
  `--out "${join(root, 'build')}"`,
  '--runtime electron',
  `--runtime-version ${electronVersion}`,
  '--arch x64'
].join(' ')

function vsDevCmdFromWhere() {
  const vswhere = 'C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe'
  if (!existsSync(vswhere)) {
    return null
  }
  try {
    const install = execSync(
      `"${vswhere}" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`,
      { encoding: 'utf8' }
    ).trim()
    const cmd = join(install, 'Common7', 'Tools', 'VsDevCmd.bat')
    return existsSync(cmd) ? cmd : null
  } catch {
    return null
  }
}

const vsDevCmd =
  [
    'C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\Common7\\Tools\\VsDevCmd.bat',
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\Enterprise\\Common7\\Tools\\VsDevCmd.bat',
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools\\Common7\\Tools\\VsDevCmd.bat',
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\Common7\\Tools\\VsDevCmd.bat',
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\Professional\\Common7\\Tools\\VsDevCmd.bat'
  ].find((p) => existsSync(p)) ?? vsDevCmdFromWhere()

const cmd = vsDevCmd ? `call "${vsDevCmd}" -arch=x64 && ${cmakeJs}` : cmakeJs

console.log(`Building native addon for Electron ${electronVersion}`)
execSync(cmd, { stdio: 'inherit', cwd: root, shell: true })
