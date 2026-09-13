import { clipboard } from 'electron'
import Fuse from 'fuse.js'
import type { SearchResultItem } from '../../shared/types'

interface MimeEntry {
  mime: string
  extensions: string[]
  category: string
  description: string
}

const MIME_ENTRIES: MimeEntry[] = [
  // Web & Documents
  { mime: 'application/json', extensions: ['.json', '.map'], category: 'Application', description: 'JavaScript Object Notation data format' },
  { mime: 'application/ld+json', extensions: ['.jsonld'], category: 'Application', description: 'JSON Linked Data' },
  { mime: 'application/xml', extensions: ['.xml', '.xsl', '.xsd'], category: 'Application', description: 'Extensible Markup Language document' },
  { mime: 'text/html', extensions: ['.html', '.htm'], category: 'Text', description: 'HyperText Markup Language' },
  { mime: 'text/css', extensions: ['.css'], category: 'Text', description: 'Cascading Style Sheets' },
  { mime: 'text/javascript', extensions: ['.js', '.mjs', '.cjs'], category: 'Text / Code', description: 'JavaScript source code' },
  { mime: 'application/typescript', extensions: ['.ts', '.mts', '.cts'], category: 'Application / Code', description: 'TypeScript source code' },
  { mime: 'text/markdown', extensions: ['.md', '.markdown'], category: 'Text', description: 'Markdown formatted text document' },
  { mime: 'text/plain', extensions: ['.txt', '.log', '.env', '.conf', '.ini'], category: 'Text', description: 'Plain unformatted text file' },
  { mime: 'text/csv', extensions: ['.csv'], category: 'Text', description: 'Comma-Separated Values tabular data' },
  { mime: 'application/yaml', extensions: ['.yaml', '.yml'], category: 'Application', description: 'YAML Ain\'t Markup Language' },
  { mime: 'application/pdf', extensions: ['.pdf'], category: 'Application', description: 'Adobe Portable Document Format' },

  // Images
  { mime: 'image/webp', extensions: ['.webp'], category: 'Image', description: 'WebP modern compressed image format' },
  { mime: 'image/png', extensions: ['.png'], category: 'Image', description: 'Portable Network Graphics lossless image' },
  { mime: 'image/jpeg', extensions: ['.jpg', '.jpeg', '.jfif'], category: 'Image', description: 'JPEG lossy compressed image' },
  { mime: 'image/svg+xml', extensions: ['.svg', '.svgz'], category: 'Image / Vector', description: 'Scalable Vector Graphics' },
  { mime: 'image/avif', extensions: ['.avif'], category: 'Image', description: 'AV1 Image File Format next-gen compression' },
  { mime: 'image/gif', extensions: ['.gif'], category: 'Image', description: 'Graphics Interchange Format animated image' },
  { mime: 'image/x-icon', extensions: ['.ico', '.cur'], category: 'Image', description: 'Windows Icon file (favicons)' },
  { mime: 'image/tiff', extensions: ['.tif', '.tiff'], category: 'Image', description: 'Tagged Image File Format' },
  { mime: 'image/bmp', extensions: ['.bmp'], category: 'Image', description: 'Bitmap image file' },

  // Fonts
  { mime: 'font/woff2', extensions: ['.woff2'], category: 'Font', description: 'Web Open Font Format 2.0 (highly compressed)' },
  { mime: 'font/woff', extensions: ['.woff'], category: 'Font', description: 'Web Open Font Format 1.0' },
  { mime: 'font/ttf', extensions: ['.ttf'], category: 'Font', description: 'TrueType Font' },
  { mime: 'font/otf', extensions: ['.otf'], category: 'Font', description: 'OpenType Font' },

  // Audio & Video
  { mime: 'video/mp4', extensions: ['.mp4', '.m4v'], category: 'Video', description: 'MPEG-4 Part 14 video container' },
  { mime: 'video/webm', extensions: ['.webm'], category: 'Video', description: 'WebM open video format' },
  { mime: 'video/quicktime', extensions: ['.mov'], category: 'Video', description: 'Apple QuickTime video format' },
  { mime: 'audio/mpeg', extensions: ['.mp3'], category: 'Audio', description: 'MPEG Audio Layer III' },
  { mime: 'audio/wav', extensions: ['.wav'], category: 'Audio', description: 'Waveform Audio File Format' },
  { mime: 'audio/ogg', extensions: ['.oga', '.ogg', '.opus'], category: 'Audio', description: 'Ogg Vorbis / Opus audio' },
  { mime: 'audio/aac', extensions: ['.aac'], category: 'Audio', description: 'Advanced Audio Coding' },

  // Archives & Binaries
  { mime: 'application/zip', extensions: ['.zip'], category: 'Archive', description: 'ZIP compressed archive file' },
  { mime: 'application/gzip', extensions: ['.gz', '.tgz'], category: 'Archive', description: 'GNU zip compressed archive' },
  { mime: 'application/x-tar', extensions: ['.tar'], category: 'Archive', description: 'Tape Archive uncompressed tarball' },
  { mime: 'application/x-7z-compressed', extensions: ['.7z'], category: 'Archive', description: '7-Zip compressed archive' },
  { mime: 'application/wasm', extensions: ['.wasm'], category: 'Binary', description: 'WebAssembly binary executable format' },
  { mime: 'application/octet-stream', extensions: ['.bin', '.exe', '.dll', '.so', '.dmg', '.iso'], category: 'Binary', description: 'Arbitrary binary data stream' },

  // Office Suites
  { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extensions: ['.docx'], category: 'Office', description: 'Microsoft Word OpenXML Document' },
  { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extensions: ['.xlsx'], category: 'Office', description: 'Microsoft Excel OpenXML Spreadsheet' },
  { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', extensions: ['.pptx'], category: 'Office', description: 'Microsoft PowerPoint OpenXML Presentation' },
  { mime: 'application/msword', extensions: ['.doc'], category: 'Office', description: 'Microsoft Word 97-2003 Document' },
  { mime: 'application/vnd.ms-excel', extensions: ['.xls'], category: 'Office', description: 'Microsoft Excel 97-2003 Spreadsheet' }
]

const fuse = new Fuse(MIME_ENTRIES, {
  keys: ['mime', 'extensions', 'category', 'description'],
  threshold: 0.35,
  ignoreLocation: true
})

export function search(query: string): SearchResultItem[] {
  const raw = query.trim()
  const clean = raw.startsWith('.') ? raw : raw.toLowerCase()
  const list = clean ? fuse.search(clean).map((r) => r.item) : MIME_ENTRIES.slice(0, 16)

  if (list.length === 0) {
    return [
      {
        label: `No MIME type found matching "${raw}"`,
        sublabel: 'Try: /mime json · /mime .webp · /mime application/pdf · /mime video',
        value: '',
        disabled: true
      }
    ]
  }

  const results: SearchResultItem[] = []
  for (const item of list) {
    const exts = item.extensions.join(', ')
    results.push({
      label: `${item.mime} (${exts})`,
      sublabel: `${item.category} · ${item.description}`,
      value: item.mime
    })
    results.push({
      label: `Header: Content-Type: ${item.mime}`,
      sublabel: `HTTP header for ${exts}`,
      value: `Content-Type: ${item.mime}`
    })
  }

  return results
}

export async function execute(item: SearchResultItem): Promise<void> {
  if (item.value) {
    clipboard.writeText(item.value)
  }
}
