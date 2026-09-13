import { clipboard } from 'electron'
import Fuse from 'fuse.js'
import type { SearchResultItem } from '../../shared/types'

interface HttpEntry {
  code?: number
  name: string
  category: string
  description: string
  template?: string
}

const HTTP_ENTRIES: HttpEntry[] = [
  // 1xx Informational
  { code: 100, name: '100 Continue', category: '1xx Informational', description: 'Server received initial request headers; client should proceed to send body.' },
  { code: 101, name: '101 Switching Protocols', category: '1xx Informational', description: 'Requester has asked server to switch protocols (e.g. HTTP to WebSocket).' },

  // 2xx Success
  { code: 200, name: '200 OK', category: '2xx Success', description: 'Standard response for successful HTTP requests.' },
  { code: 201, name: '201 Created', category: '2xx Success', description: 'Request succeeded and new resource was created.' },
  { code: 202, name: '202 Accepted', category: '2xx Success', description: 'Request accepted for processing, but processing is not complete.' },
  { code: 204, name: '204 No Content', category: '2xx Success', description: 'Server successfully processed request and is not returning any content.' },
  { code: 206, name: '206 Partial Content', category: '2xx Success', description: 'Server is delivering only part of the resource due to a Range header.' },

  // 3xx Redirection
  { code: 301, name: '301 Moved Permanently', category: '3xx Redirection', description: 'Target resource has been assigned a new permanent URI.' },
  { code: 302, name: '302 Found', category: '3xx Redirection', description: 'Target resource resides temporarily under a different URI.' },
  { code: 304, name: '304 Not Modified', category: '3xx Redirection', description: 'Resource has not been modified since specified in conditional headers.' },
  { code: 307, name: '307 Temporary Redirect', category: '3xx Redirection', description: 'Target resource temporarily at different URI; method must not change.' },
  { code: 308, name: '308 Permanent Redirect', category: '3xx Redirection', description: 'Target resource permanently at different URI; method must not change.' },

  // 4xx Client Error
  { code: 400, name: '400 Bad Request', category: '4xx Client Error', description: 'Server cannot process request due to client error (malformed syntax).' },
  { code: 401, name: '401 Unauthorized', category: '4xx Client Error', description: 'Authentication required and has failed or not yet been provided.' },
  { code: 402, name: '402 Payment Required', category: '4xx Client Error', description: 'Reserved for future use (sometimes used for digital cash / quota paywalls).' },
  { code: 403, name: '403 Forbidden', category: '4xx Client Error', description: 'Server understood request but refuses to authorize it (insufficient permissions).' },
  { code: 404, name: '404 Not Found', category: '4xx Client Error', description: 'Requested resource could not be found on server.' },
  { code: 405, name: '405 Method Not Allowed', category: '4xx Client Error', description: 'Request method (GET, POST, etc.) is not supported for requested resource.' },
  { code: 408, name: '408 Request Timeout', category: '4xx Client Error', description: 'Server timed out waiting for the client request.' },
  { code: 409, name: '409 Conflict', category: '4xx Client Error', description: 'Request could not be completed due to conflict with current resource state.' },
  { code: 410, name: '410 Gone', category: '4xx Client Error', description: 'Requested resource is no longer available and no forwarding address is known.' },
  { code: 413, name: '413 Payload Too Large', category: '4xx Client Error', description: 'Request entity is larger than limits defined by server.' },
  { code: 415, name: '415 Unsupported Media Type', category: '4xx Client Error', description: 'Payload format is in an unsupported format for requested method.' },
  { code: 418, name: "418 I'm a teapot", category: '4xx Client Error', description: 'HTCPCP teapot protocol (RFC 2324): Server refuses to brew coffee.' },
  { code: 422, name: '422 Unprocessable Entity', category: '4xx Client Error', description: 'Request syntax was valid but server was unable to process contained instructions.' },
  { code: 429, name: '429 Too Many Requests', category: '4xx Client Error', description: 'Client has sent too many requests in given time (rate limiting).' },

  // 5xx Server Error
  { code: 500, name: '500 Internal Server Error', category: '5xx Server Error', description: 'Generic error message when server encountered an unexpected condition.' },
  { code: 501, name: '501 Not Implemented', category: '5xx Server Error', description: 'Server does not recognize request method or lacks ability to fulfill it.' },
  { code: 502, name: '502 Bad Gateway', category: '5xx Server Error', description: 'Server acting as gateway/proxy received an invalid response from upstream.' },
  { code: 503, name: '503 Service Unavailable', category: '5xx Server Error', description: 'Server is currently unable to handle request due to overload or maintenance.' },
  { code: 504, name: '504 Gateway Timeout', category: '5xx Server Error', description: 'Server acting as gateway/proxy did not receive timely response from upstream.' },

  // Standard Headers
  { name: 'Header: Authorization (Bearer)', category: 'HTTP Header', description: 'Credentials for authenticating a user agent with a server', template: 'Authorization: Bearer <token>' },
  { name: 'Header: Content-Type (JSON)', category: 'HTTP Header', description: 'Media type of the resource before any encoding', template: 'Content-Type: application/json' },
  { name: 'Header: Accept (JSON)', category: 'HTTP Header', description: 'Informs server about types of data that can be sent back', template: 'Accept: application/json' },
  { name: 'Header: Cache-Control', category: 'HTTP Header', description: 'Directives for caching mechanisms in requests and responses', template: 'Cache-Control: no-cache, no-store, must-revalidate' },
  { name: 'Header: CORS Allow-Origin', category: 'HTTP Header', description: 'Indicates whether response can be shared with requesting origin', template: 'Access-Control-Allow-Origin: *' },
  { name: 'Header: User-Agent', category: 'HTTP Header', description: 'Identifies software client originating request', template: 'User-Agent: SudoLaunch/1.0' }
]

const fuse = new Fuse(HTTP_ENTRIES, {
  keys: ['name', 'description', 'category', 'template'],
  threshold: 0.35,
  ignoreLocation: true
})

export function search(query: string): SearchResultItem[] {
  const q = query.trim()
  const matches = q ? fuse.search(q).map((r) => r.item) : HTTP_ENTRIES.slice(0, 15)

  if (matches.length === 0) {
    return [
      {
        label: `No HTTP status code or header matching "${q}"`,
        sublabel: 'Try: /http 404 · /http 429 · /http bearer · /http unauthorized',
        value: '',
        disabled: true
      }
    ]
  }

  return matches.map((item) => ({
    label: item.name,
    sublabel: `${item.category} · ${item.description}`,
    value: item.template ?? (item.code ? `${item.code} ${item.name.replace(/^\d+\s*/, '')}` : item.name)
  }))
}

export async function execute(item: SearchResultItem): Promise<void> {
  if (item.value) {
    clipboard.writeText(item.value)
  }
}
