# SudoLaunch

A global-hotkey command palette, persistent command bar, and drop-down terminal for Windows. Press `Ctrl+Space` (configurable) to summon a centered, searchable palette covering Teams chats and channels, email, snippets, links, app launching, script browsing, window switching, custom PowerShell commands, animated GIFs, JSON table lookups, and an extensive suite of instant developer utilities (timezones, hashing, regex, Git recipes, HTTP codes, QR codes, unit/color converters, and text manipulation). Always dark themed, independent of the Windows system theme setting.

## Contents

- [Commands](#commands)
- [Execution Modes & Elevation (`Ctrl+Enter`)](#execution-modes--elevation-ctrlenter)
- [Modular Dock, Layouts & Notifications](#modular-dock-layouts--notifications)
- [Focus & Pomodoro Timer Popout](#focus--pomodoro-timer-popout)
- [Command Layout & Subfolders](#command-layout--subfolders)
- [Input Sharing (`/control`)](#input-sharing-control)
- [Command bar](#command-bar)
- [Terminal](#terminal)
- [Lookup tables](#lookup-tables)
- [In-App Configuration (`/settings`)](#in-app-configuration-settings)
- [Configuration Files](#configuration-files)
- [Custom commands](#custom-commands)
- [Script Safety & Security Advisory](#script-safety--security-advisory)
- [Requirements](#requirements)
- [Setup](#setup)
- [Development](#development)
- [Typecheck](#typecheck)
- [Build & Packaging](#build--packaging)
- [Auto-start](#auto-start)
- [Profile Backup & Maintenance](#profile-backup--maintenance)

## Commands

| Command | Behavior |
|---|---|
| `/search <query>` | Universal multi-source search across contacts, snippets, apps, windows, custom commands, and GIFs (excludes internal Teams links) |
| `/app <query>` | Fuzzy-search Start Menu shortcuts and installed applications, launch (cached in-memory with a 10-minute TTL for fast typing) |
| `/teams <query>` | Fuzzy-search contacts and team/channel deep links, open a Teams chat or navigate to a channel |
| `/mail <query>` | Fuzzy-search contacts, compose an email in your default mail client |
| `/snippet <query>` | Fuzzy-search snippets, copy text directly to clipboard |
| `/fav <query>` | Fuzzy-search saved links, open URL in default browser |
| `/g <query>` | Open a Google search in your default web browser (alias: `/google`, clipboard fallback) |
| `/timer [minutes]` | Open the Focus & Pomodoro countdown timer panel with 5m/10m/15m/30m/45m/60m presets, arrow-key selector navigation, and session tracking (alias: `/focus`) |
| `/focus <query>` | Fuzzy-search open desktop windows by title, restore and bring to front |
| `/calc <expression>` | Evaluate a math expression inline; Enter copies the result to clipboard |
| `/<custom name> <args>` | Run a user-defined custom PowerShell command, or browse a folder of scripts (see [Custom commands](#custom-commands)) |
| `/gif <query>` | Fuzzy-search and copy animated GIFs from your GIF folder to clipboard |
| `/lookup <table> <query>` | Fuzzy-search a JSON table from your lookup folder; select a record to drill into its fields, then select a field to copy its value to clipboard |
| `/tz [query]` | Universal timezone & timestamp converter (e.g. `/tz time australia`, Unix epoch, ISO 8601, relative time, time-with-zone, "X to Y"); Enter copies result |
| `/case [text]` | Convert text case (camelCase, kebab-case, snake_case, CONSTANT_CASE, PascalCase, Title Case, dot.case, path/case) with clipboard fallback |
| `/chmod [mode]` | Calculate and convert Unix/Linux file permissions (e.g. `755`, `644`, `rwxr-xr-x`) with owner/group breakdowns |
| `/color <color>` | Convert between color models (HEX, RGB, RGBA, HSL, HSLA, CSS variable) with visual color values |
| `/cron <expression>` | Explain 5-part cron expressions in plain English and compute upcoming execution timestamps in local time |
| `/emoji <query>` | Fast fuzzy search across 250+ Unicode emojis by keyword, category, or shortcode (`:rocket:`, `:fire:`, `:lock:`, `:bug:`) |
| `/git [query]` | Searchable reference of high-frequency Git commands and recovery recipes (undo, squash, prune, stash, rebase) |
| `/hash <text>` | Instant cryptographic hashing (SHA-256, SHA-512, MD5, SHA-1), Base64/URL/Hex encoding/decoding, and JWT inspection |
| `/http [code|name]` | Search HTTP status codes (1xx-5xx) and standard HTTP header references with one-click copy |
| `/ip [filter]` | Inspect local network interfaces, primary IPv4, IPv6, adapter types, and MAC addresses |
| `/json [json]` | Prettify (2/4 spaces), minify, validate, or stringify JSON with clipboard fallback and error diagnostics |
| `/lorem [count|type]` | Generate placeholder text (paragraphs, sentences) and mock data (names, emails, phones, addresses, companies) |
| `/mime <query>` | Two-way lookup between file extensions and standard MIME content types (e.g. `.webp`, `application/pdf`, `text/html`) |
| `/port [port]` | Inspect active listening TCP ports and running processes; Enter kills the blocking process or copies PID |
| `/profile [action]` | Manage, backup, restore, clean history, validate, or reset user profile and configuration |
| `/pt [query]` | Launch Microsoft PowerToys utilities & tools (Hosts, FancyZones, OCR, Ruler, ColorPicker, Awake, etc., alias: `/powertoys`) |
| `/pwd [length|type]` | Generate cryptographically secure passwords, Diceware passphrases, PINs, and 256-bit API secrets |
| `/qr [url|text]` | Generate QR codes from URLs or text with clipboard copy for SVG Data URI, SVG XML, or ASCII terminal art |
| `/regex [pattern]` | Searchable catalog of standard regex patterns (email, URL, IPv4, SemVer, UUID, date) + live regex tester |
| `/text [text]` | Inspect text metrics (word, char, line count, read time) and transform lines (sort, unique, strip empty, join comma) |
| `/unit <expr>` | Unit converter for data storage (GB/MB), bandwidth (Mbps), physical units, and number bases (dec/hex/bin/oct) |
| `/url <url>` | Parse URL components (host, path, port), extract individual query params, and generate cURL / fetch / PowerShell snippets |
| `/uuid [id]` | Generate UUIDs/GUIDs in multiple formats (standard, uppercase, no-hyphens, C# GUID, Base64, UUIDv7) or inspect existing IDs |
| `/settings` | Open interactive configuration manager (alias: `/config`). Supports typing subcommands like `/settings layout`, `/settings edit`, `/settings contacts` |
| `/control [#]` | Toggle active keyboard/mouse input sharing with another computer (e.g. `/control 2` or `/control 192.168.1.105`) |
| `/release` | Release input sharing connection and restore local control regardless of whether input is local or remote |
| `/term [command]` | Expand/collapse the persistent terminal, or execute a shell command directly (e.g. `/term git status`) |
| `/view` | Toggle persistent command bar on/off; `/view reset` returns all buttons to default dock |
| `/show` | Turn on and display the persistent command dock on screen |
| `/hide` | Hide the persistent command dock from the screen |
| `/move` | Interactively drag command bar, terminal, and notification icons to new positions |
| `/default` | Set or clear default command prioritized at top of suggestions list |
| `/restart` | Relaunch the application |
| `/exit` | Exit and close the application (alias: `/quit`) |

- **Execution Modes**: Press <kbd>Enter</kbd> to run in the visible embedded terminal session, or <kbd>Ctrl+Enter</kbd> to run with elevated Administrator privileges ("Sudo").
- **Unprefixed Search**: Typing text without a leading slash (e.g. `chrome`, `github`, `project`) automatically falls back to universal search (`/search`), or your chosen default command.
- **Shortcuts**: `/teams` (`/t`), `/fav` (`/f`), `/snippet` (`/s`), and `/settings` (`/config`) provide fast single/short aliases.
- **Recent History**: When opened with an empty input, the palette displays your most recent executed commands, re-runnable with Enter.
- **Empty Folder Helper**: If `~/.sudolaunch/gif` or `~/.sudolaunch/lookup` is empty, selecting `/gif` or `/lookup` displays an actionable prompt; pressing Enter opens the folder in Explorer.

## Execution Modes & Elevation (`Ctrl+Enter`)

SudoLaunch provides seamless execution controls right from the palette footer:

- **Visible Terminal Execution (<kbd>Enter</kbd>)**:
  - By default, custom PowerShell commands and scripts execute visibly inside SudoLaunch's persistent PowerShell terminal session (`runInTerminal`).
  - Command output streams in real-time with full ANSI color support, scrollback, and standard PowerShell interactivity.
- **Elevated Execution (<kbd>Ctrl+Enter</kbd> / "Sudo")**:
  - Pressing <kbd>Ctrl+Enter</kbd> on any command runs it with elevated Windows Administrator rights via Windows User Account Control (UAC).
  - Uses `Start-Process powershell.exe -Verb RunAs` with a safely Base64-encoded command payload (`-EncodedCommand`) to avoid escaping and injection issues.
  - An interactive Windows desktop and Notification Window alert informs you of elevated execution status.
- **Footer Hints**:
  - The palette footer dynamically displays `↵ Run in Terminal` alongside `Ctrl+↵ Run Elevated` for immediate keyboard feedback.

## Modular Dock, Layouts & Notifications

Alongside the hotkey popup, SudoLaunch features a sleek frosted-glass acrylic dock providing instant access to shell sessions, notifications, universal search, focus countdowns, and Git branch switching.

### 1. Three Dock Display Layout Modes

SudoLaunch supports 3 configurable dock presentation modes (switchable via `/settings` or `/view`):

- **Shelf Pill Tray Mode (`layout-shelf`)**:
  - Displays modular interactive controls in a floating glass pill tray (`[ >_ ] [ 🔔 ] [ / ] [ ⏱️ ] [ 🔀 ]`).
  - Features an ambient breathing glow bar along the top edge, collapsible idle state, and instant module popouts.
- **Circular / Radial Orbit Mode (`layout-circle`)**:
  - Arranges dock modules in a dynamic revolving planetary orbit around a central beacon.
  - **Center Countdown Beacon**: When a Focus Timer session is active or paused, the live countdown (`MM:SS`) is rendered directly inside the central circular hub. Clicking the time toggles **Pause / Resume** with zero mouse travel.
  - **Relaxed Spin Rate**: Refined, slower rotation rate (25% reduction) for a calm celestial aesthetic.
  - **Idle Auto-Spin Gate**: The orbit only begins revolving after the dock has sat idle at its home position for 15+ seconds, keeping icons steady during active work.
  - **Hover-Pause**: Hovering your cursor over the orbit dock or any satellite button freezes rotation in place via CSS `animation-play-state: paused` without resetting the angle. Moving away cleanly resumes spinning from the exact paused position.
- **Horizontal Line Mode (`layout-horizontal`)**:
  - Classic side-by-side dock icons with edge-aware docking and custom glow accents.

### 2. Dock Glow Colors & Ambient Lighting

All dock modes honor your chosen **Dock Glow Color** with a refined 20% reduced glow intensity and customizable animations:
- **Color Options**: Cyan (`#06b6d4`), Blue (`#5aa0ff`), Emerald (`#10b981`), Amber (`#f59e0b`), Pink (`#ec4899`), Violet (`#8b5cf6`), **Dark Purple (`#6b21a8`)**, and **Black (`#000000`)** (stealth obsidian halo).
- **Lighting Styles**: `breathing` (gentle ambient pulse), `steady` (constant illumination), and `stealth` (subdued minimalist accent).

### 3. Dock Home Position Anchoring

- **9-Point Screen Grid**: Anchor the resting home position to `top-left`, `top-center`, `top-right`, `center-left`, `center`, `center-right`, `bottom-left`, `bottom-center`, or `bottom-right`.
- **Custom Coordinates**: Specify custom screen percentage coordinates (X, Y) for precise multi-monitor placement.
- **Auto-Return Delay**: When summoned away via shortcut, the dock automatically returns to its designated home position after an idle timeout (`autoReturnDelaySec`).

### 4. Dock Visibility Controls

- `/show`: Instantly reveals and enables the persistent command dock on screen (`barEnabled: true`).
- `/hide`: Hides the persistent command dock cluster completely from the screen (`barEnabled: false`). When hidden, pressing <kbd>Ctrl+Space</kbd> opens the centered standalone palette where typing `/show` brings the dock back.
- `/view`: Toggles the dock on/off; `/view reset` returns all dock buttons back to their default home anchor.

### 5. Instant Dock Summon (<kbd>Ctrl+Right Click</kbd>)

- **Summon Directly to Cursor**: Press <kbd>Ctrl</kbd> + **Right Click** anywhere across Windows to summon the dock immediately beside your mouse pointer.
- **Context Menu Suppression**: Intercepts low-level right-clicks when <kbd>Ctrl</kbd> is held down, suppressing standard Windows desktop/context menus.
- **Multi-Monitor Safe Clamping**: Positions automatically clamp inside the active work area so all dock icons remain 100% visible on screen.

### 6. Acrylic Notification Center

- **Rich Acrylic Design**: Floating glassmorphic drawer anchored to your desktop with real-time status glow accents:
  - 🟢 **Emerald**: Successful command completions and clean executions.
  - 🔴 **Coral/Crimson**: Failed commands, errors, and non-zero exit codes.
  - 🔵 **Blue/Cyan**: Informational updates, profile syncs, and system notices.
- **Dual Monospace Accordion**: Each notification entry features an interactive header, command input snippet with one-click copy, and output stream container (`stdout`/`stderr`) with copy button.
- **Toolbar Actions**: Expand all, collapse all, dismiss individual items, or clear all notifications.
- **Unread Counter Badge**: Dock bell icon displays real-time unread badges (`1`, `2`, `9+`).

## Focus & Pomodoro Timer Popout

Stay in flow state without external browser tabs or distraction-heavy timer apps:

- **Quick-Launch Presets**: Rapidly start **5m**, **10m**, **15m**, **30m**, **45m**, or **60m** sessions (with 30m designated as primary).
- **Keyboard Navigation (<kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd> & <kbd>Enter</kbd>)**:
  - Full 2D highlighted selector outline (`.is-kbd-selected`) with illuminated accent glow ring and scale pop.
  - Left/Right arrows navigate preset buttons and controls; Up/Down arrows jump between preset controls and custom minute input.
  - Direct Hotkeys: <kbd>1</kbd>–<kbd>6</kbd> for presets, <kbd>Space</kbd> to pause/resume, <kbd>+</kbd> to add 5 minutes, <kbd>R</kbd> to reset, <kbd>/</kbd> for commands, and <kbd>Esc</kbd> to close.
- **Ergonomic Window Height (380px)**: Compacted window height eliminates dead space, comfortably hugging all timer controls, custom duration fields, and hotkey hints right above the dock.
- **Subdued Transparency**: High-contrast dark backdrop (`rgba(18, 18, 22, 0.94)` with `rgba(0, 0, 0, 0.35)` card) eliminates distracting text bleed-through from underlying desktop windows while retaining frosted-glass border aesthetics.
- **Session Tracker**: Tracks completed focus sessions throughout the day.
- **Circular Progress Ring**: High-contrast animated SVG ring tracking elapsed and remaining time.
- **Palette Command**: Launch from anywhere via `/timer [minutes]` or alias `/focus`.

## Command Layout & Subfolders

Organize, group, and reorder all commands within your palette via `~/.sudolaunch/command-layout.json` or the interactive `/settings layout` manager:

- **Subfolder Grouping**:
  - Create nested command categories (e.g. `📁 Developer/`, `📁 Utilities/`, `📁 Network/`).
  - Drill into folders with `/<FolderName>/` (e.g. `/Developer/`) to view and run only the commands contained within that folder.
  - Press <kbd>Backspace</kbd> or <kbd>Escape</kbd> to navigate back up to the root palette.
- **Global Search Across Folders**:
  - Typing a search query at the root palette automatically searches across **all folders**, allowing instant execution without navigating into subfolders first.
- **Interactive Reordering (`/settings layout`)**:
  - Open `/settings layout` to rearrange command and folder sequence using <kbd>Alt+Up</kbd> / <kbd>Alt+Down</kbd> shortcuts or visual up/down buttons.
  - Drag or move items into folders, create new folders, or remove folders.
- **Direct JSON Editing & Live Reload**:
  - Click **"Edit JSON in Editor"** to open `command-layout.json` in your favorite external editor (VS Code, Notepad).
  - Chokidar watches `command-layout.json` live—any changes saved externally take effect instantly in SudoLaunch.
- **Recursive Command Scanning**:
  - Custom command `.json` files placed inside subdirectories of `~/.sudolaunch/commands/` (e.g. `commands/dev/test.json`) are discovered automatically and mapped into corresponding palette folders.

## Input Sharing (`/control`)

Toggle active keyboard and mouse control between multiple SudoLaunch instances across your local network via direct TCP/IP:

- **Usage**:
  - `/control`: Displays configured peer computers and their status. Press Enter on any computer or toggle option.
  - `/control <#>`: Directly swaps input to the specified machine number (e.g. `/control 2`). Running `/control 2` again toggles input back to your local computer.
  - `/control <ip>`: Directly connects and shares input with a specified IP address or hostname (e.g. `/control 192.168.1.105` or `/control 192.168.1.105:41234`).
  - `/release` or `/control release` / `/control back` / `/control off` / `/control 0`: Releases any active input sharing session (both outgoing controller session and incoming receiver connection) and restores local control.
- **Safety Escape Toggles**:
  - While input is swapped to another computer, local mouse and keyboard events are captured and forwarded without interacting with local windows.
  - Pressing **`ScrollLock`**, **`Pause/Break`**, or **`Ctrl+Alt+S`** immediately releases the input hook and restores control to the host computer.
  - A sleek floating banner is displayed at the top of the screen: `[ ⇄ Input Swapped to #2 (Laptop) · Press ScrollLock to Return ]` with a clickable "Return Input" button.
- **Authentication**: Connections are mutually authenticated over TLS — each machine generates its own persistent identity certificate on first run (`~/.sudolaunch/control-identity.{key,crt}`), and a connection is only trusted if the peer's certificate fingerprint matches what's configured for it. There's no shared CA; every peer relationship is pinned explicitly, the same way you'd add an SSH host key.
  - Run `/control` with no arguments on a machine to see **"This machine's fingerprint"** at the top of the results — press Enter to copy it.
  - Paste that fingerprint into the **Expected Fingerprint** field of that machine's peer entry on the *other* computer (and vice versa — both directions need to trust each other).
  - A peer with no fingerprint configured, or a connection whose fingerprint doesn't match, is refused before any input is shared.
- **Configuration (`/settings -> Swap Peers`)**:
  - Configured in `~/.sudolaunch/peers.json` or through the interactive `/settings` UI:
    ```json
    [
      { "id": 1, "name": "Desktop PC", "host": "192.168.1.100", "port": 41234, "expectedFingerprint": "AB:12:...:CD" },
      { "id": 2, "name": "Laptop", "host": "192.168.1.105", "port": 41234, "expectedFingerprint": "EF:34:...:56" }
    ]
    ```

## Command bar

Alongside the hotkey popup, a frosted-glass icon dock sits on screen (`[ >_ ] [ / ] [ 🔔 ]` — bottom-center by default) and stays docked on screen — it's on by default and doesn't hide when you click away.

- **Three Integrated Actions**:
  - `>_` toggles the persistent drop-down PowerShell terminal.
  - `/` toggles the centered command palette.
  - `🔔` toggles the floating notification center with active unread counter badge.
- **Expand**: Click the `/` icon or press `Ctrl+Space` (when the bar is enabled) to open the palette. The window smoothly expands and hovers above the docked icon without obscuring the dock buttons or taskbar.
- **Collapse**: Executing a command or pressing Escape collapses the palette back to the docked icon.
- **Reposition (`/move`)**: Type `/move` to enter move mode where you can drag the dock buttons anywhere on screen (or move them individually via `/move-bar` and `/move-term`). Positions are saved in `settings.json` and restored across restarts.
- **Edge-Aware Docking**: When docked near the left or right edges of the screen, the dock buttons automatically switch to a vertical layout to prevent off-screen clipping.
- **Reset (`/view reset`)**: Returns the command bar, terminal, and notification buttons back to their default dock.
- **Toggle Visibility (`/view`)**: Toggles the persistent bar on/off entirely. When disabled, `Ctrl+Space` opens the centered standalone popup window instead.

## Terminal

A real, interactive PowerShell session (powered by `node-pty` + `xterm.js`) is integrated directly alongside the command bar:

- **Toggle UI**: Click the `>_` icon beside the bar button (or the `⌄` collapse button in the terminal header), or run `/term`.
- **Draggable Window**: Click and drag the move handle on the terminal header to freely position the open console anywhere on your desktop. The expanded position is remembered independently while the collapsed icon returns to its dock.
- **Direct Command Execution**: Run `/term <command>` from the palette (e.g. `/term npm run test`) to open PowerShell and execute the command immediately.
- **Global Hotkeys**:
  - **Configurable hotkey**: `Ctrl+Alt+T` by default, configurable in `/settings` (**Terminal hotkey**).
  - **Fast fixed hotkeys**: `Ctrl+Win+/` and `F1` (swallows F1 across apps to serve as an instant global terminal trigger).
- **Persistent Session**: The underlying PowerShell process is spawned lazily on first open and kept alive in the background with `-NoLogo` startup. Collapsing preserves running commands, shell state, and scrollback.

## Lookup tables

`/lookup` searches flat JSON "tables" dropped into your lookup folder (`lookup\` by default) — no per-table configuration needed:

- **Table format**: Each `.json` file in the lookup folder is an array of flat objects, e.g. `[{ "DisplayName": "ITSO", "Description": "...", "WebUrl": "..." }, ...]`. The filename (minus `.json`) becomes the table name.
- **Usage**: `/lookup` lists available tables; `/lookup <table>` browses/fuzzy-searches its records, using the first two string fields on each record as the label/sublabel (auto-detected — no config needed). Selecting a record drills into a list of its individual fields; selecting a field copies just that field's value to the clipboard. `Backspace`/`Escape` navigates back a level.
- Since which field is "the useful one" (a URL, an ID, ...) varies per table, `/lookup` lets you pick it at select-time rather than hardcoding one.

## In-App Configuration (`/settings`)

Type `/settings` (or `/config`) into the command palette to open the interactive configuration manager:

- **Command Layout (`/settings layout`)**: Visually reorder palette commands, organize commands into subfolders, and open layout JSON in external editors.
- **Contacts (`/settings contacts`)**: Add, edit, or delete contacts (`name`, `alias`, `email`, `teamsId`).
- **Snippets (`/settings snippets`)**: Add, edit, or delete reusable text snippets (`name`, `text`).
- **Links (`/settings links`)**: Add, edit, or delete browser bookmarks (`name`, `url`).
- **Edit Teams Links (`/settings team-links`)**: Manually add, edit, or delete direct deep links to Microsoft Teams channels and teams (`name`, `url`, `description`).
- **Settings (`/settings edit`)**: Configure global hotkeys, history tracking & limit, auto-start on login, mouse input toggle, default command, single-character shortcuts (`/t`, `/f`, `/s`), and the GIF/lookup folder paths.
- **Interactive Toggle Screens**:
  - **App Visibility**: Choose which Windows applications appear in `/app`.
  - **Search Commands**: Choose which commands participate in `/search` fan-out.
  - **Command Visibility**: Choose which commands appear in palette suggestions.
  - **Default Command**: Choose which command is prioritized at the top of the suggestions list.

Keyboard navigation in `/settings`: Arrow keys + Enter to navigate/select, `Delete` to remove entries, and `Escape` to go back a level or exit. Typing `/settings <subcommand>` (e.g. `/settings layout`, `/settings edit`) navigates straight to that section.

## Configuration Files

Configuration files are stored in `%USERPROFILE%\.sudolaunch\`. On first run, SudoLaunch seeds this directory with:

- `command-layout.json` — Custom root order and nested folder layout (`{ "rootOrder": [...], "folders": [...] }`)
- `contacts.json` — Contacts list for `/teams` and `/mail` (`[{ "name", "alias", "email", "teamsId" }]`)
- `snippets.json` — Snippets list for `/snippet` (`[{ "name", "text" }]`)
- `links.json` — Saved links for `/fav` (`[{ "name", "url" }]`)
- `teamLinks.json` — Direct channel/team deep links for `/teams` (`[{ "name", "url", "description" }]`)
- `settings.json` — App preferences (`hotkey`, `terminalHotkey`, `historyEnabled`, `historyLimit`, `autoStart`, `disableMouseInput`, `defaultCommand`, `disabledApps`, `teamsShortcut`, `favShortcut`, `snippetShortcut`, `searchExcludedCommands`, `hiddenCommands`, `gifFolder`, `lookupFolder`, `barEnabled`, `barPosition`, `termPosition`, `termWindowPosition`)
- `history.json` — App-managed execution history of recent commands
- `commands\` — Folder containing custom command `.json` files (supports subfolders for category-based organization)
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
  "ShowTerminal": true,
  "Parameters": [
    { "Name": "url", "Description": "Optional description shown in the palette" }
  ]
}
```

- `Command`: The command name typed after `/` (a leading `/` in the file is automatically stripped).
- `Action`: PowerShell command string; use `{paramName}` for parameter substitution.
- `ShowTerminal` *(optional, boolean)*: When set to `true`, automatically expands and brings up SudoLaunch's console window to display real-time output or interactive prompts (e.g. `Read-Host` or browser logins).
- `Parameters` *(optional)*: Defines named parameters for palette auto-completion.
- **Usage**: `/example url=https://example.com` or, for values with spaces, `/example url='https://example.com/some path'`. If a parameter is omitted, selecting it in suggestions fills `paramName=` into the palette for quick input.
- **Execution**: Dispatches to SudoLaunch's persistent PowerShell session. If `ShowTerminal` is not set, runs in the background and signals unread activity on the dock icon with a notification.

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

### 3. Script Safety & Security Advisory

PowerShell actions and script browser commands execute directly on your Windows desktop with the full permissions and security context of your user account. SudoLaunch does not sandbox PowerShell execution.

> [!CAUTION]
> **Dangers of Unverified & AI-Generated Scripts**:
> Running scripts sourced from public repositories, community forums, or generated by AI models without careful review can introduce severe risks and unintended side-effects on your environment:
> - **Accidental Data Loss**: Commands using recursive deletion flags (e.g. `Remove-Item -Recurse -Force`) can wipe entire folder hierarchies if target paths or parameters fail to resolve properly.
> - **Hallucinated or Malformed Cmdlets**: AI-generated code often produces plausible-looking cmdlets with incorrect, deprecated, or destructive switches that may alter system registries, environment variables, or terminate background processes.
> - **Parameter Injection**: Parameters supplied via the palette (e.g. `/mycmd param=value`) are interpolated directly into the PowerShell `Action` string before dispatch. Never paste untrusted or unescaped text into custom command parameters.
> - **Unintended System Modifications**: Scripts may modify PowerShell Execution Policies, system PATH variables, or Windows network adapter configurations.

#### Safe Scripting Guidelines
1. **Audit Every Line**: Always open and review the raw source code of `.ps1` and `.py` scripts before adding them to your `commands\` or script directories.
2. **Review AI Outputs**: Treat AI-generated scripts as unverified drafts. Never run AI-generated commands without thoroughly understanding every flag and parameter.
3. **Test in Isolation**: Execute new commands or maintenance scripts in an isolated terminal or test directory first.
4. **Use `-WhatIf` Testing**: When writing or testing commands that modify the filesystem or services, use PowerShell's built-in `-WhatIf` or `-Confirm` parameters.

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

### Build Commands

| Command | Action | Output Directory | Output Artifacts |
|---|---|---|---|
| `npm run build` | Compiles TypeScript and bundles main, preload, and renderer processes via `electron-vite` | `out/` | `out/main/index.js`<br>`out/preload/index.js`<br>`out/renderer/` (HTML, JS, CSS) |
| `npm run build:win` | Bundles the application (`npm run build`) and creates a Windows installer & standalone binaries via `electron-builder` | `dist/` | `dist/SudoLaunch-<version>-setup.exe`<br>`dist/win-unpacked/` |
| `npm run typecheck` | Runs TypeScript type checking across node (main/preload) and web (renderer) without emitting output | — | Terminal diagnostic output (0 errors expected) |
| `npm run postinstall` | Rebuilds native C++ modules (`node-window-manager`, `electron-clipboard-ex`, `node-pty`) for Electron ABI | `node_modules/` | Native `.node` binaries |
| `npm run profile:repair-env` | Diagnostic script that verifies environment tools, clears security locks, recompiles C# binaries, and rebuilds native addons | `resources/bin/` | `resources/bin/sendkey.exe`<br>`resources/bin/swaphook.exe` |

### Output Directories

| Directory | Purpose | Contents |
|---|---|---|
| **`out/`** | Bundled Electron runtime code produced by `npm run build` | • `out/main/index.js`: Main Electron process bundle<br>• `out/preload/index.js`: Preload script exposing secure IPC APIs<br>• `out/renderer/`: Compiled React application, styling, and web bundle |
| **`dist/`** | Distribution artifacts produced by `npm run build:win` | • `dist/SudoLaunch-<version>-setup.exe`: Self-contained NSIS per-user Windows installer<br>• `dist/win-unpacked/`: Standalone unpacked application folder containing `SudoLaunch.exe`, bundled Electron runtime, and unpacked dependencies<br>• `dist/builder-effective-config.yaml`: Resolved build and packaging manifest |
| **`resources/bin/`** | Native pre-compiled auxiliary Win32 executables packaged with the application | • `resources/bin/sendkey.exe`: Background keystroke injection & window focus activator<br>• `resources/bin/swaphook.exe`: High-performance Raw Input forwarder & low-level hook for `/control` input sharing |

### Native C# Helper Compilation

SudoLaunch includes high-performance native Win32 helpers for background keystroke simulation and low-level mouse/keyboard input forwarding:

```powershell
# Automated rebuild of all native tools via maintenance script:
npm run profile:repair-env

# Or manual compilation using the .NET Framework C# compiler (csc.exe):
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /target:winexe /out:resources\bin\sendkey.exe /optimize+ src\main\tools\sendkey.cs
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /target:exe /out:resources\bin\swaphook.exe /optimize+ src\main\tools\swaphook.cs
```

## Auto-start

When installed via the packaged installer, SudoLaunch registers to launch automatically on Windows login (controlled by `settings.json` → `autoStart` or in `//` Settings). Auto-start registration is skipped in `npm run dev` to prevent dev builds from registering.

## Profile Backup & Maintenance

SudoLaunch stores user settings, contacts, snippets, team links, history, custom commands, lookups, and assets in `~/.sudolaunch`. Profile operations can be performed directly within the running application using the `/profile` command palette command (e.g. `/profile reset`, `/profile backup`, `/profile restore`, `/profile clean-history`, `/profile validate`, `/profile open-profile`), or externally using the enterprise-grade maintenance and migration suite in `scripts/`:

### Quick Reference

| Command | Script | Description |
|---|---|---|
| `npm run profile:backup` | `backup-profile.ps1` | Backs up active profile to a timestamped ZIP archive in `~/.sudolaunch-archives` with embedded metadata manifest and retention cleanup. |
| `npm run profile:restore` | `restore-profile.ps1` | Restores profile from an archive ZIP. Automatically creates a pre-restore safety snapshot before applying changes. |
| `npm run profile:list` | `manage-profile.ps1 list` | Lists all stored backups and safety snapshots with timestamps and archive sizes. |
| `npm run profile:create` | `create-profile.ps1` | Scaffolds a complete default profile directory at any target path (`-TargetDir`, `-Clean`, `-Force`). |
| `npm run profile:validate` | `validate-profile.ps1` | Health check & JSON schema validator for settings, contacts, snippets, links, custom commands, and lookup tables (`-Fix`). |
| `npm run profile:clean-history` | `clean-history.ps1` | Purges or scrubs command history (`-ScrubSensitive` sanitizes passwords, hashes, JWTs, and API tokens; `-Days`, `-KeepLast`, `-ClearAll`). |
| `npm run profile:repair-env` | `repair-environment.ps1` | Diagnoses Node/npm/Python/csc toolchain, temporarily clears `NoDefaultCurrentDirectoryInExePath` for node-pty, recompiles `sendkey.exe`, and runs `electron-rebuild`. |
| `npm run profile:import-teams` | `import-team-links.ps1` | Imports enterprise Teams channels, contacts, or links from CSV/JSON (`resources/team_list.csv`), with auto-schema detection and non-destructive merge. |
| `npm run profile:export` | `export-profile.ps1` | Exports a sanitized portable `.zip` bundle (stripping window coordinates and private history) for migration or team sharing. |
| `npm run profile:import-bundle` | `import-profile.ps1` | Imports a portable profile bundle with non-destructive merge (or `-Replace`), pre-import safety backup, and post-import health validation. |
| `npm run profile:autostart` | `check-autostart.ps1` | Inspects Windows Startup Registry (`HKCU Run`) and settings alignment, verifies target binary path, and repairs (`-Enable`, `-Disable`, `-Repair`). |
| `npm run profile:bookmarks` | `import-bookmarks.ps1` | Imports Edge, Chrome, and Brave bookmarks into `links.json` (`/fav`) and/or `lookup/bookmarks.json` (`/lookup bookmarks`). |
| `npm run profile:git-scan` | `scan-git-repos.ps1` | Scans dev directories for Git repos, checks dirty status/branches, and generates `lookup/repos.json` (`/lookup repos`). |
| `npm run profile:new-cmd` | `new-command.ps1` | Interactive wizard to scaffold and validate custom PowerShell action or folder-browsing commands in `commands/*.json`. |
| `npm run profile:hotkeys` | `check-hotkey-conflicts.ps1` | Probes global hotkey availability, detects competing launchers (PowerToys, Flow), and flags Windows IME `Ctrl+Space` clashes. |
| `npm run profile:apps` | `reindex-apps.ps1` | Scans Start Menu & UWP apps, resolves `.lnk` targets, tests query fuzzy matches, and exports `lookup/apps.json`. |
| `npm run profile:clean-procs` | `clean-processes.ps1` | Detects and safely terminates lingering/orphaned `electron.exe`, `node-pty`, or dev server processes locking files or port 5173. |
| `npm run profile:shell-sync` | `sync-terminal-profile.ps1` | Integrates `sl`, `sl-edit`, `sl-profile` shortcuts, and environment helpers into Windows PowerShell and pwsh 7 `$PROFILE`. |
| `npm run profile:manage` | `manage-profile.ps1` | Unified interactive 21-option maintenance menu and CLI dispatcher covering all actions. |

---

### Detailed Usage & Examples

#### 1. Profile Backup & Restore
```powershell
# Create an archive with an optional note and retain the 5 newest archives
.\scripts\backup-profile.ps1 -Note "pre-update" -KeepLast 5

# Restore the most recent backup non-interactively
.\scripts\restore-profile.ps1 -Latest

# Restore a specific archive file
.\scripts\restore-profile.ps1 -BackupFile "C:\Users\username\.sudolaunch-archives\sudolaunch-backup-20260913-143000.zip"
```

#### 2. Profile Health Check & Validator (`validate-profile.ps1`)
Validates JSON syntax, schema completeness, custom command integrity, and lookup tables across your profile:
```powershell
# Run health check diagnostic
npm run profile:validate

# Run health check and automatically repair missing default keys/files
.\scripts\validate-profile.ps1 -Fix
```

#### 3. Execution History & Privacy Cleaner (`clean-history.ps1`)
Safeguards private tokens, passwords, and sensitive commands:
```powershell
# Scrub sensitive queries (/pwd, /hash, JWTs, bearer tokens) and retain the last 50 entries
npm run profile:clean-history

# Clean entries older than 30 days
.\scripts\clean-history.ps1 -Days 30

# Preview changes without modifying files (dry run)
.\scripts\clean-history.ps1 -Days 30 -DryRun

# Completely clear all command history
.\scripts\clean-history.ps1 -ClearAll
```

#### 4. Build Environment & Native Addons Repair (`repair-environment.ps1`)
Fixes Windows native addon compilation issues (`node-pty`, `node-window-manager`, `electron-clipboard-ex`), compiles `sendkey.exe`, and verifies TypeScript:
```powershell
npm run profile:repair-env
```

#### 5. Enterprise Teams Links & Contacts CSV Importer (`import-team-links.ps1`)
Import enterprise Teams channel links, contact directories, or bookmarks directly from CSV or JSON:
```powershell
# Import from default CSV (resources/team_list.csv) with non-destructive merge
npm run profile:import-teams

# Import custom CSV with overwrite/replace mode
.\scripts\import-team-links.ps1 -CsvPath "D:\Data\org_channels.csv" -Replace
```

#### 6. Browser Bookmarks & Favorites Importer (`import-bookmarks.ps1`)
Scans Microsoft Edge, Google Chrome, and Brave for bookmarks and imports them into SudoLaunch:
```powershell
# Import all browser bookmarks into both links.json (/fav) and lookup/bookmarks.json
npm run profile:bookmarks

# Only import from Microsoft Edge
.\scripts\import-bookmarks.ps1 -Browser Edge

# Filter bookmarks by folder name and test in dry-run mode
.\scripts\import-bookmarks.ps1 -FolderFilter "Work|Dev" -DryRun
```

#### 7. Git Workspace Scanner & Lookup Generator (`scan-git-repos.ps1`)
Scans developer drives (e.g. `D:\repo`, `C:\Users\<user>\repos`), analyzes branch status, and creates `~/.sudolaunch/lookup/repos.json`:
```powershell
# Scan default development drives and build /lookup repos table
npm run profile:git-scan

# Scan specific directories with maximum depth
.\scripts\scan-git-repos.ps1 -ScanRoots "D:\repo", "C:\Projects" -MaxDepth 3

# Also generate a /repo custom command in commands/repo.json
.\scripts\scan-git-repos.ps1 -SetupCommand
```

#### 8. Custom Command Wizard (`new-command.ps1`)
Quickly scaffolds, validates, and registers a custom command in `~/.sudolaunch/commands/<name>.json`:
```powershell
# Launch interactive creation wizard
npm run profile:new-cmd

# Non-interactive generation of a single-action command
.\scripts\new-command.ps1 -Name "flushdns" -Type Action -Action "Clear-DnsClientCache; Write-Host 'DNS Flushed!'" -Label "Flush DNS Cache"

# Non-interactive generation of a script folder browser (/ops)
.\scripts\new-command.ps1 -Name "ops" -Type Folder -Folder "ops-scripts" -Label "DevOps Automation"
```

#### 9. Global Hotkey Conflict Diagnostic (`check-hotkey-conflicts.ps1`)
Diagnoses why global hotkeys might fail to trigger:
```powershell
# Probe hotkey availability and check for competing launchers (PowerToys, Flow, IME)
npm run profile:hotkeys
```

#### 10. Application & Shortcut Indexer (`reindex-apps.ps1`)
Diagnoses Start Menu and UWP application discovery and tests search ranking:
```powershell
# Inspect all discovered shortcuts and modern apps
npm run profile:apps

# Simulate fuzzy search for a specific app
.\scripts\reindex-apps.ps1 -Query "terminal"

# Export application catalog to lookup/apps.json for /lookup apps
.\scripts\reindex-apps.ps1 -ExportLookup
```

#### 11. Process & Zombie Cleaner (`clean-processes.ps1`)
Detects and frees locked files or ports held by background Electron or terminal sessions:
```powershell
# Diagnostic check for orphaned processes and port 5173 status
npm run profile:clean-procs

# Terminate orphaned processes
.\scripts\clean-processes.ps1 -Kill -Force
```

#### 12. PowerShell `$PROFILE` & Terminal Integrator (`sync-terminal-profile.ps1`)
Injects convenient aliases (`sl`, `sl-edit`, `sl-profile`) into Windows PowerShell 5.1 and pwsh 7 profiles:
```powershell
# Check current profile status
npm run profile:shell-sync

# Install integration into profiles
.\scripts\sync-terminal-profile.ps1 -Install

# Remove integration from profiles
.\scripts\sync-terminal-profile.ps1 -Uninstall
```

#### 13. Portable Profile Migration (`export-profile.ps1` & `import-profile.ps1`)
Share custom commands, snippets, lookups, and links across developer machines without leaking window coordinates or private history:
```powershell
# Export sanitized portable bundle
npm run profile:export
# Or to a specific path:
.\scripts\export-profile.ps1 -OutFile "D:\Backups\team-bundle.zip"

# Import portable bundle (merges non-destructively by default)
.\scripts\import-profile.ps1 -BundlePath "D:\Backups\team-bundle.zip"

# Preview bundle import without changing files
.\scripts\import-profile.ps1 -BundlePath "D:\Backups\team-bundle.zip" -DryRun
```

#### 14. Windows Auto-Start Diagnostic & Repair (`check-autostart.ps1`)
Diagnose and repair Windows login startup registration:
```powershell
# Check current registration and detect binary
npm run profile:autostart

# Enable startup registration in HKCU\Software\Microsoft\Windows\CurrentVersion\Run
.\scripts\check-autostart.ps1 -Enable

# Disable startup registration
.\scripts\check-autostart.ps1 -Disable

# Repair broken executable path in registry
.\scripts\check-autostart.ps1 -Repair
```

#### 15. All-in-One Interactive Maintenance Menu
```powershell
npm run profile:manage
```
Displays an interactive numeric menu covering all 21 maintenance and developer operations.

