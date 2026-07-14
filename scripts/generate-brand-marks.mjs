/**
 * Renders official monochrome LeadCapture brand marks (SVG → PNG).
 * Light theme: brand-mark.png (obsidian square)
 * Dark theme:  brand-mark-dark.png (white square)
 */
import sharp from "sharp"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const pairs = [
  ["frontend/public/brand-mark.svg", "brand-mark.png"],
  ["frontend/public/brand-mark-dark.svg", "brand-mark-dark.png"],
]
const sizes = [32, 64, 192, 512]
const dirs = ["frontend/public", "public"]

for (const [svgRel, baseName] of pairs) {
  const svg = fs.readFileSync(path.join(root, svgRel))
  for (const size of sizes) {
    const fileName = size === 192 ? baseName : baseName.replace(".png", `-${size}.png`)
    for (const dir of dirs) {
      const out = path.join(root, dir, fileName)
      await sharp(svg).resize(size, size).png().toFile(out)
      console.log("wrote", path.relative(root, out))
    }
  }
}
console.log("brand marks ok")
