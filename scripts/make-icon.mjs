// 生成品牌占位图标(1024×1024 PNG):炭黑底 + 共鸣青菱形,呼应设计系统 v11 形状母语。
// 用法:node scripts/make-icon.mjs && npm run tauri icon -- scripts/app-icon.png -o src-tauri/icons
// 正式品牌图标定稿后,替换 scripts/app-icon.png 重跑上述第二条命令即可。
import { writeFileSync } from 'node:fs'
import { deflateSync, crc32 } from 'node:zlib'

const SIZE = 1024
const CENTER = SIZE / 2

const px = new Uint8Array(SIZE * SIZE * 4)

function set(x, y, [r, g, b]) {
  const i = (y * SIZE + x) * 4
  px[i] = r
  px[i + 1] = g
  px[i + 2] = b
  px[i + 3] = 255
}

// 炭黑底 --ink #171A1C
const INK = [0x17, 0x1a, 0x1c]
// 共鸣青 --accent #4FA6AB
const ACCENT = [0x4f, 0xa6, 0xab]
// 亮青 --btn #72D5D1
const BTN = [0x72, 0xd5, 0xd1]

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const d = Math.abs(x - CENTER) + Math.abs(y - CENTER)
    if (d <= 120) set(x, y, BTN)
    else if (d <= 300) set(x, y, ACCENT)
    else set(x, y, INK)
  }
}

// ---- 最小 PNG 组装(8bit RGBA) ----
const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE)
for (let y = 0; y < SIZE; y++) {
  const rowStart = y * (SIZE * 4 + 1)
  raw[rowStart] = 0 // filter: none
  Buffer.from(px.buffer, y * SIZE * 4, SIZE * 4).copy(raw, rowStart + 1)
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body) >>> 0)
  return Buffer.concat([len, body, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // color type: RGBA

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
])

writeFileSync(new URL('./app-icon.png', import.meta.url), png)
console.log('scripts/app-icon.png written')
