/**
 * Generates the PWA icon set.
 *
 * Written as a tiny PNG encoder rather than pulling in an image library: the
 * icon is a handful of flat shapes, so rasterising it directly keeps the
 * dependency tree at zero and makes the artwork a reviewable diff instead of
 * an opaque binary. Run with `npm run icons`.
 */

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

/*
 * The installed icon cannot follow the in-app palette, so it deliberately uses
 * neither: a deep neutral ground that sits comfortably next to the blue, the
 * terracotta and the green, with a warm cream loaf that still reads as bread.
 */
const CRUST = [0x2a, 0x2f, 0x37] // deep neutral slate ground
const CRUMB = [0xf7, 0xf2, 0xe8] // floured off-white loaf

// --- PNG encoding --------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = -1
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** `pixels` is RGBA, row-major, length = size * size * 4. */
function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // truecolour with alpha
  // 10–12: deflate, adaptive filtering, no interlace — all zero.

  // Each scanline needs a leading filter-type byte; 0 means "no filter".
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// --- The artwork ---------------------------------------------------------

/**
 * Coverage of the loaf and its scores at a point, in 0–1 unit coordinates.
 * `inset` shrinks the loaf so a maskable icon keeps clear of the safe zone.
 */
function sample(x, y, inset) {
  const cx = 0.5
  const baseY = 0.5 + 0.18 * inset
  const a = 0.36 * inset // dome half-width
  const b = 0.36 * inset // dome height

  const dx = (x - cx) / a
  const dy = (y - baseY) / b
  if (dx * dx + dy * dy > 1 || y > baseY) return 0

  // Three diagonal scores, clipped to an inner ellipse rather than given fixed
  // lengths — that is what makes them taper towards the edges the way a scored
  // boule actually looks. The clip ellipse sits high on the dome and stays
  // clear of both the crust and the flat base, so the scores can never cut
  // through the silhouette.
  const clipCy = baseY - 0.52 * b
  const cdx = (x - cx) / (0.62 * a)
  const cdy = (y - clipCy) / (0.42 * b)

  if (cdx * cdx + cdy * cdy <= 1) {
    const angle = (-34 * Math.PI) / 180
    const across =
      -(x - cx) * Math.sin(angle) + (y - clipCy) * Math.cos(angle)

    const halfThick = 0.022 * inset
    for (const offset of [-0.115 * inset, 0, 0.115 * inset]) {
      if (Math.abs(across - offset) < halfThick) {
        // Inside a score: punch back through to the crust colour.
        return 2
      }
    }
  }

  return 1
}

const SS = 3 // supersampling factor, for smooth edges

function render(size, { inset = 1, transparentBg = false } = {}) {
  const pixels = Buffer.alloc(size * size * 4)

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let crumb = 0
      let score = 0
      let samples = 0

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size
          const y = (py + (sy + 0.5) / SS) / size
          const v = sample(x, y, inset)
          if (v === 1) crumb++
          else if (v === 2) score++
          samples++
        }
      }

      const crumbFrac = crumb / samples
      const scoreFrac = score / samples
      const bgFrac = 1 - crumbFrac - scoreFrac

      // Scores are the background colour showing through the loaf, so they
      // blend with the background rather than being a third colour.
      const i = (py * size + px) * 4
      const bgWeight = bgFrac + scoreFrac
      for (let ch = 0; ch < 3; ch++) {
        pixels[i + ch] = Math.round(CRUST[ch] * bgWeight + CRUMB[ch] * crumbFrac)
      }
      pixels[i + 3] = transparentBg
        ? Math.round(255 * (crumbFrac + scoreFrac))
        : 255
    }
  }

  return encodePng(size, pixels)
}

// --- Output --------------------------------------------------------------

mkdirSync(OUT, { recursive: true })

const files = [
  ['pwa-192x192.png', render(192)],
  ['pwa-512x512.png', render(512)],
  // Maskable icons get cropped to a circle on some launchers, so the artwork
  // is pulled into the middle 60% safe zone.
  ['maskable-512x512.png', render(512, { inset: 0.62 })],
  ['apple-touch-icon.png', render(180)],
]

for (const [name, buf] of files) {
  writeFileSync(join(OUT, name), buf)
  console.log(`${name}  ${(buf.length / 1024).toFixed(1)} kB`)
}

// A vector favicon, drawn to match the raster icons.
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="18" fill="#2a2f37"/>
  <path d="M16 66a34 30 0 0 1 68 0z" fill="#f7f2e8"/>
  <rect x="16" y="66" width="68" height="3.5" fill="#f7f2e8"/>
  <g stroke="#2a2f37" stroke-width="5" stroke-linecap="round">
    <line x1="33" y1="57" x2="43" y2="41"/>
    <line x1="45" y1="61" x2="57" y2="40"/>
    <line x1="59" y1="57" x2="69" y2="45"/>
  </g>
</svg>
`
writeFileSync(join(OUT, 'favicon.svg'), favicon)
console.log('favicon.svg')
