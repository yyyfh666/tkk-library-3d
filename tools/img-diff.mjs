/**
 * PNG 容差比对工具（零依赖：node 内置 zlib 解 PNG）。
 *
 * 为什么需要它：这个项目的截图回路里，岛上相机开着 autoRotate、大厅有机器人巡航、
 * 昼夜是"指数逼近"插值 —— 推进量都依赖帧时序，所以**同一份代码两次截图也不可能逐字节相同**。
 * 判断"回归有没有坏"不能用 md5，要用"差异有多大"。
 *
 * 用法：
 *   node tools/img-diff.mjs a.png b.png [--thresh=8] [--max-bad=0.5]
 *   输出：平均差 / 最大差 / 超阈值像素占比 / 前几个差异最大的采样点坐标
 *   退出码：差异在阈值内 = 0，超了 = 1（可直接串进脚本里当断言）
 */

import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

/* ------------------------------------------------------------------ *
 * 极简 PNG 解码：8bit、非隔行、colorType 2(RGB) 或 6(RGBA)
 * ------------------------------------------------------------------ */

function decodePng(path) {
  const buf = readFileSync(path)
  const sig = [137, 80, 78, 71, 13, 10, 26, 10]
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== sig[i]) throw new Error(`${path} 不是 PNG`)
  }

  let offset = 8
  let width = 0
  let height = 0
  let colorType = 0
  let bitDepth = 0
  let interlace = 0
  const idat = []

  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset)
    const type = buf.toString('ascii', offset + 4, offset + 8)
    const data = buf.subarray(offset + 8, offset + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      interlace = data[12]
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    offset += 12 + len
  }

  if (bitDepth !== 8) throw new Error(`${path}: 只支持 8bit（实际 ${bitDepth}）`)
  if (interlace !== 0) throw new Error(`${path}: 不支持隔行`)
  if (colorType !== 2 && colorType !== 6) throw new Error(`${path}: 只支持 RGB/RGBA（实际 ${colorType}）`)

  const bpp = colorType === 6 ? 4 : 3
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * bpp
  const out = Buffer.alloc(height * stride)

  // 逐行反滤波（PNG 规范里的 5 种 filter）
  const paeth = (a, b, c) => {
    const p = a + b - c
    const pa = Math.abs(p - a)
    const pb = Math.abs(p - b)
    const pc = Math.abs(p - c)
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
  }
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const src = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
    const dst = out.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? dst[x - bpp] : 0
      const b = prev ? prev[x] : 0
      const c = prev && x >= bpp ? prev[x - bpp] : 0
      let v = src[x]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) v += paeth(a, b, c)
      else if (filter !== 0) throw new Error(`未知 filter ${filter}`)
      dst[x] = v & 255
    }
  }

  return { width, height, bpp, data: out }
}

/* ------------------------------------------------------------------ *
 * 比对
 * ------------------------------------------------------------------ */

const args = process.argv.slice(2)
const paths = args.filter((a) => !a.startsWith('--'))
const opt = (name, dflt) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit ? Number(hit.split('=')[1]) : dflt
}

if (paths.length !== 2) {
  console.error('用法: node tools/img-diff.mjs a.png b.png [--thresh=8] [--max-bad=0.5]')
  process.exit(2)
}

const thresh = opt('thresh', 8) // 单通道差超过这个值就算"明显不同"
const maxBad = opt('max-bad', 0.5) // 明显不同的像素占比上限（%）

const A = decodePng(paths[0])
const B = decodePng(paths[1])
if (A.width !== B.width || A.height !== B.height || A.bpp !== B.bpp) {
  console.log(`尺寸/格式不同：${A.width}x${A.height}/${A.bpp} vs ${B.width}x${B.height}/${B.bpp}`)
  process.exit(1)
}

let sum = 0
let max = 0
let bad = 0
let maxAt = null
const total = A.width * A.height
for (let i = 0; i < total; i++) {
  const o = i * A.bpp
  const dr = Math.abs(A.data[o] - B.data[o])
  const dg = Math.abs(A.data[o + 1] - B.data[o + 1])
  const db = Math.abs(A.data[o + 2] - B.data[o + 2])
  const d = Math.max(dr, dg, db)
  sum += dr + dg + db
  if (d > max) {
    max = d
    maxAt = [i % A.width, Math.floor(i / A.width)]
  }
  if (d > thresh) bad++
}

const mean = sum / (total * 3)
const badPct = (bad / total) * 100
const pass = badPct <= maxBad

console.log(`${paths[1].split(/[\\/]/).pop()}`)
console.log(`  平均差 ${mean.toFixed(2)} / 最大差 ${max}（位于 ${maxAt ? maxAt.join(',') : '-'}）`)
console.log(`  超阈值(>${thresh})像素占比 ${badPct.toFixed(3)}%（上限 ${maxBad}%）→ ${pass ? '✔ 通过' : '✘ 超限'}`)
process.exit(pass ? 0 : 1)
