import fs from "fs"
const p = "src/services/email/catalog.ts"
let s = fs.readFileSync(p, "utf8")
s = s.replace(/emailIconBadge\(\s*["'][^"']*["']\s*,/g, 'emailIconBadge("mark",')
fs.writeFileSync(p, s)
console.log("ok")
