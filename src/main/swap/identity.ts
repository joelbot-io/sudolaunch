import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { X509Certificate } from 'crypto'
import { generate as generateSelfSigned } from 'selfsigned'
import { hostname } from 'os'

// This machine's persistent TLS identity for the input-control (/control) feature —
// generated once and reused forever, the same way an SSH host key works. Peers pin the
// SHA-256 fingerprint of this cert (see SwapPeer.expectedFingerprint in shared/types.ts)
// instead of trusting a shared CA, since there's no CA here — every machine is its own
// root of trust and every peer relationship is configured explicitly by the user.
const IDENTITY_DIR = join(app.getPath('home'), '.sudolaunch')
const KEY_PATH = join(IDENTITY_DIR, 'control-identity.key')
const CERT_PATH = join(IDENTITY_DIR, 'control-identity.crt')

export interface SwapIdentity {
  key: string
  cert: string
  // Colon-separated uppercase hex SHA-256 fingerprint of `cert`, e.g.
  // "AB:12:...". This is what the user copies into a peer's "Expected Fingerprint"
  // field on the OTHER machine — it's the value that actually proves identity, not the
  // hostname or IP, both of which an attacker on the LAN could spoof.
  fingerprint: string
}

let cached: SwapIdentity | null = null

// Synchronous access to whatever's already been loaded/generated — used by places (like
// the /control command's synchronous search()) that can't await, on the assumption that
// initSwap() has already called getSwapIdentity() once at app startup. Returns null only
// in the narrow window before that first call resolves, or if input sharing has never
// been started at all.
export function getCachedSwapIdentity(): SwapIdentity | null {
  return cached
}

export async function getSwapIdentity(): Promise<SwapIdentity> {
  if (cached) return cached

  if (existsSync(KEY_PATH) && existsSync(CERT_PATH)) {
    const key = readFileSync(KEY_PATH, 'utf8')
    const cert = readFileSync(CERT_PATH, 'utf8')
    cached = { key, cert, fingerprint: fingerprintOf(cert) }
    return cached
  }

  cached = await generateAndPersist()
  return cached
}

// Discards this machine's current identity and generates a brand new one, overwriting
// control-identity.{key,crt} on disk. The new fingerprint has to be re-shared with every
// peer this machine talks to (and every peer that talks to it needs its own peers.json
// entry updated) — nothing here notifies them; that exchange is manual, the same way
// swapping an SSH host key is. Existing peer entries are left untouched, so until they're
// updated with the new fingerprint, both directions of the /control handshake with this
// machine will simply be refused rather than silently trusting a stale one.
export async function rotateSwapIdentity(): Promise<SwapIdentity> {
  cached = await generateAndPersist()
  return cached
}

async function generateAndPersist(): Promise<SwapIdentity> {
  if (!existsSync(IDENTITY_DIR)) mkdirSync(IDENTITY_DIR, { recursive: true })

  const pems = await generateSelfSigned([{ name: 'commonName', value: hostname() }], {
    algorithm: 'sha256',
    keySize: 2048,
    // Long-lived on purpose: this is a pinned machine identity, not a web server cert
    // that's expected to rotate on a schedule — rotation here is a deliberate, manual
    // user action (see rotateSwapIdentity), not something that should happen on its own.
    notAfterDate: new Date(Date.now() + 20 * 365 * 24 * 60 * 60 * 1000),
    extensions: [{ name: 'basicConstraints', cA: false }]
  })

  writeFileSync(KEY_PATH, pems.private, { mode: 0o600 })
  writeFileSync(CERT_PATH, pems.cert, { mode: 0o600 })

  return { key: pems.private, cert: pems.cert, fingerprint: fingerprintOf(pems.cert) }
}

function fingerprintOf(certPem: string): string {
  // selfsigned returns its own `fingerprint` field on generate(), but we need to be able
  // to recompute it for a cert loaded from disk (the cached-identity path above) too, so
  // this doesn't rely on that field at all — one code path for both.
  return new X509Certificate(certPem).fingerprint256
}
