const COMMANDS_CATALOG = [
  // System & DevOps
  { cmd: '/system [tab]', alias: '/sys', cat: 'system', desc: 'Open the 7-category System Management Control Center (WinGet & Windows Update, Cron & Jobs, Dev Runtimes, PATH Doctor & Env Vars, Services & Tasks, Ports/Hosts/DNS, Disk/SMART/Power, Defender/BitLocker/Event Logs)' },
  { cmd: '/jobs [query]', alias: '/sched, /schedule', cat: 'scheduler', desc: 'Manage, trigger, and inspect in-app scheduled scripts, 5-field cron jobs, fixed intervals, and system event triggers (startup, unlock, resume, network-change)' },
  { cmd: '/cron <expression>', alias: '', cat: 'scheduler', desc: 'Explain 5-part cron expressions in plain English and compute upcoming execution timestamps in local time' },
  { cmd: '/repo', alias: 'F9', cat: 'scheduler', desc: 'Open active Git repository status, branch switcher, live Chokidar file watchers, and recent repository selector panel' },
  { cmd: '/git [query]', alias: '', cat: 'scheduler', desc: 'Searchable reference of high-frequency Git commands and recovery recipes (undo, squash, prune, stash, rebase)' },
  { cmd: '/pkg [query]', alias: '/winget', cat: 'system', desc: 'Inspect developer runtimes (Node, Python, Git, Go, Rust, .NET, Docker) and run quick WinGet package actions' },
  { cmd: '/svc [query]', alias: '', cat: 'system', desc: 'Browse, filter (running/stopped), start, stop, and restart Windows Services with automatic UAC elevation' },
  { cmd: '/proc [query]', alias: '/ps', cat: 'system', desc: 'Inspect running processes by RAM/CPU and terminate hung tasks (Ctrl+Enter elevated)' },
  { cmd: '/port [port]', alias: '', cat: 'system', desc: 'Inspect active listening TCP ports and running processes; Enter kills the blocking process or copies PID' },
  { cmd: '/wsl [distro]', alias: '', cat: 'system', desc: 'Launch WSL Linux distributions in SudoLaunch Terminal or open their root filesystem in File Explorer' },
  { cmd: '/textual [app|path]', alias: '/tui', cat: 'devtools', desc: 'Launch Python Textual TUI apps in the embedded terminal (Enter), a temporary SudoLaunch TUI popout window (Ctrl+Enter), or external Windows Terminal / --dev hot-reload (Tab)' },
  { cmd: '/ssh [host]', alias: '', cat: 'system', desc: 'Connect to SSH hosts from ~/.ssh/config or saved connections in sshHosts.json' },
  { cmd: '/docker [query]', alias: '', cat: 'system', desc: 'Manage Docker containers, inspect status/ports, stream logs, and prune images' },
  { cmd: '/env [query]', alias: '', cat: 'system', desc: 'Search environment variables, inspect User/Machine PATH directories, and parse .env files' },
  { cmd: '/expmod [query]', alias: '', cat: 'system', desc: 'Explore installed PowerShell & Python modules, exported cmdlets/functions, and inline help' },
  { cmd: '/ip [filter]', alias: '', cat: 'system', desc: 'Inspect local network interfaces, primary IPv4, IPv6, adapter types, and MAC addresses' },
  { cmd: '/dns <domain>', alias: '/dig', cat: 'system', desc: 'Lookup DNS records (A, AAAA, MX, TXT, CNAME, NS) and propagation' },
  { cmd: '/cert <host>', alias: '/ssl', cat: 'system', desc: 'Inspect SSL/TLS certificates, expiry dates, SANs, and cipher suites for any HTTPS host' },

  // Productivity & Search
  { cmd: '/search <query>', alias: 'Unprefixed', cat: 'search', desc: 'Universal multi-source search across contacts, snippets, apps, windows, custom commands, and GIFs' },
  { cmd: '/app <query>', alias: '', cat: 'search', desc: 'Fuzzy-search Start Menu shortcuts and installed Windows applications, launch (cached in-memory)' },
  { cmd: '/shortcuts [tab]', alias: '/sc, /hotkeys', cat: 'search', desc: 'Open the floating Customizable Shortcuts Overlay for Favorites, PowerToys, Docker, Windows, Dev & Git, and Custom tabs' },
  { cmd: '/pt [query]', alias: '/powertoys', cat: 'search', desc: 'Launch Microsoft PowerToys utilities & tools (Hosts, FancyZones, OCR, Ruler, ColorPicker, Awake, etc.)' },
  { cmd: '/focus <query>', alias: '', cat: 'search', desc: 'Fuzzy-search open desktop windows by title, restore and bring to front' },
  { cmd: '/timer [minutes]', alias: '', cat: 'search', desc: 'Open the Focus & Pomodoro countdown timer panel with 5m/10m/15m/30m/45m/60m presets and session tracking' },
  { cmd: '/teams <query>', alias: '/t', cat: 'search', desc: 'Fuzzy-search contacts and team/channel deep links, open a Teams chat or navigate to a channel' },
  { cmd: '/mail <query>', alias: '', cat: 'search', desc: 'Fuzzy-search contacts and compose an email in your default mail client' },
  { cmd: '/snippet <query>', alias: '/s', cat: 'search', desc: 'Fuzzy-search reusable text snippets and copy directly to clipboard' },
  { cmd: '/fav <query>', alias: '/f', cat: 'search', desc: 'Fuzzy-search saved links and bookmarks, open URL in default browser' },
  { cmd: '/g <query>', alias: '/google', cat: 'search', desc: 'Open a Google search in your default web browser (with clipboard fallback)' },
  { cmd: '/gif <query>', alias: '', cat: 'search', desc: 'Fuzzy-search and copy animated GIFs from your GIF folder to clipboard' },
  { cmd: '/lookup <table> <query>', alias: '', cat: 'search', desc: 'Fuzzy-search any JSON table in ~/.sudolaunch/lookup; drill into fields and copy values' },
  { cmd: '/clip [query]', alias: '', cat: 'search', desc: 'Browse recent clipboard history, format copied JSON, or transform clipboard text' },
  { cmd: '/<custom> <args>', alias: '', cat: 'search', desc: 'Run a user-defined custom PowerShell command or browse a folder of .ps1 / .py scripts' },

  // Developer Utilities
  { cmd: '/calc <expression>', alias: '', cat: 'devtools', desc: 'Evaluate math expressions inline; Enter copies the result to clipboard' },
  { cmd: '/unit <expr>', alias: '', cat: 'devtools', desc: 'Unit converter for data storage (GB/MB), bandwidth (Mbps), physical units, and number bases (hex/bin/dec/oct)' },
  { cmd: '/tz [query]', alias: '', cat: 'devtools', desc: 'Universal timezone & timestamp converter (Unix epoch, ISO 8601, relative time, "X to Y" zones)' },
  { cmd: '/json [json]', alias: '', cat: 'devtools', desc: 'Prettify (2/4 spaces), minify, validate, or stringify JSON with clipboard fallback and error diagnostics' },
  { cmd: '/diff', alias: '', cat: 'devtools', desc: 'Compare text and JSON snippets, clipboard vs input, and inspect line/key differences' },
  { cmd: '/hash <text>', alias: '', cat: 'devtools', desc: 'Instant cryptographic hashing (SHA-256, SHA-512, MD5, SHA-1), Base64/URL/Hex encoding, and JWT inspection' },
  { cmd: '/pwd [length|type]', alias: '', cat: 'devtools', desc: 'Generate cryptographically secure passwords, Diceware passphrases, PINs, and 256-bit API secrets' },
  { cmd: '/uuid [id]', alias: '', cat: 'devtools', desc: 'Generate UUIDs/GUIDs (standard, uppercase, no-hyphens, C# GUID, Base64, UUIDv7) or inspect existing IDs' },
  { cmd: '/regex [pattern]', alias: '', cat: 'devtools', desc: 'Searchable catalog of standard regex patterns (email, URL, IPv4, SemVer, UUID) + live regex tester' },
  { cmd: '/curl <cmd|url>', alias: '', cat: 'devtools', desc: 'Convert cURL commands to code (fetch, Python, Go) or probe HTTP endpoints' },
  { cmd: '/url <url>', alias: '', cat: 'devtools', desc: 'Parse URL components, extract individual query params, and generate cURL / fetch / PowerShell snippets' },
  { cmd: '/http [code|name]', alias: '', cat: 'devtools', desc: 'Search HTTP status codes (1xx-5xx) and standard HTTP header references with one-click copy' },
  { cmd: '/color <color>', alias: '', cat: 'devtools', desc: 'Convert between color models (HEX, RGB, RGBA, HSL, HSLA, CSS variable)' },
  { cmd: '/case [text]', alias: '', cat: 'devtools', desc: 'Convert text case (camelCase, kebab-case, snake_case, CONSTANT_CASE, PascalCase, Title Case, path/case)' },
  { cmd: '/text [text]', alias: '', cat: 'devtools', desc: 'Inspect text metrics (word, char, line count, read time) and transform lines (sort, unique, strip empty)' },
  { cmd: '/chmod [mode]', alias: '', cat: 'devtools', desc: 'Calculate and convert Unix/Linux file permissions (755, 644, rwxr-xr-x) with owner/group breakdowns' },
  { cmd: '/mime <query>', alias: '', cat: 'devtools', desc: 'Two-way lookup between file extensions and standard MIME content types' },
  { cmd: '/qr [url|text]', alias: '', cat: 'devtools', desc: 'Generate QR codes from URLs or text with clipboard copy for SVG Data URI, SVG XML, or ASCII art' },
  { cmd: '/lorem [count|type]', alias: '', cat: 'devtools', desc: 'Generate placeholder text and mock developer data (names, safe @example.com emails, phones, companies)' },
  { cmd: '/emoji <query>', alias: '', cat: 'devtools', desc: 'Fast fuzzy search across 250+ Unicode emojis by keyword, category, or shortcode (:rocket:, :fire:)' },
  { cmd: '/key [query]', alias: '/kbd', cat: 'devtools', desc: 'Inspect keyboard events, key codes, Windows Virtual-Key (VK_*) codes, and Electron accelerators' },

  // Dock, Terminal & App Control
  { cmd: '/term [command]', alias: 'Ctrl+Alt+T', cat: 'dock', desc: 'Expand/collapse the persistent PowerShell terminal, or execute a shell command directly' },
  { cmd: '/control [#|ip]', alias: '', cat: 'dock', desc: 'Toggle mTLS-authenticated keyboard/mouse input sharing with another peer workstation on your LAN' },
  { cmd: '/release', alias: 'ScrollLock', cat: 'dock', desc: 'Release active input sharing connection and restore local mouse/keyboard control' },
  { cmd: '/settings [section]', alias: '/config', cat: 'dock', desc: 'Open interactive configuration manager (layout, edit, contacts, snippets, links, peers, sshHosts)' },
  { cmd: '/profile [action]', alias: '', cat: 'dock', desc: 'Open Profile Switcher, Backup & Maintenance panel, or run backup, restore, clean-history, validate' },
  { cmd: '/notifications', alias: '/notify', cat: 'dock', desc: 'Open the Acrylic Notification Center and execution history alerts' },
  { cmd: '/history [query|clear]', alias: '', cat: 'dock', desc: 'Browse, search, re-run, or clear recent command execution history' },
  { cmd: '/view [reset]', alias: '/show, /hide', cat: 'dock', desc: 'Toggle persistent command dock on/off, or reset all dock modules back to their home anchor' },
  { cmd: '/default', alias: '', cat: 'dock', desc: 'Set or clear default command prioritized at top of suggestions list' },
  { cmd: '/restart', alias: '', cat: 'dock', desc: 'Relaunch the SudoLaunch application' },
  { cmd: '/exit', alias: '/quit', cat: 'dock', desc: 'Exit and close the application' }
];

document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('cmd-search');
  const tableBody = document.getElementById('cmd-table-body');
  const countBadge = document.getElementById('cmd-count');
  const chips = document.querySelectorAll('.chip[data-cat]');
  let activeCategory = 'all';

  function renderCommands() {
    if (!tableBody) return;
    const query = (searchInput?.value || '').trim().toLowerCase();

    const filtered = COMMANDS_CATALOG.filter((item) => {
      const matchesCat = activeCategory === 'all' || item.cat === activeCategory;
      if (!matchesCat) return false;
      if (!query) return true;
      return (
        item.cmd.toLowerCase().includes(query) ||
        item.alias.toLowerCase().includes(query) ||
        item.desc.toLowerCase().includes(query)
      );
    });

    if (countBadge) {
      countBadge.textContent = `${filtered.length} command${filtered.length === 1 ? '' : 's'}`;
    }

    tableBody.innerHTML = filtered
      .map(
        (item) => `
      <tr>
        <td style="white-space: nowrap;"><code>${escapeHtml(item.cmd)}</code></td>
        <td style="white-space: nowrap;">${item.alias ? `<code>${escapeHtml(item.alias)}</code>` : '<span style="color:#475569">—</span>'}</td>
        <td>${escapeHtml(item.desc)}</td>
      </tr>
    `
      )
      .join('');
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  if (searchInput) {
    searchInput.addEventListener('input', renderCommands);
  }

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      chips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      activeCategory = chip.getAttribute('data-cat') || 'all';
      renderCommands();
    });
  });

  // Press '/' to focus the command explorer search input
  window.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== searchInput && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
      e.preventDefault();
      searchInput?.focus();
      searchInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  renderCommands();

  // Copy buttons for code blocks
  document.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const codeEl = btn.closest('.code-block')?.querySelector('pre code');
      if (!codeEl) return;
      try {
        await navigator.clipboard.writeText(codeEl.textContent || '');
        const original = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => {
          btn.textContent = original;
        }, 1600);
      } catch {
        // Ignore clipboard errors
      }
    });
  });

  // Scroll-spy for sidebar navigation
  const sections = document.querySelectorAll('.doc-section[id]');
  const navLinks = document.querySelectorAll('.nav-link');

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.getAttribute('id');
          navLinks.forEach((link) => {
            link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
          });
        }
      });
    },
    { rootMargin: '-15% 0px -75% 0px' }
  );

  sections.forEach((sec) => observer.observe(sec));
});

