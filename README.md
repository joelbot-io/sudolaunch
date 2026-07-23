# sudolaunch

A global-hotkey command palette for Windows. Press `Ctrl+Space` (configurable) to summon a centered, searchable popup for quick Teams chats/calls, email, snippets, links, app launching, and inline math. Always dark themed, independent of the Windows system theme setting.

## Commands

| Command | Behavior |
|---|---|
| `/teams <query>` | Fuzzy-search contacts, open a Teams chat |
| `/call <query>` | Fuzzy-search contacts, start a Teams call |
| `/email <query>` | Fuzzy-search contacts, compose an email |
| `/snippet <query>` | Fuzzy-search snippets, copy to clipboard |
| `/link <query>` | Fuzzy-search saved links, open in browser |
| `/app <query>` | Fuzzy-search Start Menu shortcuts, launch |
| `/calc <expression>` | Evaluate a math expression, Enter copies the result |

With an empty input, the palette shows your 25 most recent executed commands (configurable), re-runnable with Enter.

## Requirements

- Windows 10/11
- [Node.js](https://nodejs.org/) 20+ and npm

## Setup

```sh
npm install
```

## Run in development

```sh
npm run dev
```

This starts `electron-vite` in dev mode with hot reload for the renderer and automatic rebuild/restart for the main process. Press `Ctrl+Space` to open the palette.

## Typecheck

```sh
npm run typecheck
```

## Build

```sh
# Bundle main/preload/renderer only (out/)
npm run build

# Bundle + package a Windows installer (dist/)
npm run build:win
```

`npm run build:win` produces an NSIS installer at `dist/sudolaunch-<version>-setup.exe`.

## Configuration

On first run, the app creates `%USERPROFILE%\.sudolaunch\` and seeds it with:

- `contacts.json` — `[{ "name", "alias", "email", "teamsId" }]`
- `snippets.json` — `[{ "name", "text" }]`
- `links.json` — `[{ "name", "url" }]`
- `settings.json` — `{ "hotkey", "historyLimit", "autoStart" }`
- `history.json` — app-managed, most recent executed commands

Edits to these files are picked up live — no restart needed. Right-click the tray icon and choose **Open config folder** to jump straight there.

Alternatively, type `//` in the palette to manage contacts, snippets, links, and settings without leaving it: pick a type, then add/edit/delete entries (arrow keys + Enter, Delete to remove, Escape to go back a level). Saved changes apply live the same as hand-edits.

## Auto-start

When installed via the packaged build, the app registers itself to launch at Windows login (controlled by `settings.json` → `autoStart`). This registration is skipped in `npm run dev` to avoid registering a throwaway dev binary.
