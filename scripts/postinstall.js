const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const rootDir = path.resolve(__dirname, '..')
const prebuildDir = path.join(rootDir, 'resources', 'native-prebuilds', 'win32-x64')

const ptyTarget = path.join(rootDir, 'node_modules', 'node-pty', 'build', 'Release')
const wmTarget = path.join(rootDir, 'node_modules', 'node-window-manager', 'build', 'Release')

let restored = false

// Check if prebuilt native binaries exist for Windows x64
if (process.platform === 'win32' && fs.existsSync(prebuildDir)) {
  try {
    const ptySource = path.join(prebuildDir, 'node-pty')
    const wmSource = path.join(prebuildDir, 'node-window-manager')

    if (fs.existsSync(ptySource)) {
      fs.mkdirSync(ptyTarget, { recursive: true })
      for (const file of fs.readdirSync(ptySource)) {
        fs.copyFileSync(path.join(ptySource, file), path.join(ptyTarget, file))
      }
    }

    if (fs.existsSync(wmSource)) {
      fs.mkdirSync(wmTarget, { recursive: true })
      for (const file of fs.readdirSync(wmSource)) {
        fs.copyFileSync(path.join(wmSource, file), path.join(wmTarget, file))
      }
    }

    if (fs.existsSync(path.join(ptyTarget, 'pty.node')) && fs.existsSync(path.join(wmTarget, 'addon.node'))) {
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
    execSync('npx electron-rebuild -f -o node-window-manager,electron-clipboard-ex,node-pty', {
      stdio: 'inherit',
      cwd: rootDir
    })
  } catch (err) {
    console.error(' [X] electron-rebuild failed:', err.message)
    process.exit(1)
  }
}
