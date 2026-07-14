import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cssPath = path.join(root, 'frontend', 'src', 'index.css')

const buf = fs.readFileSync(cssPath)
// Decode leniently, strip anything after the campaign editor marker if present
let text = buf.toString('utf8')
// Also try latin1 if replacement chars dominate
if (text.includes('\uFFFD')) {
  text = buf.toString('latin1')
}

const markers = [
  '/* ── Campaign template tag editor',
  '/* --- Campaign template tag editor',
  '/* ── Campaign template tag editor',
  '.template-tag-editor {',
]

let cut = -1
for (const m of markers) {
  const i = text.indexOf(m)
  if (i >= 0 && (cut < 0 || i < cut)) cut = i
}

// Prefer cutting before our broken append; if template-tag appears only in good content...
// Find last clean email-template footer block end as safety
if (cut < 0) {
  // Look for invalid UTF-8 replacement sequences or mojibake near end
  const emailEnd = text.lastIndexOf('.email-template-card__footer { flex-direction: column; gap: .2rem; }')
  if (emailEnd >= 0) {
    const after = text.indexOf('}', emailEnd + 10)
    // find closing of media query after that
    const mqClose = text.indexOf('}', after + 1)
    if (mqClose > 0) cut = mqClose + 1
  }
}

if (cut >= 0) {
  // Only cut if what follows looks like our append
  const tail = text.slice(cut, cut + 80)
  if (tail.includes('template-tag') || tail.includes('Campaign template') || tail.includes('Campaign')) {
    text = text.slice(0, cut).replace(/\s+$/, '') + '\n'
    console.log('Stripped broken append from index', cut)
  } else {
    console.log('Found marker but not stripping; tail:', JSON.stringify(tail))
  }
} else {
  console.log('No campaign marker found; keeping file, length', text.length)
}

// Remove any trailing invalid high bytes by ensuring pure UTF-8 roundtrip
const clean = Buffer.from(text, 'utf8').toString('utf8')
// Drop unpaired surrogates / replacement if any remain at end from latin1 mis-decode
const finalText = clean.replace(/\uFFFD+/g, '')

const cssAddon = `

/* Campaign template tag editor — highlight {{variaveis}} */
.template-tag-editor {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.template-tag-editor__frame {
  position: relative;
  border-radius: 0.75rem;
  border: 1px solid #e5e7eb;
  background: #fff;
  overflow: hidden;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}
.template-tag-editor__frame:focus-within {
  border-color: #111827;
  box-shadow: 0 0 0 4px rgb(17 24 39 / 0.05);
}
.template-tag-editor__backdrop,
.template-tag-editor__textarea {
  margin: 0;
  width: 100%;
  min-height: 4.5rem;
  box-sizing: border-box;
  padding: 0.625rem 0.75rem;
  font-size: 0.75rem;
  line-height: 1.625;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  letter-spacing: 0;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
  tab-size: 2;
}
.template-tag-editor__backdrop {
  position: absolute;
  inset: 0;
  overflow: auto;
  pointer-events: none;
  color: #111827;
  background: transparent;
  z-index: 0;
  scrollbar-width: none;
}
.template-tag-editor__backdrop::-webkit-scrollbar { display: none; }
.template-tag-editor__textarea {
  position: relative;
  z-index: 1;
  display: block;
  resize: vertical;
  border: 0 !important;
  outline: none !important;
  box-shadow: none !important;
  background: transparent !important;
  color: transparent !important;
  caret-color: #111827;
  -webkit-text-fill-color: transparent;
}
.template-tag-editor__textarea::placeholder {
  color: #9ca3af;
  -webkit-text-fill-color: #9ca3af;
  opacity: 1;
}
.template-tag-editor__textarea::selection {
  background: color-mix(in srgb, var(--brand-secondary, #171717) 28%, transparent);
  color: transparent;
  -webkit-text-fill-color: transparent;
}
.template-tag-editor__mark {
  border-radius: 0.3rem;
  padding: 0.05em 0.15em;
  margin: 0 -0.05em;
  font-weight: 700;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}
.template-tag-editor__mark--ok {
  color: var(--brand-secondary, #171717);
  background: color-mix(in srgb, var(--brand-secondary, #171717) 16%, white);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--brand-secondary, #171717) 32%, transparent);
}
.template-tag-editor__mark--unknown {
  color: #b45309;
  background: #fffbeb;
  box-shadow: inset 0 0 0 1px #fcd34d;
}
.template-tag-editor__mark--broken {
  color: #b91c1c;
  background: #fef2f2;
  box-shadow: inset 0 0 0 1px #fca5a5;
  text-decoration: underline wavy #ef4444;
  text-underline-offset: 2px;
}
.template-tag-editor__status {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.75rem;
  font-size: 0.5625rem;
  font-weight: 600;
  line-height: 1.3;
  padding: 0 0.15rem;
}
.template-tag-editor__status-ok {
  color: var(--brand-secondary, #171717);
}
.template-tag-editor__status-warn {
  color: #b45309;
}
.template-tag-chip.is-used {
  border-color: color-mix(in srgb, var(--brand-secondary, #171717) 45%, transparent) !important;
  background: color-mix(in srgb, var(--brand-secondary, #171717) 12%, white) !important;
  color: var(--brand-secondary, #171717) !important;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--brand-secondary, #171717) 18%, transparent);
}
.template-tag-chip.is-used .template-tag-chip__token {
  opacity: 0.75;
  font-weight: 700;
}
`

// Avoid double-append
let out = finalText
if (!out.includes('.template-tag-editor {')) {
  out = out.replace(/\s+$/, '') + cssAddon
  console.log('Appended clean template-tag-editor CSS')
} else {
  console.log('CSS already contains template-tag-editor')
}

fs.writeFileSync(cssPath, out, { encoding: 'utf8' })
// Verify UTF-8
const verify = fs.readFileSync(cssPath)
const decoded = verify.toString('utf8')
if (decoded.includes('\uFFFD')) {
  console.error('WARN: replacement chars still present')
  process.exit(1)
}
console.log('OK index.css utf8, bytes=', verify.length, 'ends with:', JSON.stringify(decoded.slice(-80)))
