// 生成品牌图标「调谐罗盘 · 浪纹版」(1024×1024 PNG)
// 语义: 黑漆底罗盘 = 保底进度 —— 40 组浪纹环 + 八向主刻度, 金弧 = 已垫 67/80, 中央切面五星 = 五星出货
// 视觉: 鸣潮黑金母语, 用色取自设计系统 v11 (低饱和金 #C8B783 家族 / 炭黑)
// 用法: node scripts/make-icon.mjs && npm run tauri icon -- scripts/app-icon.png -o src-tauri/icons
// (渲染用 macOS 自带 qlmanage 将 SVG 转位图, 开发环境为 macOS)
import { writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const D2R = Math.PI / 180
const pol = (cx, cy, r, deg) => [
  cx + r * Math.cos(deg * D2R),
  cy + r * Math.sin(deg * D2R),
]
const f = (n) => n.toFixed(1)

// 暖黑漆底
const bgDefs = `
  <radialGradient id="i-bg" cx="0.5" cy="0.42" r="0.75">
    <stop offset="0" stop-color="#191612"/><stop offset="0.65" stop-color="#100E0B"/><stop offset="1" stop-color="#0A0908"/>
  </radialGradient>
  <radialGradient id="i-warm" cx="0.5" cy="0.45" r="0.5">
    <stop offset="0" stop-color="#C8B783" stop-opacity="0.10"/><stop offset="1" stop-color="#C8B783" stop-opacity="0"/>
  </radialGradient>`

// 40 组锯齿浪纹环 (80 点交替半径) + 八向主刻度
const wave = []
for (let i = 0; i <= 80; i++) {
  const [x, y] = pol(512, 512, i % 2 === 0 ? 372 : 352, -90 + i * 4.5)
  wave.push(`${f(x)} ${f(y)}`)
}
const majors = []
for (let k = 0; k < 8; k++) {
  const [x1, y1] = pol(512, 512, 344, -90 + k * 45)
  const [x2, y2] = pol(512, 512, 380, -90 + k * 45)
  majors.push(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="#EFE0B0" stroke-width="3.5" stroke-opacity="0.95"/>`)
}

// 12 颗宝石菱点带
const jewels = []
for (let j = 0; j < 12; j++) {
  const [x, y] = pol(512, 512, 272, -90 + j * 30)
  jewels.push(`<polygon points="${f(x)},${f(y - 7)} ${f(x + 7)},${f(y)} ${f(x)},${f(y + 7)} ${f(x - 7)},${f(y)}" fill="#C8B783" fill-opacity="0.5"/>`)
}

// 保底进度弧: 已垫 67/80
const sweep = (67 / 80) * 360
const [ex, ey] = pol(512, 512, 322, -90 + sweep)

// 中央切面五星 (每瓣明暗交替)
const star = []
for (let i = 0; i < 10; i++) {
  const [x, y] = pol(512, 512, i % 2 === 0 ? 168 : 70, -90 + i * 36)
  star.push(`${f(x)},${f(y)}`)
}
const facets = []
for (let i = 0; i < 5; i++) {
  const [ox, oy] = pol(512, 512, 168, -90 + i * 72)
  const [ix, iy] = pol(512, 512, 70, -90 + 36 + i * 72)
  const [nx, ny] = pol(512, 512, 168, -90 + (i + 1) * 72)
  facets.push(`<polygon points="512,512 ${f(ox)},${f(oy)} ${f(ix)},${f(iy)}" fill="#000" opacity="0.10"/>`)
  facets.push(`<polygon points="512,512 ${f(ix)},${f(iy)} ${f(nx)},${f(ny)}" fill="#FFF6DC" opacity="0.05"/>`)
}

// 四向菱形方位标 (北向最亮)
const cardinals = []
for (let k = 0; k < 4; k++) {
  const [x, y] = pol(512, 512, 400, -90 + k * 90)
  const s = k === 0 ? 16 : 12
  cardinals.push(`<polygon points="${f(x)},${f(y - s)} ${f(x + s)},${f(y)} ${f(x)},${f(y + s)} ${f(x - s)},${f(y)}" fill="#EFE0B0" fill-opacity="${k === 0 ? 1 : 0.6}"/>`)
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs>
  <radialGradient id="i-lacq" cx="0.5" cy="0.42" r="0.6">
    <stop offset="0" stop-color="#241F14"/><stop offset="0.7" stop-color="#1A160E"/><stop offset="1" stop-color="#12100A"/>
  </radialGradient>
  <radialGradient id="i-disc" cx="0.5" cy="0.45" r="0.65">
    <stop offset="0" stop-color="#2A2417"/><stop offset="1" stop-color="#1C180F"/>
  </radialGradient>
  <radialGradient id="i-sg" cx="0.5" cy="0.48" r="0.5">
    <stop offset="0" stop-color="#EFE0B0" stop-opacity="0.20"/><stop offset="1" stop-color="#EFE0B0" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="i-arc" x1="190" y1="190" x2="834" y2="834" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#F2E3B4"/><stop offset="1" stop-color="#9A7F45"/>
  </linearGradient>
  <linearGradient id="i-gold" x1="0" y1="344" x2="0" y2="680" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#EFE0B0"/><stop offset="1" stop-color="#B49A5E"/>
  </linearGradient>
</defs>
<rect width="1024" height="1024" fill="#100E0B"/>
<rect width="1024" height="1024" fill="url(#i-bg)"/>
<rect width="1024" height="1024" fill="url(#i-warm)"/>
<circle cx="512" cy="512" r="400" fill="url(#i-lacq)"/>
<circle cx="512" cy="512" r="400" fill="none" stroke="#C8B783" stroke-width="2.5" stroke-opacity="0.9"/>
<polygon points="${wave.join(' ')}" fill="none" stroke="#C8B783" stroke-width="2.2" stroke-opacity="0.55" stroke-linejoin="round"/>
${majors.join('\n')}
<path d="M 512 190 A 322 322 0 1 1 ${f(ex)} ${f(ey)}" fill="none" stroke="url(#i-arc)" stroke-width="12"/>
<circle cx="${f(ex)}" cy="${f(ey)}" r="20" fill="#EFE0B0" opacity="0.28"/>
<circle cx="${f(ex)}" cy="${f(ey)}" r="10" fill="#FFF6DC"/>
<circle cx="512" cy="512" r="300" fill="none" stroke="#C8B783" stroke-width="1.5" stroke-opacity="0.5"/>
${jewels.join('\n')}
<circle cx="512" cy="512" r="252" fill="url(#i-disc)"/>
<circle cx="512" cy="512" r="252" fill="none" stroke="#C8B783" stroke-width="1" stroke-opacity="0.35"/>
<circle cx="512" cy="512" r="260" fill="url(#i-sg)"/>
<polygon points="${star.join(' ')}" fill="url(#i-gold)"/>
${facets.join('\n')}
${cardinals.join('\n')}
</svg>`

// SVG 母版入库 (scripts/app-icon.svg), 经 qlmanage 渲染为 1024 PNG
const svgPath = new URL('./app-icon.svg', import.meta.url).pathname
writeFileSync(svgPath, svg)
execFileSync('qlmanage', ['-t', '-s', '1024', '-o', new URL('.', import.meta.url).pathname, svgPath], { stdio: 'pipe' })
rmSync(new URL('./app-icon.png', import.meta.url).pathname, { force: true })
execFileSync('mv', [
  new URL('./app-icon.svg.png', import.meta.url).pathname,
  new URL('./app-icon.png', import.meta.url).pathname,
])
console.log('scripts/app-icon.svg + scripts/app-icon.png written (调谐罗盘 · 浪纹版)')
