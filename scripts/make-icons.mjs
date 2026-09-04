/**
 * Génère les icônes PWA à partir d'un pixel art défini ici même.
 *
 * Aucune dépendance : l'encodeur PNG tient en quelques lignes (zlib fait le
 * gros du travail), ce qui évite d'ajouter `sharp` juste pour trois fichiers.
 *
 *   node scripts/make-icons.mjs
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// Palette
const COLORS = {
  '.': [0, 0, 0, 0], // transparent
  B: [27, 16, 51, 255], // fond violet nuit
  G: [242, 193, 78, 255], // or
  D: [168, 132, 47, 255], // or sombre
  R: [229, 72, 77, 255], // rouge
}

// Cœur 16×16 avec un tracé d'ECG en creux : santé + jeu, lisible même en 32 px.
const HEART = [
  '................',
  '...GGG...GGG....',
  '..GGGGG.GGGGG...',
  '.GGGGGGGGGGGGG..',
  '.GGGGGGGGGGGGG..',
  '.GGGGGGGGGGGGG..',
  '.GGDGGGGGGGGGG..',
  '.GGDGGDGGGGGGG..',
  '.GDDGDGDGDDGGG..',
  '..GGGDGGDGGGG...',
  '...GGGGGGGGG....',
  '....GGGGGGG.....',
  '.....GGGGG......',
  '......GGG.......',
  '.......G........',
  '................',
]

/** Calcule le CRC32 d'un buffer (table générée à la volée). */
const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let crc = -1
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ -1) >>> 0
}

/** Assemble un chunk PNG (longueur + type + données + CRC). */
function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData))
  return Buffer.concat([length, typeAndData, crc])
}

/** Encode un tableau RGBA (largeur × hauteur) en PNG. */
function encodePng(pixels, width, height) {
  const raw = Buffer.alloc(height * (width * 4 + 1))
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1)
    raw[rowStart] = 0 // filtre "None"
    for (let x = 0; x < width; x += 1) {
      const source = (y * width + x) * 4
      const target = rowStart + 1 + x * 4
      raw[target] = pixels[source]
      raw[target + 1] = pixels[source + 1]
      raw[target + 2] = pixels[source + 2]
      raw[target + 3] = pixels[source + 3]
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // 8 bits par canal
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * Dessine l'icône : fond plein + motif agrandi au plus proche voisin.
 * `inset` réserve la marge de sécurité exigée par les icônes maskable.
 */
function renderIcon(size, { inset = 0, background = COLORS.B } = {}) {
  const pixels = Buffer.alloc(size * size * 4)

  for (let i = 0; i < size * size; i += 1) {
    pixels[i * 4] = background[0]
    pixels[i * 4 + 1] = background[1]
    pixels[i * 4 + 2] = background[2]
    pixels[i * 4 + 3] = background[3]
  }

  const artSize = Math.floor(size * (1 - inset))
  const scale = Math.max(1, Math.floor(artSize / HEART.length))
  const drawn = scale * HEART.length
  const offset = Math.floor((size - drawn) / 2)

  for (let row = 0; row < HEART.length; row += 1) {
    for (let col = 0; col < HEART[row].length; col += 1) {
      const color = COLORS[HEART[row][col]]
      if (!color || color[3] === 0) continue

      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const x = offset + col * scale + dx
          const y = offset + row * scale + dy
          if (x < 0 || y < 0 || x >= size || y >= size) continue
          const index = (y * size + x) * 4
          pixels[index] = color[0]
          pixels[index + 1] = color[1]
          pixels[index + 2] = color[2]
          pixels[index + 3] = color[3]
        }
      }
    }
  }

  return encodePng(pixels, size, size)
}

const outputDir = join(ROOT, 'public', 'icons')
mkdirSync(outputDir, { recursive: true })

const targets = [
  { file: 'icon-192.png', size: 192, options: { inset: 0.12 } },
  { file: 'icon-512.png', size: 512, options: { inset: 0.12 } },
  // Maskable : le système peut rogner jusqu'à 20 % sur les bords.
  { file: 'icon-512-maskable.png', size: 512, options: { inset: 0.35 } },
]

for (const target of targets) {
  writeFileSync(join(outputDir, target.file), renderIcon(target.size, target.options))
  console.log(`✓ public/icons/${target.file} (${target.size}×${target.size})`)
}

// Favicon SVG : net à toutes les tailles, et sert de repli hors PWA.
const svgRows = HEART.flatMap((row, y) =>
  [...row].flatMap((cell, x) => {
    const color = COLORS[cell]
    if (!color || color[3] === 0) return []
    const hex = `#${color.slice(0, 3).map((c) => c.toString(16).padStart(2, '0')).join('')}`
    return [`<rect x="${x}" y="${y}" width="1" height="1" fill="${hex}"/>`]
  }),
)

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
<rect width="16" height="16" fill="#1b1033"/>
${svgRows.join('\n')}
</svg>
`

writeFileSync(join(ROOT, 'public', 'favicon.svg'), svg)
console.log('✓ public/favicon.svg')
