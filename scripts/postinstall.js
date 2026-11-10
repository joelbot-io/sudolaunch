const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const rootDir = path.resolve(__dirname, '..')
const prebuildDir = path.join(rootDir, 'resources', 'native-prebuilds', 'win32-x64')

const ptyTarget = path.join(rootDir, 'node_modules', 'node-pty', 'build', 'Release')
const wmTarget = path.join(rootDir, 'node_modules', 'node-window-manager', 'build', 'Release')
const iconTarget = path.join(rootDir, 'node_modules', 'extract-file-icon', 'build', 'Release')

let restored = false

function copyDirSafe(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) return
  fs.mkdirSync(targetDir, { recursive: true })
  for (const file of fs.readdirSync(sourceDir)) {
    const srcFile = path.join(sourceDir, file)
    const dstFile = path.join(targetDir, file)
    try {
      fs.copyFileSync(srcFile, dstFile)
    } catch (err) {
      // If a running SudoLaunch instance has the identical .node/.dll/.exe locked (EBUSY/EPERM),
      // keep the existing target file if it already exists and has the same byte size.
      if ((err.code === 'EBUSY' || err.code === 'EPERM') && fs.existsSync(dstFile)) {
        const srcStat = fs.statSync(srcFile)
        const dstStat = fs.statSync(dstFile)
        if (srcStat.size === dstStat.size) {
          continue
        }
      }
      throw err
    }
  }
}

// Check if prebuilt native binaries exist for Windows x64
if (process.platform === 'win32' && fs.existsSync(prebuildDir)) {
  try {
    const ptySource = path.join(prebuildDir, 'node-pty')
    const wmSource = path.join(prebuildDir, 'node-window-manager')
    const iconSource = path.join(prebuildDir, 'extract-file-icon')

    copyDirSafe(ptySource, ptyTarget)
    copyDirSafe(wmSource, wmTarget)
    copyDirSafe(iconSource, iconTarget)

    if (
      fs.existsSync(path.join(ptyTarget, 'pty.node')) &&
      fs.existsSync(path.join(wmTarget, 'addon.node')) &&
      fs.existsSync(path.join(iconTarget, 'addon.node'))
    ) {
      console.log(' [v] Successfully restored prebuilt native binaries for Windows x64.')
      restored = true
    }
  } catch (err) {
    console.warn(' [!] Note: Could not copy prebuilds, falling back to electron-rebuild:', err.message)
  }
}

// If prebuilds were not present, fallback to local compilation
if (!restored) {
  console.log(' [+] Rebuilding native modules for Electron...')
  try {
    const env = { ...process.env }
    delete env.NoDefaultCurrentDirectoryInExePath
    execSync('npx electron-rebuild -f -o node-window-manager,extract-file-icon,electron-clipboard-ex,node-pty', {
      stdio: 'inherit',
      cwd: rootDir,
      env
    })
  } catch (err) {
    console.error(' [X] electron-rebuild failed:', err.message)
    process.exit(1)
  }
}
