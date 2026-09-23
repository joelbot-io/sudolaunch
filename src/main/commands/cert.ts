import tls from 'tls'
import crypto from 'crypto'
import { clipboard } from 'electron'
import type { SearchResultItem } from '../../shared/types'

interface CertDetails {
  subject: string
  issuer: string
  validFrom: string
  validTo: string
  daysRemaining: number
  isExpired: boolean
  sans: string[]
  fingerprint: string
  protocol?: string
  cipher?: string
}

function fetchRemoteCert(host: string, port = 443): Promise<CertDetails> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      {
        host,
        port,
        servername: host,
        rejectUnauthorized: false,
        timeout: 4000
      },
      () => {
        const cert = socket.getPeerCertificate(true)
        const protocol = socket.getProtocol() || undefined
        const cipher = socket.getCipher()?.name || undefined
        socket.destroy()

        if (!cert || Object.keys(cert).length === 0) {
          reject(new Error('No certificate received from remote host'))
          return
        }

        const validToDate = new Date(cert.valid_to)
        const now = Date.now()
        const diffDays = Math.ceil((validToDate.getTime() - now) / (1000 * 60 * 60 * 24))
        const isExpired = diffDays <= 0

        const sans = cert.subjectaltname
          ? cert.subjectaltname
              .split(',')
              .map((s) => s.trim().replace(/^DNS:/, ''))
              .filter(Boolean)
          : []

        const formatField = (val: string | string[] | undefined, fallback: string): string => {
          if (!val) return fallback
          return Array.isArray(val) ? val.join(', ') : val
        }

        resolve({
          subject: formatField(cert.subject?.CN, host),
          issuer: formatField(cert.issuer?.O || cert.issuer?.CN, 'Unknown Issuer'),
          validFrom: cert.valid_from,
          validTo: cert.valid_to,
          daysRemaining: diffDays,
          isExpired,
          sans,
          fingerprint: cert.fingerprint256 || cert.fingerprint || '',
          protocol,
          cipher
        })
      }
    )

    socket.on('timeout', () => {
      socket.destroy()
      reject(new Error(`Connection to ${host}:${port} timed out after 4s`))
    })

    socket.on('error', (err) => {
      socket.destroy()
      reject(err)
    })
  })
}

function parsePemCert(pem: string): CertDetails | null {
  try {
    const x509 = new crypto.X509Certificate(pem)
    const validToDate = new Date(x509.validTo)
    const now = Date.now()
    const diffDays = Math.ceil((validToDate.getTime() - now) / (1000 * 60 * 60 * 24))

    const sans = x509.subjectAltName
      ? x509.subjectAltName
          .split(',')
          .map((s) => s.trim().replace(/^DNS:/, ''))
          .filter(Boolean)
      : []

    return {
      subject: x509.subject,
      issuer: x509.issuer,
      validFrom: x509.validFrom,
      validTo: x509.validTo,
      daysRemaining: diffDays,
      isExpired: diffDays <= 0,
      sans,
      fingerprint: x509.fingerprint256
    }
  } catch {
    return null
  }
}

export async function search(query: string): Promise<SearchResultItem[]> {
  let target = query.trim()

  // Check clipboard if query is empty
  if (!target) {
    const cb = clipboard.readText().trim()
    if (cb.includes('-----BEGIN CERTIFICATE-----')) {
      const parsed = parsePemCert(cb)
      if (parsed) {
        return formatCertResults(parsed, 'Clipboard PEM Certificate')
      }
    }
    return [
      {
        label: 'Inspect SSL/TLS Certificates',
        sublabel: 'Enter a domain (e.g. /cert github.com or /cert localhost:8443) or copy a PEM certificate',
        value: '',
        disabled: true
      }
    ]
  }

  // If input is PEM
  if (target.includes('-----BEGIN CERTIFICATE-----')) {
    const parsed = parsePemCert(target)
    if (parsed) {
      return formatCertResults(parsed, 'Pasted PEM Certificate')
    }
  }

  // Clean target domain
  target = target.replace(/^https?:\/\//i, '').split('/')[0].trim()
  let host = target
  let port = 443

  if (target.includes(':')) {
    const [h, p] = target.split(':')
    host = h
    const parsedPort = parseInt(p, 10)
    if (!isNaN(parsedPort) && parsedPort > 0 && parsedPort <= 65535) {
      port = parsedPort
    }
  }

  try {
    const details = await fetchRemoteCert(host, port)
    return formatCertResults(details, `${host}:${port}`)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return [
      {
        label: `Failed to inspect certificate for ${host}:${port}`,
        sublabel: msg,
        value: '',
        disabled: true
      }
    ]
  }
}

function formatCertResults(details: CertDetails, source: string): SearchResultItem[] {
  const icon = details.isExpired ? '🔴' : details.daysRemaining < 14 ? '🟡' : '🟢'
  const expStatus = details.isExpired
    ? `Expired ${Math.abs(details.daysRemaining)} days ago`
    : `Valid for ${details.daysRemaining} days (until ${details.validTo})`

  return [
    {
      label: `${icon} Certificate Expiry: ${expStatus}`,
      sublabel: `Host: ${source} · Issued to: ${details.subject} · ↵ Copy Expiry Date`,
      value: details.validTo
    },
    {
      label: `🏢 Issuer: ${details.issuer}`,
      sublabel: `Valid From: ${details.validFrom} · ↵ Copy Issuer`,
      value: details.issuer
    },
    {
      label: `🌐 SANs: ${details.sans.length > 0 ? details.sans.slice(0, 5).join(', ') + (details.sans.length > 5 ? '...' : '') : details.subject}`,
      sublabel: `${details.sans.length} Subject Alternative Names · ↵ Copy all SANs`,
      value: details.sans.join(', ')
    },
    ...(details.protocol
      ? [
          {
            label: `🔒 Protocol: ${details.protocol} (${details.cipher || 'Standard Cipher'})`,
            sublabel: `Active TLS connection parameters · ↵ Copy Protocol`,
            value: `${details.protocol} ${details.cipher || ''}`.trim()
          }
        ]
      : []),
    {
      label: `🔑 SHA-256 Fingerprint: ${details.fingerprint.slice(0, 32)}...`,
      sublabel: `Certificate fingerprint · ↵ Copy SHA-256 Fingerprint`,
      value: details.fingerprint
    }
  ]
}

export async function execute(item: SearchResultItem): Promise<void> {
  if (item.value) {
    clipboard.writeText(item.value)
  }
}
