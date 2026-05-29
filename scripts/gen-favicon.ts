/**
 * Generate favicon.ico (negative logo: white glyph on black circle) from
 * src/app/icon.svg. Produces a single 256×256 PNG-in-ICO (supported by all
 * modern browsers) so the tab icon matches the SVG favicon across browsers.
 *
 * Also writes a PNG preview for visual verification.
 *
 * Run: npx tsx scripts/gen-favicon.ts
 */
import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const root = process.cwd()

function pngToIco(png: Buffer, size: number): Buffer {
    const header = Buffer.alloc(6)
    header.writeUInt16LE(0, 0) // reserved
    header.writeUInt16LE(1, 2) // image type = icon
    header.writeUInt16LE(1, 4) // image count
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0) // width (0 means 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1) // height (0 means 256)
    entry.writeUInt8(0, 2)  // palette count
    entry.writeUInt8(0, 3)  // reserved
    entry.writeUInt16LE(1, 4)   // color planes
    entry.writeUInt16LE(32, 6)  // bits per pixel
    entry.writeUInt32LE(png.length, 8)  // size of PNG data
    entry.writeUInt32LE(6 + 16, 12)     // offset to PNG data
    return Buffer.concat([header, entry, png])
}

async function main() {
    const svg = readFileSync(join(root, 'src', 'app', 'icon.svg'))
    const png = await sharp(svg, { density: 384 }).resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()

    writeFileSync(join(root, 'src', 'app', 'favicon.ico'), pngToIco(png, 256))
    writeFileSync(join(root, 'scripts', 'favicon-preview.png'), png)

    console.log('✓ favicon.ico regenerated (256×256 PNG-in-ICO)')
    console.log('✓ preview: scripts/favicon-preview.png')
}

main().catch((e) => { console.error(e); process.exit(1) })
