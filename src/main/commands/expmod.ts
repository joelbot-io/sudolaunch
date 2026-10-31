import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync, statSync } from 'fs'
import { clipboard, shell } from 'electron'
import Fuse from 'fuse.js'
import type { SearchResultItem } from '../../shared/types'
import { runInTerminal } from '../terminalWindow'
import { runElevated } from '../elevation'

const execFileAsync = promisify(execFile)

export interface PsCmdletInfo {
  name: string
  module: string
  synopsis: string
  syntax: string
  example?: string
  aliases?: string[]
  commandType?: string
}

export interface PsModuleInfo {
  name: string
  version?: string
  description: string
  path?: string
  exportCount?: number
  builtin?: boolean
}

export interface PySymbolInfo {
  name: string
  module: string
  kind: 'function' | 'class' | 'constant'
  signature: string
  doc: string
  example?: string
  file?: string
}

export interface PyModuleInfo {
  name: string
  version?: string
  description: string
  category: 'stdlib' | 'installed'
  path?: string
}

// ============================================================================
// Built-in Curated Reference: PowerShell Modules & Cmdlets
// ============================================================================

const BUILTIN_PS_MODULES: PsModuleInfo[] = [
  {
    name: 'Microsoft.PowerShell.Management',
    description: 'Core system management cmdlets for filesystem, processes, services, and registry',
    builtin: true
  },
  {
    name: 'Microsoft.PowerShell.Utility',
    description: 'Data manipulation, JSON/CSV conversion, pipeline filtering, sorting, and REST/web requests',
    builtin: true
  },
  {
    name: 'Microsoft.PowerShell.Core',
    description: 'Engine cmdlets for modules, help, jobs, remoting sessions, and command discovery',
    builtin: true
  },
  {
    name: 'Microsoft.PowerShell.Security',
    description: 'Execution policies, ACL file permissions, credentials, and Authenticode signatures',
    builtin: true
  },
  {
    name: 'Microsoft.PowerShell.Archive',
    description: 'Create and extract ZIP archives with Compress-Archive and Expand-Archive',
    builtin: true
  },
  {
    name: 'NetTCPIP',
    description: 'TCP/IP networking stack inspection, IP addresses, ports, routes, and connection testing',
    builtin: true
  },
  {
    name: 'DnsClient',
    description: 'DNS name resolution, client cache management, and DNS server configuration',
    builtin: true
  },
  {
    name: 'PSReadLine',
    description: 'Command-line editing experience, history prediction, keybindings, and syntax coloring',
    builtin: true
  },
  {
    name: 'PowerShellGet',
    description: 'Discover, install, update, and publish PowerShell modules and scripts from PSGallery',
    builtin: true
  }
]

const BUILTIN_PS_CMDLETS: PsCmdletInfo[] = [
  // Microsoft.PowerShell.Management
  {
    name: 'Get-ChildItem',
    module: 'Microsoft.PowerShell.Management',
    synopsis: 'Gets the items and child items in one or more specified locations (files, folders, registry)',
    syntax: 'Get-ChildItem [-Path <string[]>] [-Filter <string>] [-Recurse] [-Force] [-File] [-Directory]',
    example: 'Get-ChildItem -Path . -Filter *.ts -Recurse -File',
    aliases: ['gci', 'ls', 'dir']
  },
  {
    name: 'Get-Content',
    module: 'Microsoft.PowerShell.Management',
    synopsis: 'Gets the content of the item at the specified location, such as text lines in a file',
    syntax: 'Get-Content [-Path] <string[]> [-Tail <int>] [-Wait] [-Raw] [-Encoding <Encoding>]',
    example: 'Get-Content -Path ./app.log -Tail 50 -Wait',
    aliases: ['gc', 'cat', 'type']
  },
  {
    name: 'Set-Content',
    module: 'Microsoft.PowerShell.Management',
    synopsis: 'Writes new content or replaces existing content in a file',
    syntax: 'Set-Content [-Path] <string[]> [-Value] <Object[]> [-NoNewline] [-Encoding <Encoding>]',
    example: 'Set-Content -Path ./config.txt -Value "enabled=true" -Encoding utf8',
    aliases: ['sc']
  },
  {
    name: 'Copy-Item',
    module: 'Microsoft.PowerShell.Management',
    synopsis: 'Copies an item from one location to another in a namespace',
    syntax: 'Copy-Item [-Path] <string[]> [-Destination] <string> [-Recurse] [-Force]',
    example: 'Copy-Item -Path ./src -Destination ./backup -Recurse -Force',
    aliases: ['cpi', 'cp', 'copy']
  },
  {
    name: 'Move-Item',
    module: 'Microsoft.PowerShell.Management',
    synopsis: 'Moves an item from one location to another',
    syntax: 'Move-Item [-Path] <string[]> [-Destination] <string> [-Force]',
    example: 'Move-Item -Path ./old.txt -Destination ./archive/old.txt -Force',
    aliases: ['mi', 'mv', 'move']
  },
  {
    name: 'Remove-Item',
    module: 'Microsoft.PowerShell.Management',
    synopsis: 'Deletes files, folders, registry keys, variables, and aliases',
    syntax: 'Remove-Item [-Path] <string[]> [-Recurse] [-Force] [-Confirm]',
    example: 'Remove-Item -Path ./dist -Recurse -Force',
    aliases: ['ri', 'rm', 'del', 'erase', 'rd']
  },
  {
    name: 'New-Item',
    module: 'Microsoft.PowerShell.Management',
    synopsis: 'Creates a new file, directory, symbolic link, or registry key',
    syntax: 'New-Item [-Path] <string[]> [-ItemType <string>] [-Value <Object>] [-Force]',
    example: 'New-Item -ItemType Directory -Path ./logs -Force',
    aliases: ['ni']
  },
  {
    name: 'Get-Process',
    module: 'Microsoft.PowerShell.Management',
    synopsis: 'Gets the processes that are running on the local computer',
    syntax: 'Get-Process [[-Name] <string[]>] [-Id <int[]>] [-FileVersionInfo]',
    example: 'Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 10',
    aliases: ['gps', 'ps']
  },
  {
    name: 'Stop-Process',
    module: 'Microsoft.PowerShell.Management',
    synopsis: 'Stops one or more running processes by name or PID',
    syntax: 'Stop-Process [-Id] <int[]> [-Name <string[]>] [-Force] [-PassThru]',
    example: 'Stop-Process -Name "node" -Force',
    aliases: ['spps', 'kill']
  },
  {
    name: 'Get-Service',
    module: 'Microsoft.PowerShell.Management',
    synopsis: 'Gets the Windows services on the computer, including running and stopped services',
    syntax: 'Get-Service [[-Name] <string[]>] [-DisplayName <string[]>]',
    example: 'Get-Service | Where-Object Status -eq "Running"',
    aliases: ['gsv']
  },
  {
    name: 'Restart-Service',
    module: 'Microsoft.PowerShell.Management',
    synopsis: 'Stops and then starts one or more Windows services',
    syntax: 'Restart-Service [-Name] <string[]> [-Force] [-PassThru]',
    example: 'Restart-Service -Name "Spooler" -Force'
  },
  {
    name: 'Test-Path',
    module: 'Microsoft.PowerShell.Management',
    synopsis: 'Determines whether all elements of a file or registry path exist',
    syntax: 'Test-Path [-Path] <string[]> [-PathType {Any | Container | Leaf}]',
    example: 'Test-Path -Path ./package.json -PathType Leaf'
  },
  {
    name: 'Set-Location',
    module: 'Microsoft.PowerShell.Management',
    synopsis: 'Sets the current working location to a specified location',
    syntax: 'Set-Location [[-Path] <string>] [-PassThru]',
    example: 'Set-Location -Path ~/Projects',
    aliases: ['sl', 'cd', 'chdir']
  },
  {
    name: 'Start-Process',
    module: 'Microsoft.PowerShell.Management',
    synopsis: 'Starts one or more processes on the local computer, optionally elevated with -Verb RunAs',
    syntax: 'Start-Process [-FilePath] <string> [[-ArgumentList] <string[]>] [-Verb <string>] [-Wait] [-NoNewWindow]',
    example: 'Start-Process pwsh -Verb RunAs',
    aliases: ['saps', 'start']
  },

  // Microsoft.PowerShell.Utility
  {
    name: 'Where-Object',
    module: 'Microsoft.PowerShell.Utility',
    synopsis: 'Selects objects from a collection based on their property values or a script block filter',
    syntax: 'Where-Object [-FilterScript] <scriptblock> | Where-Object [-Property] <string> -eq <Object>',
    example: 'Get-Process | Where-Object { $_.CPU -gt 10 }',
    aliases: ['where', '?']
  },
  {
    name: 'ForEach-Object',
    module: 'Microsoft.PowerShell.Utility',
    synopsis: 'Performs an operation against each item in a collection of input objects',
    syntax: 'ForEach-Object [-Process] <scriptblock[]> [-Parallel <scriptblock>] [-ThrottleLimit <int>]',
    example: '1..5 | ForEach-Object { "Item $_" }',
    aliases: ['foreach', '%']
  },
  {
    name: 'Select-Object',
    module: 'Microsoft.PowerShell.Utility',
    synopsis: 'Selects objects or object properties from pipeline input',
    syntax: 'Select-Object [[-Property] <Object[]>] [-First <int>] [-Last <int>] [-ExpandProperty <string>] [-Unique]',
    example: 'Get-Process | Select-Object Name, Id, CPU -First 10',
    aliases: ['select']
  },
  {
    name: 'Sort-Object',
    module: 'Microsoft.PowerShell.Utility',
    synopsis: 'Sorts objects by property values in ascending or descending order',
    syntax: 'Sort-Object [[-Property] <Object[]>] [-Descending] [-Unique]',
    example: 'Get-ChildItem -File | Sort-Object Length -Descending',
    aliases: ['sort']
  },
  {
    name: 'Select-String',
    module: 'Microsoft.PowerShell.Utility',
    synopsis: 'Finds text in strings and files using regular expressions or simple patterns (like grep)',
    syntax: 'Select-String [-Pattern] <string[]> [-Path <string[]>] [-SimpleMatch] [-CaseSensitive] [-Context <int[]>]',
    example: 'Select-String -Path "src/**/*.ts" -Pattern "TODO"',
    aliases: ['sls']
  },
  {
    name: 'Invoke-RestMethod',
    module: 'Microsoft.PowerShell.Utility',
    synopsis: 'Sends an HTTP or HTTPS request to a RESTful web service and automatically parses JSON/XML',
    syntax: 'Invoke-RestMethod [-Uri] <uri> [-Method {GET|POST|PUT|DELETE|PATCH}] [-Headers <IDictionary>] [-Body <Object>]',
    example: 'Invoke-RestMethod -Uri "https://api.github.com/zen" -Method GET',
    aliases: ['irm']
  },
  {
    name: 'Invoke-WebRequest',
    module: 'Microsoft.PowerShell.Utility',
    synopsis: 'Gets content from a web page on the internet and returns full HTTP response details',
    syntax: 'Invoke-WebRequest [-Uri] <uri> [-OutFile <string>] [-Method <string>] [-Headers <IDictionary>]',
    example: 'Invoke-WebRequest -Uri "https://example.com/file.zip" -OutFile ./file.zip',
    aliases: ['iwr', 'wget', 'curl']
  },
  {
    name: 'ConvertTo-Json',
    module: 'Microsoft.PowerShell.Utility',
    synopsis: 'Converts a .NET / PowerShell object into a JSON-formatted string',
    syntax: 'ConvertTo-Json [-InputObject] <Object> [-Depth <int>] [-Compress]',
    example: '@{ name = "test"; items = @(1, 2, 3) } | ConvertTo-Json -Depth 5'
  },
  {
    name: 'ConvertFrom-Json',
    module: 'Microsoft.PowerShell.Utility',
    synopsis: 'Converts a JSON-formatted string to a custom PSObject or Hashtable',
    syntax: 'ConvertFrom-Json [-InputObject] <string> [-AsHashtable]',
    example: 'Get-Content ./package.json -Raw | ConvertFrom-Json'
  },
  {
    name: 'Get-FileHash',
    module: 'Microsoft.PowerShell.Utility',
    synopsis: 'Computes the cryptographic hash value for a file (SHA256, SHA512, MD5)',
    syntax: 'Get-FileHash [-Path] <string[]> [-Algorithm {SHA1 | SHA256 | SHA384 | SHA512 | MD5}]',
    example: 'Get-FileHash -Path ./setup.exe -Algorithm SHA256'
  },
  {
    name: 'Get-Member',
    module: 'Microsoft.PowerShell.Utility',
    synopsis: 'Gets the properties and methods of objects in the pipeline',
    syntax: 'Get-Member [[-Name] <string[]>] [-MemberType <PSMemberTypes>]',
    example: 'Get-Process | Get-Member -MemberType Property',
    aliases: ['gm']
  },
  {
    name: 'Measure-Object',
    module: 'Microsoft.PowerShell.Utility',
    synopsis: 'Calculates numeric properties of objects, or counts characters, words, and lines',
    syntax: 'Measure-Object [[-Property] <string[]>] [-Sum] [-Average] [-Maximum] [-Minimum] [-Line] [-Word] [-Character]',
    example: 'Get-ChildItem -File | Measure-Object -Property Length -Sum -Average',
    aliases: ['measure']
  },

  // Microsoft.PowerShell.Core
  {
    name: 'Get-Command',
    module: 'Microsoft.PowerShell.Core',
    synopsis: 'Gets all commands installed on the computer, including cmdlets, aliases, functions, and applications',
    syntax: 'Get-Command [[-Name] <string[]>] [-Module <string[]>] [-CommandType <CommandTypes>] [-Verb <string[]>] [-Noun <string[]>]',
    example: 'Get-Command -Module Microsoft.PowerShell.Management',
    aliases: ['gcm']
  },
  {
    name: 'Get-Help',
    module: 'Microsoft.PowerShell.Core',
    synopsis: 'Displays information about PowerShell concepts and commands, including syntax and examples',
    syntax: 'Get-Help [[-Name] <string>] [-Examples] [-Detailed] [-Full] [-Online]',
    example: 'Get-Help Get-ChildItem -Examples',
    aliases: ['help', 'man']
  },
  {
    name: 'Get-Module',
    module: 'Microsoft.PowerShell.Core',
    synopsis: 'Lists modules that have been imported or that can be imported into a PowerShell session',
    syntax: 'Get-Module [[-Name] <string[]>] [-ListAvailable] [-All]',
    example: 'Get-Module -ListAvailable',
    aliases: ['gmo']
  },
  {
    name: 'Import-Module',
    module: 'Microsoft.PowerShell.Core',
    synopsis: 'Adds modules to the current PowerShell session',
    syntax: 'Import-Module [-Name] <string[]> [-Force] [-PassThru] [-Global]',
    example: 'Import-Module PSReadLine -Force',
    aliases: ['ipmo']
  },

  // Microsoft.PowerShell.Security
  {
    name: 'Get-ExecutionPolicy',
    module: 'Microsoft.PowerShell.Security',
    synopsis: 'Gets the execution policies for the current session or all scopes',
    syntax: 'Get-ExecutionPolicy [[-Scope] {Process | CurrentUser | LocalMachine | UserPolicy | MachinePolicy}] [-List]',
    example: 'Get-ExecutionPolicy -List'
  },
  {
    name: 'Set-ExecutionPolicy',
    module: 'Microsoft.PowerShell.Security',
    synopsis: 'Changes PowerShell script execution policies for Windows computers',
    syntax: 'Set-ExecutionPolicy [-ExecutionPolicy] {Unrestricted | RemoteSigned | AllSigned | Restricted | Bypass} [-Scope <ExecutionPolicyScope>]',
    example: 'Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser'
  },
  {
    name: 'Get-Acl',
    module: 'Microsoft.PowerShell.Security',
    synopsis: 'Gets the security descriptor for a resource, such as a file or registry key',
    syntax: 'Get-Acl [[-Path] <string[]>] [-Audit]',
    example: 'Get-Acl -Path C:\\Windows | Format-List'
  },

  // Microsoft.PowerShell.Archive
  {
    name: 'Compress-Archive',
    module: 'Microsoft.PowerShell.Archive',
    synopsis: 'Creates a compressed archive (ZIP file) from specified files and directories',
    syntax: 'Compress-Archive [-Path] <string[]> [-DestinationPath] <string> [-CompressionLevel {Optimal | NoCompression | Fastest}] [-Force]',
    example: 'Compress-Archive -Path ./dist/* -DestinationPath ./release.zip -Force'
  },
  {
    name: 'Expand-Archive',
    module: 'Microsoft.PowerShell.Archive',
    synopsis: 'Extracts files from a specified archive (ZIP) file to a destination folder',
    syntax: 'Expand-Archive [-Path] <string> [[-DestinationPath] <string>] [-Force]',
    example: 'Expand-Archive -Path ./release.zip -DestinationPath ./unpacked -Force'
  },

  // NetTCPIP & DnsClient
  {
    name: 'Get-NetTCPConnection',
    module: 'NetTCPIP',
    synopsis: 'Gets current TCP connections and listening ports with owning process IDs',
    syntax: 'Get-NetTCPConnection [[-LocalPort] <uint16[]>] [-State {Listen | Established | TimeWait | CloseWait}] [-OwningProcess <uint32[]>]',
    example: 'Get-NetTCPConnection -State Listen | Sort-Object LocalPort'
  },
  {
    name: 'Test-NetConnection',
    module: 'NetTCPIP',
    synopsis: 'Displays diagnostic information for a connection (ping, TCP port test, traceroute)',
    syntax: 'Test-NetConnection [[-ComputerName] <string>] [-Port <int>] [-TraceRoute] [-InformationLevel {Quiet | Detailed}]',
    example: 'Test-NetConnection -ComputerName github.com -Port 443',
    aliases: ['tnc']
  },
  {
    name: 'Get-NetIPAddress',
    module: 'NetTCPIP',
    synopsis: 'Gets the IPv4 and IPv6 address configuration on network interfaces',
    syntax: 'Get-NetIPAddress [-AddressFamily {IPv4 | IPv6}] [-InterfaceAlias <string[]>]',
    example: 'Get-NetIPAddress -AddressFamily IPv4'
  },
  {
    name: 'Resolve-DnsName',
    module: 'DnsClient',
    synopsis: 'Performs a DNS name query resolution for the specified name and record type',
    syntax: 'Resolve-DnsName [-Name] <string> [[-Type] {A | AAAA | TXT | MX | CNAME | NS | SOA | PTR}] [-Server <string[]>]',
    example: 'Resolve-DnsName -Name google.com -Type MX'
  },
  {
    name: 'Clear-DnsClientCache',
    module: 'DnsClient',
    synopsis: 'Clears the contents of the Windows DNS client local cache',
    syntax: 'Clear-DnsClientCache [-Confirm]',
    example: 'Clear-DnsClientCache'
  },

  // PSReadLine & PowerShellGet
  {
    name: 'Set-PSReadLineOption',
    module: 'PSReadLine',
    synopsis: 'Customizes the behavior of PSReadLine command-line editing and history predictions',
    syntax: 'Set-PSReadLineOption [-PredictionSource {None | History | Plugin | HistoryAndPlugin}] [-PredictionViewStyle {InlineView | ListView}] [-EditMode {Windows | Emacs | Vi}]',
    example: 'Set-PSReadLineOption -PredictionSource HistoryAndPlugin -PredictionViewStyle ListView'
  },
  {
    name: 'Install-Module',
    module: 'PowerShellGet',
    synopsis: 'Downloads one or more modules from an online repository and installs them on the local computer',
    syntax: 'Install-Module [-Name] <string[]> [-Scope {CurrentUser | AllUsers}] [-Force] [-AllowClobber]',
    example: 'Install-Module -Name posh-git -Scope CurrentUser'
  },
  {
    name: 'Find-Module',
    module: 'PowerShellGet',
    synopsis: 'Finds modules in a repository that match the specified criteria',
    syntax: 'Find-Module [[-Name] <string[]>] [-Tag <string[]>] [-Repository <string[]>]',
    example: 'Find-Module -Name *Docker*'
  }
]

// ============================================================================
// Built-in Curated Reference: Python Standard Library & Modules
// ============================================================================

const BUILTIN_PY_MODULES: PyModuleInfo[] = [
  { name: 'os', category: 'stdlib', description: 'Miscellaneous operating system interfaces: env vars, directories, paths, and processes' },
  { name: 'pathlib', category: 'stdlib', description: 'Object-oriented filesystem paths with cross-platform Path operations' },
  { name: 'sys', category: 'stdlib', description: 'System-specific parameters, CLI arguments (sys.argv), stdin/stdout, and interpreter state' },
  { name: 'json', category: 'stdlib', description: 'JSON encoder and decoder (loads, dumps, load, dump)' },
  { name: 're', category: 'stdlib', description: 'Regular expression matching, searching, splitting, and substitution' },
  { name: 'subprocess', category: 'stdlib', description: 'Spawn new processes, connect to their input/output/error pipes, and obtain return codes' },
  { name: 'datetime', category: 'stdlib', description: 'Basic date, time, timezone, and timedelta manipulation types' },
  { name: 'collections', category: 'stdlib', description: 'Specialized container datatypes: Counter, defaultdict, deque, namedtuple, OrderedDict' },
  { name: 'itertools', category: 'stdlib', description: 'Functions creating iterators for efficient looping, combinatorics, and chaining' },
  { name: 'functools', category: 'stdlib', description: 'Higher-order functions and operations on callable objects (lru_cache, partial, reduce, wraps)' },
  { name: 'asyncio', category: 'stdlib', description: 'Asynchronous I/O, event loops, coroutines, tasks, and synchronization primitives' },
  { name: 'typing', category: 'stdlib', description: 'Support for type hints, generics, protocols, Callable, TypedDict, and Union' },
  { name: 'shutil', category: 'stdlib', description: 'High-level file operations: directory copying, removal, archiving, and executable lookup' },
  { name: 'hashlib', category: 'stdlib', description: 'Secure hashes and message digests (SHA-256, SHA-512, BLAKE2, MD5)' },
  { name: 'urllib.request', category: 'stdlib', description: 'Extensible library for opening HTTP/HTTPS URLs and downloading files' },
  { name: 'argparse', category: 'stdlib', description: 'Parser for command-line options, arguments, and sub-commands' },
  { name: 'logging', category: 'stdlib', description: 'Flexible event logging system for applications and libraries' },
  { name: 'sqlite3', category: 'stdlib', description: 'DB-API 2.0 interface for SQLite relational databases' },
  { name: 'csv', category: 'stdlib', description: 'CSV file reading and writing (reader, writer, DictReader, DictWriter)' },
  { name: 'dataclasses', category: 'stdlib', description: 'Decorator and functions for automatically adding generated special methods to classes' },
  { name: 'inspect', category: 'stdlib', description: 'Inspect live objects, modules, classes, function signatures, and source code' },
  { name: 'unittest', category: 'stdlib', description: 'Unit testing framework with TestCase, assertions, and mock integration' }
]

const BUILTIN_PY_SYMBOLS: PySymbolInfo[] = [
  // os
  {
    name: 'listdir',
    module: 'os',
    kind: 'function',
    signature: 'os.listdir(path=".") -> list[str]',
    doc: 'Return a list containing the names of the entries in the directory given by path',
    example: 'import os\nfiles = os.listdir(".")'
  },
  {
    name: 'makedirs',
    module: 'os',
    kind: 'function',
    signature: 'os.makedirs(name, mode=0o777, exist_ok=False)',
    doc: 'Recursive directory creation function; creates all intermediate-level directories',
    example: 'import os\nos.makedirs("dist/output", exist_ok=True)'
  },
  {
    name: 'walk',
    module: 'os',
    kind: 'function',
    signature: 'os.walk(top, topdown=True, onerror=None, followlinks=False)',
    doc: 'Generate the file names in a directory tree by walking the tree top-down or bottom-up',
    example: 'import os\nfor root, dirs, files in os.walk("."):\n    print(root, len(files))'
  },
  {
    name: 'getenv',
    module: 'os',
    kind: 'function',
    signature: 'os.getenv(key, default=None) -> str | None',
    doc: 'Return the value of the environment variable key if it exists, or default if it does not',
    example: 'import os\napi_key = os.getenv("API_KEY", "default_value")'
  },

  // pathlib
  {
    name: 'Path',
    module: 'pathlib',
    kind: 'class',
    signature: 'Path(*pathsegments)',
    doc: 'PurePath subclass that can make system calls on path objects (read_text, write_text, glob, rglob)',
    example: 'from pathlib import Path\nfor p in Path(".").rglob("*.py"):\n    print(p.name)'
  },

  // json
  {
    name: 'loads',
    module: 'json',
    kind: 'function',
    signature: 'json.loads(s, *, cls=None, object_hook=None, parse_float=None, parse_int=None) -> Any',
    doc: 'Deserialize s (a str, bytes or bytearray instance containing a JSON document) to a Python object',
    example: 'import json\ndata = json.loads(\'{"status": "ok", "count": 42}\')'
  },
  {
    name: 'dumps',
    module: 'json',
    kind: 'function',
    signature: 'json.dumps(obj, *, skipkeys=False, ensure_ascii=True, indent=None, sort_keys=False) -> str',
    doc: 'Serialize obj to a JSON formatted str',
    example: 'import json\ntext = json.dumps({"status": "ok"}, indent=2)'
  },

  // re
  {
    name: 'search',
    module: 're',
    kind: 'function',
    signature: 're.search(pattern, string, flags=0) -> Match | None',
    doc: 'Scan through string looking for the first location where the regular expression pattern produces a match',
    example: 'import re\nm = re.search(r"(\\d+)", "order #12345")'
  },
  {
    name: 'findall',
    module: 're',
    kind: 'function',
    signature: 're.findall(pattern, string, flags=0) -> list[str]',
    doc: 'Return all non-overlapping matches of pattern in string, as a list of strings or tuples',
    example: 'import re\ntokens = re.findall(r"\\w+", "hello world 123")'
  },
  {
    name: 'sub',
    module: 're',
    kind: 'function',
    signature: 're.sub(pattern, repl, string, count=0, flags=0) -> str',
    doc: 'Return the string obtained by replacing the leftmost non-overlapping occurrences of pattern by repl',
    example: 'import re\nclean = re.sub(r"\\s+", " ", "too   many   spaces")'
  },

  // subprocess
  {
    name: 'run',
    module: 'subprocess',
    kind: 'function',
    signature: 'subprocess.run(args, *, capture_output=False, text=False, check=False, timeout=None, cwd=None)',
    doc: 'Run the command described by args, wait for command to complete, and return a CompletedProcess instance',
    example: 'import subprocess\nres = subprocess.run(["git", "status", "-s"], capture_output=True, text=True, check=True)'
  },
  {
    name: 'Popen',
    module: 'subprocess',
    kind: 'class',
    signature: 'subprocess.Popen(args, bufsize=-1, stdout=None, stderr=None, shell=False, cwd=None, text=None)',
    doc: 'Execute a child program in a new process with full control over pipes and async polling',
    example: 'import subprocess\nproc = subprocess.Popen(["python", "-V"], stdout=subprocess.PIPE, text=True)'
  },

  // datetime
  {
    name: 'datetime',
    module: 'datetime',
    kind: 'class',
    signature: 'datetime(year, month, day, hour=0, minute=0, second=0, microsecond=0, tzinfo=None)',
    doc: 'A combination of a date and a time; supports .now(), .fromisoformat(), .strftime(), .strptime()',
    example: 'from datetime import datetime, timezone\nnow = datetime.now(timezone.utc).isoformat()'
  },
  {
    name: 'timedelta',
    module: 'datetime',
    kind: 'class',
    signature: 'timedelta(days=0, seconds=0, microseconds=0, milliseconds=0, minutes=0, hours=0, weeks=0)',
    doc: 'A duration expressing the difference between two date, time, or datetime instances',
    example: 'from datetime import datetime, timedelta\ntomorrow = datetime.now() + timedelta(days=1)'
  },

  // collections
  {
    name: 'Counter',
    module: 'collections',
    kind: 'class',
    signature: 'Counter(iterable_or_mapping=None)',
    doc: 'Dict subclass for counting hashable objects; supports .most_common(n) and arithmetic',
    example: 'from collections import Counter\ncounts = Counter(["a", "b", "a", "c", "a"]).most_common(2)'
  },
  {
    name: 'defaultdict',
    module: 'collections',
    kind: 'class',
    signature: 'defaultdict(default_factory=None)',
    doc: 'Dict subclass that calls a factory function to supply missing values automatically',
    example: 'from collections import defaultdict\ngroups = defaultdict(list)\ngroups["users"].append("alice")'
  },
  {
    name: 'deque',
    module: 'collections',
    kind: 'class',
    signature: 'deque(iterable=(), maxlen=None)',
    doc: 'List-like container with fast O(1) appends and pops on either end',
    example: 'from collections import deque\nq = deque([1, 2, 3], maxlen=10)\nq.appendleft(0)'
  },

  // functools & itertools
  {
    name: 'lru_cache',
    module: 'functools',
    kind: 'function',
    signature: '@functools.lru_cache(maxsize=128, typed=False)',
    doc: 'Decorator to wrap a function with a memoizing callable that saves up to the maxsize most recent calls',
    example: 'from functools import lru_cache\n\n@lru_cache(maxsize=256)\ndef fib(n: int) -> int:\n    return n if n < 2 else fib(n - 1) + fib(n - 2)'
  },
  {
    name: 'partial',
    module: 'functools',
    kind: 'function',
    signature: 'functools.partial(func, /, *args, **keywords)',
    doc: 'Return a new partial object which when called will behave like func called with the positional arguments args and keyword arguments',
    example: 'from functools import partial\nbasetwo = partial(int, base=2)\nprint(basetwo("10010"))'
  },
  {
    name: 'chain',
    module: 'itertools',
    kind: 'function',
    signature: 'itertools.chain(*iterables)',
    doc: 'Make an iterator that returns elements from the first iterable until it is exhausted, then proceeds to the next',
    example: 'from itertools import chain\nmerged = list(chain([1, 2], [3, 4]))'
  },

  // asyncio
  {
    name: 'run',
    module: 'asyncio',
    kind: 'function',
    signature: 'asyncio.run(coro, *, debug=None)',
    doc: 'Execute the coroutine coro and return the result, managing the asyncio event loop',
    example: 'import asyncio\n\nasync def main():\n    await asyncio.sleep(0.1)\n\nasyncio.run(main())'
  },
  {
    name: 'gather',
    module: 'asyncio',
    kind: 'function',
    signature: 'asyncio.gather(*aws, return_exceptions=False)',
    doc: 'Run awaitable objects in the aws sequence concurrently and return an aggregate list of results',
    example: 'import asyncio\nresults = await asyncio.gather(task1(), task2())'
  },

  // shutil & hashlib
  {
    name: 'rmtree',
    module: 'shutil',
    kind: 'function',
    signature: 'shutil.rmtree(path, ignore_errors=False, onerror=None)',
    doc: 'Delete an entire directory tree; path must point to a directory',
    example: 'import shutil\nshutil.rmtree("./build", ignore_errors=True)'
  },
  {
    name: 'which',
    module: 'shutil',
    kind: 'function',
    signature: 'shutil.which(cmd, mode=os.F_OK | os.X_OK, path=None) -> str | None',
    doc: 'Return the path to an executable which would be run if the given cmd was called',
    example: 'import shutil\npython_bin = shutil.which("python")'
  },
  {
    name: 'sha256',
    module: 'hashlib',
    kind: 'function',
    signature: 'hashlib.sha256(data=b"") -> HASH',
    doc: 'Create a SHA-256 hash object; call .hexdigest() for hex digest string',
    example: 'import hashlib\ndigest = hashlib.sha256(b"hello").hexdigest()'
  },

  // urllib.request
  {
    name: 'urlopen',
    module: 'urllib.request',
    kind: 'function',
    signature: 'urllib.request.urlopen(url, data=None, timeout=socket._GLOBAL_DEFAULT_TIMEOUT)',
    doc: 'Open the URL url, which can be either a string or a Request object',
    example: 'from urllib.request import urlopen\nwith urlopen("https://api.github.com/zen") as res:\n    print(res.read().decode("utf-8"))'
  },

  // dataclasses & argparse
  {
    name: 'dataclass',
    module: 'dataclasses',
    kind: 'function',
    signature: '@dataclass(*, init=True, repr=True, eq=True, order=False, frozen=False, kw_only=False)',
    doc: 'Decorator that examines a class to find field annotations and generates __init__, __repr__, and __eq__',
    example: 'from dataclasses import dataclass\n\n@dataclass\nclass Point:\n    x: float\n    y: float'
  },
  {
    name: 'ArgumentParser',
    module: 'argparse',
    kind: 'class',
    signature: 'argparse.ArgumentParser(prog=None, description=None, epilog=None)',
    doc: 'Object for parsing command line strings into Python objects',
    example: 'import argparse\nparser = argparse.ArgumentParser(description="CLI tool")\nparser.add_argument("--port", type=int, default=8080)\nargs = parser.parse_args()'
  }
]

// ============================================================================
// Live Local Discovery & Caching
// ============================================================================

let psExecutable: string | null = null
let pyExecutable: string | null = null

let cachedPsModules: PsModuleInfo[] | null = null
let cachedPsModulesPromise: Promise<PsModuleInfo[]> | null = null

let cachedPyModules: PyModuleInfo[] | null = null
let cachedPyModulesPromise: Promise<PyModuleInfo[]> | null = null

const cachedPsModuleExports = new Map<string, PsCmdletInfo[]>()
const cachedPsCmdletDetails = new Map<string, PsCmdletInfo>()
const cachedPyModuleDetails = new Map<string, { path?: string; doc?: string; symbols: PySymbolInfo[] }>()

async function getPsExe(): Promise<string> {
  if (psExecutable) return psExecutable
  try {
    await execFileAsync('pwsh', ['-Version'], { timeout: 1500, windowsHide: true })
    psExecutable = 'pwsh'
  } catch {
    psExecutable = 'powershell'
  }
  return psExecutable
}

async function getPyExe(): Promise<string | null> {
  if (pyExecutable !== null) return pyExecutable || null
  for (const candidate of ['python', 'py']) {
    try {
      await execFileAsync(candidate, ['--version'], { timeout: 1500, windowsHide: true })
      pyExecutable = candidate
      return candidate
    } catch {
      // try next
    }
  }
  pyExecutable = ''
  return null
}

function clearDiscoveryCaches(): void {
  cachedPsModules = null
  cachedPsModulesPromise = null
  cachedPyModules = null
  cachedPyModulesPromise = null
  cachedPsModuleExports.clear()
  cachedPsCmdletDetails.clear()
  cachedPyModuleDetails.clear()
}

async function discoverPsModules(): Promise<PsModuleInfo[]> {
  if (cachedPsModules) return cachedPsModules
  if (cachedPsModulesPromise) return cachedPsModulesPromise

  cachedPsModulesPromise = (async () => {
    const merged = new Map<string, PsModuleInfo>()
    for (const m of BUILTIN_PS_MODULES) {
      merged.set(m.name.toLowerCase(), { ...m })
    }

    try {
      const exe = await getPsExe()
      const script = `
        $ErrorActionPreference = 'SilentlyContinue'
        Get-Module -ListAvailable |
          Group-Object Name |
          ForEach-Object { $_.Group | Sort-Object Version -Descending | Select-Object -First 1 } |
          Select-Object Name, @{N='Version';E={$_.Version.ToString()}}, ModuleBase, Description, @{N='ExportCount';E={$_.ExportedCommands.Count}} |
          ConvertTo-Json -Compress
      `
      const { stdout } = await execFileAsync(
        exe,
        ['-NoProfile', '-NonInteractive', '-Command', script],
        { timeout: 4500, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }
      )
      const trimmed = stdout.trim()
      if (trimmed) {
        const parsed = JSON.parse(trimmed)
        const list = Array.isArray(parsed) ? parsed : [parsed]
        for (const item of list) {
          if (!item?.Name) continue
          const key = String(item.Name).toLowerCase()
          const existing = merged.get(key)
          merged.set(key, {
            name: String(item.Name),
            version: item.Version ? String(item.Version) : existing?.version,
            description:
              (item.Description ? String(item.Description).replace(/\s+/g, ' ').trim() : '') ||
              existing?.description ||
              'Installed PowerShell module',
            path: item.ModuleBase ? String(item.ModuleBase) : existing?.path,
            exportCount: typeof item.ExportCount === 'number' ? item.ExportCount : existing?.exportCount,
            builtin: existing?.builtin
          })
        }
      }
    } catch {
      // Fallback to built-in modules if subprocess times out or fails
    }

    const result = Array.from(merged.values()).sort((a, b) => {
      if (a.builtin && !b.builtin) return -1
      if (!a.builtin && b.builtin) return 1
      return a.name.localeCompare(b.name)
    })
    cachedPsModules = result
    cachedPsModulesPromise = null
    return result
  })()

  return cachedPsModulesPromise
}

async function discoverPyModules(): Promise<PyModuleInfo[]> {
  if (cachedPyModules) return cachedPyModules
  if (cachedPyModulesPromise) return cachedPyModulesPromise

  cachedPyModulesPromise = (async () => {
    const merged = new Map<string, PyModuleInfo>()
    for (const m of BUILTIN_PY_MODULES) {
      merged.set(m.name.toLowerCase(), { ...m })
    }

    const py = await getPyExe()
    if (py) {
      try {
        const pyScript = `
import json, importlib.metadata, os
out = []
seen = set()
for dist in importlib.metadata.distributions():
    try:
        meta = dist.metadata
        name = meta.get("Name") or ""
        if not name or name.lower() in seen:
            continue
        seen.add(name.lower())
        summary = (meta.get("Summary") or "").strip()
        version = dist.version or ""
        loc = str(dist.locate_file("")) if hasattr(dist, "locate_file") else ""
        top_pkg = name.replace("-", "_")
        try:
            top_txt = dist.read_text("top_level.txt")
            if top_txt:
                first_line = [l.strip() for l in top_txt.splitlines() if l.strip() and not l.startswith("_")]
                if first_line:
                    top_pkg = first_line[0]
        except Exception:
            pass
        pkg_path = os.path.join(loc, top_pkg) if loc else ""
        if pkg_path and not os.path.exists(pkg_path):
            pkg_path = loc
        out.append({"name": name, "importName": top_pkg, "version": version, "description": summary, "path": pkg_path})
    except Exception:
        pass
print(json.dumps(out))
`
        const { stdout } = await execFileAsync(py, ['-c', pyScript], {
          timeout: 4000,
          windowsHide: true,
          maxBuffer: 4 * 1024 * 1024
        })
        const trimmed = stdout.trim()
        if (trimmed) {
          const list = JSON.parse(trimmed)
          if (Array.isArray(list)) {
            for (const item of list) {
              if (!item?.name) continue
              const modName = String(item.importName || item.name)
              const key = modName.toLowerCase()
              const existing = merged.get(key)
              merged.set(key, {
                name: existing?.name || modName,
                version: item.version ? String(item.version) : existing?.version,
                description:
                  (item.description && item.description !== 'UNKNOWN' ? String(item.description) : '') ||
                  existing?.description ||
                  `Installed Python package (${item.name})`,
                category: existing?.category ?? 'installed',
                path: item.path ? String(item.path) : existing?.path
              })
            }
          }
        }
      } catch {
        // Ignore discovery errors and keep built-in catalog
      }
    }

    const result = Array.from(merged.values()).sort((a, b) => {
      if (a.category !== b.category) return a.category === 'stdlib' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    cachedPyModules = result
    cachedPyModulesPromise = null
    return result
  })()

  return cachedPyModulesPromise
}

async function getPsModuleCommands(moduleName: string): Promise<PsCmdletInfo[]> {
  const key = moduleName.toLowerCase()
  const cached = cachedPsModuleExports.get(key)
  if (cached) return cached

  const byName = new Map<string, PsCmdletInfo>()
  for (const c of BUILTIN_PS_CMDLETS) {
    if (c.module.toLowerCase() === key) {
      byName.set(c.name.toLowerCase(), c)
    }
  }

  try {
    const exe = await getPsExe()
    const safeMod = moduleName.replace(/'/g, "''")
    const script = `
      $ErrorActionPreference = 'SilentlyContinue'
      Get-Command -Module '${safeMod}' |
        Select-Object Name, CommandType, Source, @{N='Syntax';E={($_.ParameterSets | Select-Object -First 1).ToString()}} |
        ConvertTo-Json -Compress
    `
    const { stdout } = await execFileAsync(
      exe,
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 3500, windowsHide: true, maxBuffer: 2 * 1024 * 1024 }
    )
    const trimmed = stdout.trim()
    if (trimmed) {
      const parsed = JSON.parse(trimmed)
      const list = Array.isArray(parsed) ? parsed : [parsed]
      for (const item of list) {
        if (!item?.Name) continue
        const cmdKey = String(item.Name).toLowerCase()
        const existing = byName.get(cmdKey)
        const rawSyntax = item.Syntax ? String(item.Syntax).replace(/\s+/g, ' ').trim() : ''
        byName.set(cmdKey, {
          name: String(item.Name),
          module: existing?.module || String(item.Source || moduleName),
          synopsis: existing?.synopsis || `${item.CommandType || 'Command'} in ${moduleName}`,
          syntax: existing?.syntax || (rawSyntax ? `${item.Name} ${rawSyntax}` : String(item.Name)),
          example: existing?.example,
          aliases: existing?.aliases,
          commandType: item.CommandType ? String(item.CommandType) : undefined
        })
      }
    }
  } catch {
    // Fallback to built-in cmdlets for this module
  }

  const result = Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name))
  cachedPsModuleExports.set(key, result)
  return result
}

async function getPsCmdletDetail(moduleName: string, cmdName: string): Promise<{ cmd: PsCmdletInfo; modulePath?: string }> {
  const cacheKey = `${moduleName.toLowerCase()}/${cmdName.toLowerCase()}`
  const builtin = BUILTIN_PS_CMDLETS.find((c) => c.name.toLowerCase() === cmdName.toLowerCase())
  const modList = cachedPsModules ?? BUILTIN_PS_MODULES
  const modInfo = modList.find((m) => m.name.toLowerCase() === moduleName.toLowerCase())

  const cached = cachedPsCmdletDetails.get(cacheKey)
  if (cached) {
    return { cmd: cached, modulePath: modInfo?.path }
  }

  let resolved: PsCmdletInfo = builtin ?? {
    name: cmdName,
    module: moduleName,
    synopsis: `PowerShell command in ${moduleName}`,
    syntax: cmdName
  }
  let modulePath = modInfo?.path

  try {
    const exe = await getPsExe()
    const safeCmd = cmdName.replace(/'/g, "''")
    const script = `
      $ErrorActionPreference = 'SilentlyContinue'
      $c = Get-Command '${safeCmd}' | Select-Object -First 1
      if ($c) {
        $syn = (Get-Command '${safeCmd}' -Syntax | Out-String).Trim() -split "\\r?\\n" | Where-Object { $_.Trim() } | Select-Object -First 1
        [PSCustomObject]@{
          Name = $c.Name
          Module = $c.Source
          CommandType = $c.CommandType.ToString()
          Syntax = $syn
          ModuleBase = $c.Module.ModuleBase
        } | ConvertTo-Json -Compress
      }
    `
    const { stdout } = await execFileAsync(
      exe,
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 3000, windowsHide: true }
    )
    const trimmed = stdout.trim()
    if (trimmed) {
      const data = JSON.parse(trimmed)
      if (data?.Name) {
        resolved = {
          name: String(data.Name),
          module: String(data.Module || resolved.module),
          synopsis: builtin?.synopsis || `${data.CommandType || 'Command'} from ${data.Module || moduleName}`,
          syntax: builtin?.syntax || (data.Syntax ? String(data.Syntax).trim() : resolved.syntax),
          example: builtin?.example,
          aliases: builtin?.aliases,
          commandType: data.CommandType ? String(data.CommandType) : undefined
        }
        if (data.ModuleBase) {
          modulePath = String(data.ModuleBase)
        }
      }
    }
  } catch {
    // Keep builtin or fallback
  }

  cachedPsCmdletDetails.set(cacheKey, resolved)
  return { cmd: resolved, modulePath }
}

async function getPyModuleDetail(moduleName: string): Promise<{ path?: string; doc?: string; symbols: PySymbolInfo[] }> {
  const key = moduleName.toLowerCase()
  const cached = cachedPyModuleDetails.get(key)
  if (cached) return cached

  const byName = new Map<string, PySymbolInfo>()
  for (const s of BUILTIN_PY_SYMBOLS) {
    if (s.module.toLowerCase() === key) {
      byName.set(s.name.toLowerCase(), s)
    }
  }

  let modPath = (cachedPyModules ?? BUILTIN_PY_MODULES).find((m) => m.name.toLowerCase() === key)?.path
  let modDoc = BUILTIN_PY_MODULES.find((m) => m.name.toLowerCase() === key)?.description

  const py = await getPyExe()
  if (py) {
    try {
      const pyScript = `
import importlib, inspect, json, sys
mod_name = sys.argv[1]
try:
    mod = importlib.import_module(mod_name)
except Exception as e:
    print(json.dumps({"error": str(e)}))
    sys.exit(0)

mod_file = getattr(mod, "__file__", None) or ""
mod_doc = (inspect.getdoc(mod) or "").splitlines()
mod_summary = mod_doc[0].strip() if mod_doc else ""

symbols = []
names = getattr(mod, "__all__", None)
if not names:
    names = [n for n in dir(mod) if not n.startswith("_")]

for name in names[:80]:
    try:
        obj = getattr(mod, name)
        if inspect.ismodule(obj):
            continue
        kind = "class" if inspect.isclass(obj) else ("function" if (inspect.isroutine(obj) or callable(obj)) else "constant")
        sig = ""
        if kind in ("function", "class"):
            try:
                sig = f"{mod_name}.{name}{inspect.signature(obj)}"
            except Exception:
                sig = f"{mod_name}.{name}(...)"
        else:
            sig = f"{mod_name}.{name}"
        doc_lines = (inspect.getdoc(obj) or "").splitlines()
        doc_first = doc_lines[0].strip() if doc_lines else f"{kind} in {mod_name}"
        symbols.append({"name": name, "kind": kind, "signature": sig, "doc": doc_first})
    except Exception:
        pass

print(json.dumps({"file": mod_file, "doc": mod_summary, "symbols": symbols}))
`
      const { stdout } = await execFileAsync(py, ['-c', pyScript, moduleName], {
        timeout: 3500,
        windowsHide: true,
        maxBuffer: 2 * 1024 * 1024
      })
      const trimmed = stdout.trim()
      if (trimmed) {
        const data = JSON.parse(trimmed)
        if (data?.file) modPath = String(data.file)
        if (data?.doc) modDoc = String(data.doc)
        if (Array.isArray(data?.symbols)) {
          for (const s of data.symbols) {
            if (!s?.name) continue
            const symKey = String(s.name).toLowerCase()
            const existing = byName.get(symKey)
            byName.set(symKey, {
              name: String(s.name),
              module: moduleName,
              kind: s.kind === 'class' || s.kind === 'constant' ? s.kind : 'function',
              signature: existing?.signature || String(s.signature || `${moduleName}.${s.name}()`),
              doc: existing?.doc || String(s.doc || ''),
              example: existing?.example,
              file: modPath
            })
          }
        }
      }
    } catch {
      // Fallback to built-in symbols
    }
  }

  const symbols = Array.from(byName.values()).sort((a, b) => {
    if (a.kind !== b.kind) {
      const rank = { function: 0, class: 1, constant: 2 }
      return rank[a.kind] - rank[b.kind]
    }
    return a.name.localeCompare(b.name)
  })
  const detail = { path: modPath, doc: modDoc, symbols }
  cachedPyModuleDetails.set(key, detail)
  return detail
}

// ============================================================================
// Query Parsing & Search Formatting
// ============================================================================

function formatPsModuleItem(mod: PsModuleInfo): SearchResultItem {
  const badgeParts: string[] = []
  if (mod.version) badgeParts.push(`v${mod.version}`)
  if (mod.exportCount) badgeParts.push(`${mod.exportCount} cmds`)
  const meta = badgeParts.length ? ` (${badgeParts.join(', ')})` : ''
  return {
    label: `⚡ [PS Module] ${mod.name}${meta}`,
    sublabel: `${mod.description} · ↵ Browse module commands`,
    value: `ps:${mod.name}`,
    completion: `/expmod ps:${mod.name} `
  }
}

function formatPsCmdletItem(cmd: PsCmdletInfo): SearchResultItem {
  const aliasStr = cmd.aliases?.length ? ` (aliases: ${cmd.aliases.join(', ')})` : ''
  return {
    label: `⚡ ${cmd.name}${aliasStr}`,
    sublabel: `[${cmd.module}] ${cmd.synopsis} · ↵ Inspect syntax & actions`,
    value: `ps:${cmd.module}/${cmd.name}`,
    completion: `/expmod ps:${cmd.module}/${cmd.name}`
  }
}

function formatPyModuleItem(mod: PyModuleInfo): SearchResultItem {
  const ver = mod.version ? ` v${mod.version}` : ''
  const tag = mod.category === 'stdlib' ? 'stdlib' : 'pip'
  return {
    label: `🐍 [Py ${tag}] ${mod.name}${ver}`,
    sublabel: `${mod.description} · ↵ Browse module exports`,
    value: `py:${mod.name}`,
    completion: `/expmod py:${mod.name} `
  }
}

function formatPySymbolItem(sym: PySymbolInfo): SearchResultItem {
  const icon = sym.kind === 'class' ? '🏛️' : sym.kind === 'constant' ? '🔹' : '🐍'
  return {
    label: `${icon} ${sym.module}.${sym.name}`,
    sublabel: `${sym.signature} — ${sym.doc} · ↵ Inspect & actions`,
    value: `py:${sym.module}/${sym.name}`,
    completion: `/expmod py:${sym.module}/${sym.name}`
  }
}

async function renderPsModuleDrilldown(moduleName: string, filter: string): Promise<SearchResultItem[]> {
  const [modules, commands] = await Promise.all([
    discoverPsModules(),
    getPsModuleCommands(moduleName)
  ])
  const modInfo = modules.find((m) => m.name.toLowerCase() === moduleName.toLowerCase())
  const canonicalName = modInfo?.name || moduleName
  const f = filter.trim().toLowerCase()

  const items: SearchResultItem[] = [
    {
      label: '← Back to PowerShell Modules',
      sublabel: 'Return to PowerShell module & cmdlet search',
      value: '',
      completion: '/expmod ps '
    }
  ]

  if (!f) {
    items.push({
      label: `📋 Copy "Import-Module ${canonicalName}"`,
      sublabel: `Copy PowerShell import statement for ${canonicalName} to clipboard`,
      value: `Import-Module ${canonicalName}`
    })
    items.push({
      label: `>_ List ${canonicalName} Commands in Terminal`,
      sublabel: `Run "Get-Command -Module ${canonicalName}" in SudoLaunch Terminal`,
      value: `__term::Get-Command -Module ${canonicalName}`
    })
    if (modInfo?.path && existsSync(modInfo.path)) {
      items.push({
        label: `📂 Open Module Folder in Explorer`,
        sublabel: `${modInfo.path} · ↵ Reveal in File Explorer`,
        value: `__explorer::${modInfo.path}`
      })
    }
  }

  const filtered = f
    ? commands.filter(
        (c) =>
          c.name.toLowerCase().includes(f) ||
          c.synopsis.toLowerCase().includes(f) ||
          (c.aliases && c.aliases.some((a) => a.toLowerCase().includes(f)))
      )
    : commands

  if (filtered.length === 0) {
    items.push({
      label: `No commands matching "${filter}" in ${canonicalName}`,
      sublabel: `${commands.length} total exported commands in module`,
      value: '',
      disabled: true
    })
  } else {
    for (const c of filtered.slice(0, 60)) {
      items.push(formatPsCmdletItem(c))
    }
  }

  return items
}

async function renderPsCmdletDrilldown(moduleName: string, cmdName: string): Promise<SearchResultItem[]> {
  const { cmd, modulePath } = await getPsCmdletDetail(moduleName, cmdName)
  const items: SearchResultItem[] = [
    {
      label: `← Back to ${cmd.module}`,
      sublabel: `Browse other commands in ${cmd.module}`,
      value: '',
      completion: `/expmod ps:${cmd.module} `
    },
    {
      label: `📋 Copy Syntax: ${cmd.syntax}`,
      sublabel: `${cmd.synopsis} · ↵ Copy syntax template`,
      value: cmd.syntax
    }
  ]

  if (cmd.example) {
    items.push({
      label: `📋 Copy Example: ${cmd.example}`,
      sublabel: `Ready-to-use ${cmd.name} example · ↵ Copy to clipboard`,
      value: cmd.example
    })
  }

  items.push({
    label: `📋 Copy Command Name: ${cmd.name}`,
    sublabel: cmd.aliases?.length
      ? `Aliases: ${cmd.aliases.join(', ')} · ↵ Copy "${cmd.name}"`
      : `↵ Copy "${cmd.name}" to clipboard`,
    value: cmd.name
  })

  items.push({
    label: `>_ Run "Get-Help ${cmd.name} -Full" in Terminal`,
    sublabel: 'Open SudoLaunch Terminal and display full documentation & parameter details',
    value: `__term::Get-Help ${cmd.name} -Full`
  })

  items.push({
    label: `>_ Run "Get-Help ${cmd.name} -Examples" in Terminal`,
    sublabel: 'Open SudoLaunch Terminal and display practical usage examples',
    value: `__term::Get-Help ${cmd.name} -Examples`
  })

  if (modulePath && existsSync(modulePath)) {
    items.push({
      label: `📂 Open Module Location in Explorer`,
      sublabel: `${modulePath} · ↵ Reveal in File Explorer`,
      value: `__explorer::${modulePath}`
    })
  }

  return items
}

async function renderPyModuleDrilldown(moduleName: string, filter: string): Promise<SearchResultItem[]> {
  const detail = await getPyModuleDetail(moduleName)
  const f = filter.trim().toLowerCase()

  const items: SearchResultItem[] = [
    {
      label: '← Back to Python Modules',
      sublabel: 'Return to Python stdlib & installed packages search',
      value: '',
      completion: '/expmod py '
    }
  ]

  if (!f) {
    items.push({
      label: `📋 Copy "import ${moduleName}"`,
      sublabel: detail.doc ? `${detail.doc} · ↵ Copy import statement` : `Copy Python import statement for ${moduleName}`,
      value: `import ${moduleName}`
    })
    items.push({
      label: `>_ View pydoc in Terminal (python -m pydoc ${moduleName})`,
      sublabel: `Run "python -m pydoc ${moduleName}" in SudoLaunch Terminal`,
      value: `__term::python -m pydoc ${moduleName}`
    })
    if (detail.path && existsSync(detail.path)) {
      items.push({
        label: `📂 Open Module Location in Explorer`,
        sublabel: `${detail.path} · ↵ Reveal in File Explorer`,
        value: `__explorer::${detail.path}`
      })
    }
  }

  const filtered = f
    ? detail.symbols.filter(
        (s) =>
          s.name.toLowerCase().includes(f) ||
          s.doc.toLowerCase().includes(f) ||
          s.signature.toLowerCase().includes(f)
      )
    : detail.symbols

  if (filtered.length === 0) {
    items.push({
      label: f ? `No symbols matching "${filter}" in ${moduleName}` : `No exported symbols discovered for ${moduleName}`,
      sublabel: 'Use "View pydoc in Terminal" above to inspect full module documentation',
      value: '',
      disabled: true
    })
  } else {
    for (const s of filtered.slice(0, 60)) {
      items.push(formatPySymbolItem(s))
    }
  }

  return items
}

async function renderPySymbolDrilldown(moduleName: string, symbolName: string): Promise<SearchResultItem[]> {
  const detail = await getPyModuleDetail(moduleName)
  const sym =
    detail.symbols.find((s) => s.name.toLowerCase() === symbolName.toLowerCase()) ??
    BUILTIN_PY_SYMBOLS.find(
      (s) => s.module.toLowerCase() === moduleName.toLowerCase() && s.name.toLowerCase() === symbolName.toLowerCase()
    ) ?? {
      name: symbolName,
      module: moduleName,
      kind: 'function' as const,
      signature: `${moduleName}.${symbolName}(...)`,
      doc: `Symbol in ${moduleName}`,
      file: detail.path
    }

  const importStmt = `from ${sym.module} import ${sym.name}`
  const filePath = sym.file || detail.path

  const items: SearchResultItem[] = [
    {
      label: `← Back to ${sym.module}`,
      sublabel: `Browse other functions and classes in ${sym.module}`,
      value: '',
      completion: `/expmod py:${sym.module} `
    },
    {
      label: `📋 Copy Import: ${importStmt}`,
      sublabel: `${sym.doc} · ↵ Copy import statement`,
      value: importStmt
    },
    {
      label: `📋 Copy Signature / Call: ${sym.signature}`,
      sublabel: `↵ Copy "${sym.signature}" to clipboard`,
      value: sym.signature
    }
  ]

  if (sym.example) {
    items.push({
      label: `📋 Copy Example Snippet`,
      sublabel: `${sym.example.replace(/\n+/g, '  ↵  ')} · ↵ Copy snippet`,
      value: sym.example
    })
  }

  items.push({
    label: `>_ Run "python -m pydoc ${sym.module}.${sym.name}" in Terminal`,
    sublabel: 'Open SudoLaunch Terminal and display full Python docstring & signature',
    value: `__term::python -m pydoc ${sym.module}.${sym.name}`
  })

  if (filePath && existsSync(filePath)) {
    items.push({
      label: `📂 Open Source Location in Explorer`,
      sublabel: `${filePath} · ↵ Reveal in File Explorer`,
      value: `__explorer::${filePath}`
    })
  }

  return items
}

// Synchronous search over built-in + already-cached modules/commands for global /search fan-out
export function searchSync(query: string): SearchResultItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const psMods = cachedPsModules ?? BUILTIN_PS_MODULES
  const pyMods = cachedPyModules ?? BUILTIN_PY_MODULES

  const results: SearchResultItem[] = []

  for (const c of BUILTIN_PS_CMDLETS) {
    if (
      c.name.toLowerCase().includes(q) ||
      (c.aliases && c.aliases.some((a) => a.toLowerCase() === q))
    ) {
      results.push(formatPsCmdletItem(c))
      if (results.length >= 6) break
    }
  }

  for (const s of BUILTIN_PY_SYMBOLS) {
    if (
      s.name.toLowerCase().includes(q) ||
      `${s.module}.${s.name}`.toLowerCase().includes(q)
    ) {
      results.push(formatPySymbolItem(s))
      if (results.length >= 10) break
    }
  }

  for (const m of psMods) {
    if (m.name.toLowerCase().includes(q)) {
      results.push(formatPsModuleItem(m))
      if (results.length >= 14) break
    }
  }

  for (const m of pyMods) {
    if (m.name.toLowerCase().includes(q)) {
      results.push(formatPyModuleItem(m))
      if (results.length >= 18) break
    }
  }

  return results
}

export async function search(query: string): Promise<SearchResultItem[]> {
  const raw = query.trim()

  // 1. Check for explicit module or command drill-down: ps:<Module>[/<Cmd>] or py:<Module>[/<Sym>]
  const psDrillMatch = raw.match(/^ps:([^\s/]+)(?:\/(\S+))?(?:\s+(.*))?$/i)
  if (psDrillMatch) {
    const modName = psDrillMatch[1]
    const cmdName = psDrillMatch[2]
    const subFilter = psDrillMatch[3] ?? ''
    if (cmdName) {
      return renderPsCmdletDrilldown(modName, cmdName)
    }
    return renderPsModuleDrilldown(modName, subFilter)
  }

  const pyDrillMatch = raw.match(/^py:([^\s/]+)(?:\/(\S+))?(?:\s+(.*))?$/i)
  if (pyDrillMatch) {
    const modOrDot = pyDrillMatch[1]
    const explicitSym = pyDrillMatch[2]
    const subFilter = pyDrillMatch[3] ?? ''
    if (explicitSym) {
      return renderPySymbolDrilldown(modOrDot, explicitSym)
    }
    // Also support py:os.listdir if the user typed a dot and the prefix matches a known module
    const dotIdx = modOrDot.lastIndexOf('.')
    if (dotIdx > 0 && !subFilter) {
      const candidateMod = modOrDot.slice(0, dotIdx)
      const candidateSym = modOrDot.slice(dotIdx + 1)
      const pyMods = await discoverPyModules()
      const exactFullMod = pyMods.some((m) => m.name.toLowerCase() === modOrDot.toLowerCase())
      const exactParentMod = pyMods.some((m) => m.name.toLowerCase() === candidateMod.toLowerCase())
      if (!exactFullMod && exactParentMod && candidateSym) {
        return renderPySymbolDrilldown(candidateMod, candidateSym)
      }
    }
    return renderPyModuleDrilldown(modOrDot, subFilter)
  }

  // 2. Discover local + built-in modules in parallel
  const [psModules, pyModules] = await Promise.all([discoverPsModules(), discoverPyModules()])

  // 3. Empty query: show category filters, refresh action, and featured modules/commands
  if (!raw) {
    const items: SearchResultItem[] = [
      {
        label: `⚡ PowerShell Modules & Cmdlets (${psModules.length} modules)`,
        sublabel: 'Browse installed PowerShell modules, syntax, and Get-Help · Tab/↵ to filter',
        value: 'ps',
        completion: '/expmod ps '
      },
      {
        label: `🐍 Python Modules & Packages (${pyModules.length} modules)`,
        sublabel: 'Browse Python stdlib & installed pip packages, signatures, and pydoc · Tab/↵ to filter',
        value: 'py',
        completion: '/expmod py '
      },
      {
        label: '🔄 Refresh Installed Modules Cache',
        sublabel: 'Rescan local PowerShell modules and Python environment packages',
        value: '__refresh'
      }
    ]

    for (const m of psModules.slice(0, 6)) {
      items.push(formatPsModuleItem(m))
    }
    for (const m of pyModules.slice(0, 6)) {
      items.push(formatPyModuleItem(m))
    }
    for (const c of BUILTIN_PS_CMDLETS.slice(0, 5)) {
      items.push(formatPsCmdletItem(c))
    }
    for (const s of BUILTIN_PY_SYMBOLS.slice(0, 5)) {
      items.push(formatPySymbolItem(s))
    }
    return items
  }

  // 4. Check for ecosystem prefix: "ps ...", "pwsh ...", "powershell ...", "py ...", "python ..."
  let mode: 'all' | 'ps' | 'py' = 'all'
  let searchFilter = raw

  const prefixMatch = raw.match(/^(ps|pwsh|powershell|py|python)(?:\s+(.*))?$/i)
  if (prefixMatch) {
    const p = prefixMatch[1].toLowerCase()
    mode = p.startsWith('p') && (p === 'py' || p === 'python') ? 'py' : 'ps'
    searchFilter = (prefixMatch[2] ?? '').trim()
  }

  if (!searchFilter) {
    if (mode === 'ps') {
      const items: SearchResultItem[] = [
        {
          label: '← Back to All Ecosystems',
          sublabel: 'Search across both PowerShell and Python',
          value: '',
          completion: '/expmod '
        }
      ]
      for (const m of psModules.slice(0, 25)) {
        items.push(formatPsModuleItem(m))
      }
      for (const c of BUILTIN_PS_CMDLETS.slice(0, 25)) {
        items.push(formatPsCmdletItem(c))
      }
      return items
    }
    if (mode === 'py') {
      const items: SearchResultItem[] = [
        {
          label: '← Back to All Ecosystems',
          sublabel: 'Search across both PowerShell and Python',
          value: '',
          completion: '/expmod '
        }
      ]
      for (const m of pyModules.slice(0, 25)) {
        items.push(formatPyModuleItem(m))
      }
      for (const s of BUILTIN_PY_SYMBOLS.slice(0, 25)) {
        items.push(formatPySymbolItem(s))
      }
      return items
    }
  }

  // 5. Fuzzy + substring search across modules and commands/symbols
  const items: SearchResultItem[] = []

  if (mode === 'ps' || mode === 'all') {
    const cmdFuse = new Fuse(BUILTIN_PS_CMDLETS, {
      keys: ['name', 'module', 'synopsis', 'aliases'],
      threshold: 0.35,
      ignoreLocation: true
    })
    const modFuse = new Fuse(psModules, {
      keys: ['name', 'description'],
      threshold: 0.35,
      ignoreLocation: true
    })

    for (const r of modFuse.search(searchFilter).slice(0, 12)) {
      items.push(formatPsModuleItem(r.item))
    }
    for (const r of cmdFuse.search(searchFilter).slice(0, 15)) {
      items.push(formatPsCmdletItem(r.item))
    }
  }

  if (mode === 'py' || mode === 'all') {
    const symFuse = new Fuse(BUILTIN_PY_SYMBOLS, {
      keys: ['name', 'module', 'doc', 'signature'],
      threshold: 0.35,
      ignoreLocation: true
    })
    const modFuse = new Fuse(pyModules, {
      keys: ['name', 'description'],
      threshold: 0.35,
      ignoreLocation: true
    })

    for (const r of modFuse.search(searchFilter).slice(0, 12)) {
      items.push(formatPyModuleItem(r.item))
    }
    for (const r of symFuse.search(searchFilter).slice(0, 15)) {
      items.push(formatPySymbolItem(r.item))
    }
  }

  if (items.length === 0) {
    return [
      {
        label: `No PowerShell or Python modules/commands matching "${searchFilter}"`,
        sublabel: 'Try: /expmod ps · /expmod py · /expmod Get-ChildItem · /expmod pathlib · /expmod json',
        value: '',
        disabled: true
      }
    ]
  }

  return items
}

export async function execute(item: SearchResultItem, _query?: string, elevated?: boolean): Promise<void> {
  if (!item.value) return

  if (item.value === '__refresh') {
    clearDiscoveryCaches()
    await Promise.all([discoverPsModules(), discoverPyModules()])
    return
  }

  if (item.value.startsWith('__term::')) {
    const cmd = item.value.slice('__term::'.length)
    if (elevated) {
      runElevated(cmd, `Module Explorer: ${cmd}`)
    } else {
      runInTerminal(cmd)
    }
    return
  }

  if (item.value.startsWith('__explorer::')) {
    const targetPath = item.value.slice('__explorer::'.length)
    if (existsSync(targetPath)) {
      try {
        const st = statSync(targetPath)
        if (st.isDirectory()) {
          await shell.openPath(targetPath)
        } else {
          shell.showItemInFolder(targetPath)
        }
      } catch {
        shell.showItemInFolder(targetPath)
      }
    }
    return
  }

  clipboard.writeText(item.value)
}

