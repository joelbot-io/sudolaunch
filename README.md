# SudoLaunch

A global-hotkey command palette, persistent command bar, and drop-down terminal for Windows. Press `Ctrl+Space` (configurable) to summon a centered, searchable palette covering Teams chats and channels, email, snippets, links, app launching, script browsing, window switching, custom PowerShell commands, animated GIFs, JSON table lookups, and inline math. Always dark themed, independent of the Windows system theme setting.

## Contents

- [Commands](#commands)
- [Command bar](#command-bar)
- [Terminal](#terminal)
- [Lookup tables](#lookup-tables)
- [In-App Configuration (`//`)](#in-app-configuration-)
- [Configuration Files](#configuration-files)
- [Custom commands](#custom-commands)
- [Requirements](#requirements)
- [Setup](#setup)
- [Development](#development)
- [Typecheck](#typecheck)
- [Build & Packaging](#build--packaging)
- [Auto-start](#auto-start)

## Commands

| Command | Behavior |
|---|---|
| `/teams <query>` | Fuzzy-search contacts and team/channel deep links, open a Teams chat or navigate to a channel |
| `/mail <query>` | Fuzzy-search contacts, compose an email in your default mail client |
| `/snippet <query>` | Fuzzy-search snippets, copy text directly to clipboard |
| `/fav <query>` | Fuzzy-search saved links, open URL in default browser |
| `/app <query>` | Fuzzy-search Start Menu shortcuts and installed applications, launch (cached in-memory with a 10-minute TTL for fast typing) |
| `/focus <query>` | Fuzzy-search open desktop windows by title, restore and bring to front |
| `/calc <expression>` | Evaluate a math expression inline; Enter copies the result to clipboard |
| `/<custom name> <args>` | Run a user-defined custom PowerShell command, or browse a folder of scripts (see [Custom commands](#custom-commands)) |
| `/search <query>` | Universal multi-source search across contacts, links, snippets, apps, windows, custom commands, and GIFs |
| `/gif <query>` | Fuzzy-search and copy animated GIFs from your GIF folder to clipboard |
| `/lookup <table> <query>` | Fuzzy-search a JSON table from your lookup folder; select a record to drill into its fields, then select a field to copy its value to clipboard |
| `/view` | Toggle the persistent command bar on/off; `/view reset` returns it to its default bottom-center dock (see [Command bar](#command-bar)) |
| `/term` | Expand/collapse the persistent drop-down terminal (see [Terminal](#terminal)) |
| `/move` | Drag the command bar to a new position on screen (see [Command bar](#command-bar)) |
| `/default` | Set or clear the default command prioritized at the top of the suggestions list |
| `/restart` | Relaunch the application |

`/teams`, `/fav`, and `/snippet` can each have a single-character shortcut (e.g. `/t` for `/teams`, `/f` for `/fav`, `/s` for `/snippet`), configurable in Settings (`//`).

When opened with an empty input, the palette displays your most recent executed commands (configurable), re-runnable with Enter.

## Command bar

Alongside the hotkey popup, a second window sits as a small frosted-glass icon (bottom-center by default) and stays docked on screen — it's on by default and doesn't hide when you click away.

- **Expand**: Click the icon or press `Ctrl+Space` (when the bar is enabled) to expand it to the full palette size, ready to search and run any command.
- **Collapse**: Executing a command or pressing Escape (once to clear text, once more to release focus) collapses it back to the docked icon.
- **Reposition (`/move`)**: Type `/move` from the expanded bar to shrink it to a grab handle you can drag anywhere on screen. Click it or press Escape to drop it. The new position is saved in `settings.json` (`barPosition`) and restored across restarts.
- **Reset (`/view reset`)**: Returns the command bar back to its default bottom-center dock.
- **Toggle Visibility (`/view`)**: Toggles the persistent bar on/off entirely. When disabled, `Ctrl+Space` opens the centered standalone popup window instead.

## Terminal

A real, interactive PowerShell session (powered by `node-pty` + `xterm.js`) is integrated directly with the command bar:

- **Toggle UI**: Click the `>_` icon to the left of the collapsed bar (or the `⌄` button in the terminal panel header), or run `/term`.
- **Global Hotkeys**:
  - **Configurable hotkey**: `Ctrl+Alt+T` by default, configurable in Settings (`//` → Settings → **Terminal hotkey**).
  - **Fast fixed hotkeys**: `Ctrl+Win+/` and `F1` (swallows F1 across apps to serve as an instant global terminal trigger).
- **Persistent Session**: The underlying PowerShell process is spawned lazily on first open and kept alive in the background. Collapsing the panel preserves running commands, shell state, and terminal scrollback.
- **Bar Anchoring**: The terminal opens docked directly above the command bar's current location on screen.

## Lookup tables

`/lookup` searches flat JSON "tables" dropped into your lookup folder (`lookup\` by default) — no per-table configuration needed:

- **Table format**: Each `.json` file in the lookup folder is an array of flat objects, e.g. `[{ "DisplayName": "ITSO", "Description": "...", "WebUrl": "..." }, ...]`. The filename (minus `.json`) becomes the table name.
- **Usage**: `/lookup` lists available tables; `/lookup <table>` browses/fuzzy-searches its records, using the first two string fields on each record as the label/sublabel (auto-detected — no config needed). Selecting a record drills into a list of its individual fields; selecting a field copies just that field's value to the clipboard. `Backspace`/`Escape` navigates back a level.
- Since which field is "the useful one" (a URL, an ID, ...) varies per table, `/lookup` lets you pick it at select-time rather than hardcoding one.

## In-App Configuration (`//`)

Type `//` into the command palette to open the interactive configuration manager:

- **Contacts**: Add, edit, or delete contacts (`name`, `alias`, `email`, `teamsId`).
- **Snippets**: Add, edit, or delete reusable text snippets (`name`, `text`).
- **Links**: Add, edit, or delete browser bookmarks (`name`, `url`).
- **Teams Links**: Add, edit, or delete direct deep links to Teams channels and teams (`name`, `url`, `description`).
- **Settings**: Configure global hotkeys, history tracking & limit, auto-start on login, mouse input toggle, default command, single-character shortcuts (`/t`, `/f`, `/s`), and the GIF/lookup folder paths.
- **Interactive Toggle Screens**:
  - **App Visibility**: Choose which Windows applications appear in `/app`.
  - **Search Commands**: Choose which commands participate in `/search` fan-out.
  - **Command Visibility**: Choose which commands appear in palette suggestions.
  - **Default Command**: Choose which command is prioritized at the top of the suggestions list.

Keyboard navigation in `//`: Arrow keys + Enter to navigate/select, `Delete` to remove entries, and `Escape` to go back a level or exit.

## Configuration Files

Configuration files are stored in `%USERPROFILE%\.sudolaunch\`. On first run, SudoLaunch seeds this directory with:

- `contacts.json` — Contacts list for `/teams` and `/mail` (`[{ "name", "alias", "email", "teamsId" }]`)
- `snippets.json` — Snippets list for `/snippet` (`[{ "name", "text" }]`)
- `links.json` — Saved links for `/fav` (`[{ "name", "url" }]`)
- `teamLinks.json` — Direct channel/team deep links for `/teams` (`[{ "name", "url", "description" }]`)
- `settings.json` — App preferences (`hotkey`, `terminalHotkey`, `historyEnabled`, `historyLimit`, `autoStart`, `disableMouseInput`, `defaultCommand`, `disabledApps`, `teamsShortcut`, `favShortcut`, `snippetShortcut`, `searchExcludedCommands`, `hiddenCommands`, `gifFolder`, `lookupFolder`, `barEnabled`, `barPosition`)
- `history.json` — App-managed execution history of recent commands
- `commands\` — Folder containing custom command `.json` files (seeded with `example.json` and `maint.json`)
- `maintenance\` — Folder containing script examples (seeded with `example-update-modules.ps1`)
- `gif\` — Default folder for storing `.gif` files used by `/gif`
- `lookup\` — Default folder for JSON table files (each a flat array of objects) used by `/lookup`

All configuration and command files are watched live via Chokidar — edits made in external editors are applied immediately without restarting the application. Right-click the system tray icon and choose **Open config folder** to jump straight to `%USERPROFILE%\.sudolaunch\`.

## Custom commands

Custom commands allow you to bind any `/<name>` to an arbitrary PowerShell action with named parameters, or create interactive folder browsers for Python (`.py`) and PowerShell (`.ps1`) scripts.

There is no separate, hardcoded `/script` command — script browsing is unified into the custom command system, allowing you to define multiple distinct script libraries (e.g. `/maint`, `/scripts`, `/tools`) simply by adding JSON files.

Each custom command is defined as a `.json` file in `%USERPROFILE%\.sudolaunch\commands\`:

### 1. Action Command (Hidden PowerShell Execution)
```json
{
  "Command": "example",
  "Action": "Invoke-WebRequest 'https://www.google.com'",
  "Label": "Ping Google",
  "Parameters": [
    { "Name": "url", "Description": "Optional description shown in the palette" }
  ]
}
```

- `Command`: The command name typed after `/` (a leading `/` in the file is automatically stripped).
- `Action`: PowerShell command string; use `{paramName}` for parameter substitution.
- `Parameters` *(optional)*: Defines named parameters for palette auto-completion.
- **Usage**: `/example url=https://example.com` or, for values with spaces, `/example url='https://example.com/some path'`. If a parameter is omitted, selecting it in suggestions fills `paramName=` into the palette for quick input.
- **Execution**: Runs silently in the background via `powershell.exe -NoProfile -NonInteractive` and displays a Windows desktop notification on completion (or failure).

> [!WARNING]
> **Security Note**: Parameters are substituted directly into the PowerShell `Action` string before execution. Avoid pasting untrusted inputs into custom command parameters.

### 2. Folder Browser Command (Interactive Scripts)
```json
{
  "Command": "maint",
  "Folder": "maintenance",
  "Label": "Maintenance Scripts"
}
```

- `Folder`: Path to a script folder *relative to `%USERPROFILE%\.sudolaunch`* (e.g. `"maintenance"` resolves to `%USERPROFILE%\.sudolaunch\maintenance`). Access is sandboxed to remain within `%USERPROFILE%\.sudolaunch`.
- **Custom `/script` Command**: If you want a `/script` or `/scripts` command, simply create `%USERPROFILE%\.sudolaunch\commands\script.json` with `"Folder": "scripts"` and place your `.ps1` or `.py` files inside `%USERPROFILE%\.sudolaunch\scripts\`.
- **Usage**: Typing the command (e.g. `/maint` or `/script`) lists subfolders and `.py` / `.ps1` scripts. Fuzzy-search within the current folder, type a folder name followed by `/` to navigate into subdirectories, or select `.. (up one level)` to navigate back up.
- **Execution**: Selecting a script launches it in a new visible console window (`python` for `.py` files, `powershell -NoExit -File` for `.ps1` files) so you can view outputs or respond to interactive prompts. Both `python` and `powershell` must be on your system `PATH`.

## Requirements

- Windows 10/11
- [Node.js](https://nodejs.org/) 20+ and npm
- Visual Studio Build Tools with the "Desktop development with C++" workload, plus Python (required by `npm install`'s `postinstall` script to rebuild native modules: `node-window-manager`, `electron-clipboard-ex`, and `node-pty`).

## Setup

```sh
npm install
```

> [!TIP]
> If `node-pty` fails to rebuild with `'GetCommitHash.bat' is not recognized...`, your environment may have the `NoDefaultCurrentDirectoryInExePath` security environment variable set. Run electron-rebuild with that variable cleared for just that command:
> 
> ```powershell
> $env:NoDefaultCurrentDirectoryInExePath = $null; npx electron-rebuild -f -w node-pty
> ```

## Development

```sh
npm run dev
```

Starts `electron-vite` in development mode with HMR for the renderer and auto-rebuild for the main process.

## Typecheck

```sh
npm run typecheck
```

## Build & Packaging

```sh
# Bundle main, preload, and renderer processes (into out/)
npm run build

# Bundle and build the Windows NSIS installer (into dist/)
npm run build:win
```

Packaged installers will be generated at `dist/SudoLaunch-<version>-setup.exe`.

## Auto-start

When installed via the packaged installer, SudoLaunch registers to launch automatically on Windows login (controlled by `settings.json` → `autoStart` or in `//` Settings). Auto-start registration is skipped in `npm run dev` to prevent dev builds from registering.
