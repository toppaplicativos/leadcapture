import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cssPath = path.join(root, "frontend", "src", "index.css");
let css = fs.readFileSync(cssPath, "utf8");

// Remove minified recovered first-run block if present (starts at .aff-first-run)
// Keep aff-lib; only replace first-run styles with clean source.
const firstRunStart = css.search(/\.aff-first-run\{|\.aff-first-run \{/);
if (firstRunStart >= 0) {
  // Find start of next major recovered block or end - often after first-run is live terms
  const after = css.slice(firstRunStart);
  // If it's the minified recover chunk, it may run until affiliate-live or EOF
  const liveIdx = after.search(/\n\/\* Ao vivo|\.affiliate-live__blocker|\.affiliate-live__terms-sheet/);
  if (liveIdx > 0) {
    css = css.slice(0, firstRunStart) + css.slice(firstRunStart + liveIdx);
    console.log("stripped minified first-run before live css");
  } else {
    // strip from first-run to end of file if only first-run remains after
    // try cut at end of minified block: look for last-ish pattern
    const endMarker = after.indexOf(".aff-first-run__btn--ghost");
    if (endMarker >= 0) {
      const rest = after.slice(endMarker);
      const close = rest.indexOf("}");
      const next = rest.slice(close + 1);
      css = css.slice(0, firstRunStart) + next;
      console.log("stripped minified first-run via ghost btn end");
    }
  }
}

// Also remove any previous clean first-run block we may re-append
css = css.replace(/\n\/\* ── Affiliate first-run onboarding[\s\S]*?(?=\n\/\* |\n\.affiliate-live__|$)/g, "\n");
css = css.replace(/\n\/\* Affiliate first-run[\s\S]*?(?=\n\/\* |\n\.affiliate-live__|$)/g, "\n");

const cleanFirstRun = `
/* ── Affiliate first-run onboarding (partners app only) ── */
.aff-first-run {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: #0a0a0a;
  color: #ffffff;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.aff-first-run__shell {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 28rem;
  margin: 0 auto;
  min-height: 100%;
  min-height: 100dvh;
  overflow: hidden;
}
.aff-first-run__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: calc(0.65rem + env(safe-area-inset-top, 0px)) 1rem 0.4rem;
  flex-shrink: 0;
}
.aff-first-run__brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}
.aff-first-run__logo {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 0.5rem;
  object-fit: cover;
  flex-shrink: 0;
}
.aff-first-run__logo--fallback {
  display: grid;
  place-items: center;
  background: #262626;
  color: #ffffff;
  border: 1px solid rgba(255,255,255,0.12);
}
.aff-first-run__brand-name {
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #ffffff;
}
.aff-first-run__skip {
  border: 0;
  background: transparent;
  color: rgba(255,255,255,0.72);
  font-size: 0.8125rem;
  font-weight: 600;
  padding: 0.5rem 0.35rem;
  flex-shrink: 0;
}
.aff-first-run__skip:active { color: #ffffff; }
.aff-first-run__progress {
  height: 3px;
  margin: 0.25rem 1rem 0.65rem;
  background: rgba(255,255,255,0.14);
  border-radius: 999px;
  overflow: hidden;
  flex-shrink: 0;
}
.aff-first-run__progress-bar {
  height: 100%;
  border-radius: 999px;
  background: #ffffff;
  transition: width 280ms cubic-bezier(0.16, 1, 0.3, 1);
}

/* Mídia 1:1, full width — sem fade (evita linha de corte) */
.aff-first-run__media {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  max-height: min(42vh, 20rem);
  overflow: hidden;
  background: #141414;
  flex-shrink: 0;
  border-radius: 0;
}
.aff-first-run__media-el {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  display: block;
}

.aff-first-run__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 1.15rem 1.35rem 0.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.45rem;
}
.aff-first-run__kicker {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.72);
}
.aff-first-run__title {
  margin: 0.15rem 0 0;
  font-size: 1.5rem;
  font-weight: 800;
  letter-spacing: -0.035em;
  line-height: 1.15;
  color: #ffffff;
  text-wrap: balance;
  max-width: 18ch;
}
.aff-first-run__title-line {
  display: block;
}
.aff-first-run__text {
  margin: 0.35rem 0 0;
  font-size: 0.9375rem;
  line-height: 1.5;
  font-weight: 450;
  color: rgba(255,255,255,0.88);
  text-wrap: pretty;
  max-width: 34ch;
}
.aff-first-run__points {
  list-style: none;
  margin: 0.9rem 0 0;
  padding: 0;
  width: 100%;
  max-width: 22rem;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  text-align: left;
}
.aff-first-run__points li {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  font-size: 0.9rem;
  font-weight: 650;
  color: #ffffff;
  letter-spacing: -0.015em;
  padding: 0.65rem 0.75rem;
  border-radius: 0.9rem;
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.1);
}
.aff-first-run__point-icon {
  width: 2.15rem;
  height: 2.15rem;
  border-radius: 0.7rem;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: #ffffff;
  background: rgba(255,255,255,0.12);
  border: 1px solid rgba(255,255,255,0.1);
}
.aff-first-run__push-card {
  margin-top: 0.85rem;
  width: 100%;
  max-width: 22rem;
  padding: 0.95rem;
  border-radius: 1rem;
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.12);
  text-align: left;
}
.aff-first-run__push-row {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
}
.aff-first-run__push-title {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 750;
  color: #ffffff;
}
.aff-first-run__push-sub {
  margin: 0.25rem 0 0;
  font-size: 0.8125rem;
  line-height: 1.4;
  color: rgba(255,255,255,0.78);
}
.aff-first-run__check {
  margin-left: auto;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 999px;
  background: #10b981;
  color: #fff;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.aff-first-run__push-err {
  margin: 0.55rem 0 0;
  font-size: 0.8rem;
  color: #fca5a5;
}
.aff-first-run__push-btn {
  margin-top: 0.8rem;
  width: 100%;
  height: 2.85rem;
  border: 0;
  border-radius: 0.9rem;
  font-size: 0.9rem;
  font-weight: 750;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
}
.aff-first-run__push-btn:disabled { opacity: 0.55; }
.aff-first-run__ready-chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.4rem;
  margin-top: 0.85rem;
}
.aff-first-run__ready-chips span {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.4rem 0.7rem;
  border-radius: 999px;
  background: rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.92);
  border: 1px solid rgba(255,255,255,0.14);
}
.aff-first-run__ready-chips span.is-on {
  background: rgba(16, 185, 129, 0.22);
  border-color: rgba(16, 185, 129, 0.4);
  color: #6ee7b7;
}
.aff-first-run__footer {
  padding: 0.65rem 1.15rem calc(0.9rem + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  flex-shrink: 0;
  background: #0a0a0a;
}
.aff-first-run__dots {
  display: flex;
  justify-content: center;
  gap: 0.35rem;
}
.aff-first-run__dot {
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 999px;
  background: rgba(255,255,255,0.22);
  transition: width 200ms ease, background 200ms ease;
}
.aff-first-run__dot.is-on,
.aff-first-run__dot.is-done {
  background: #ffffff;
}
.aff-first-run__dot.is-on {
  width: 1.2rem;
}
.aff-first-run__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.aff-first-run__actions-spacer {
  width: 4.5rem;
  flex-shrink: 0;
}
.aff-first-run__btn {
  height: 2.9rem;
  border: 0;
  border-radius: 0.95rem;
  font-size: 0.9rem;
  font-weight: 750;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  padding: 0 1.05rem;
  letter-spacing: -0.015em;
}
.aff-first-run__btn--primary {
  flex: 1;
  min-width: 0;
}
.aff-first-run__btn--primary:active { transform: scale(0.98); }
.aff-first-run__btn--ghost {
  background: rgba(255,255,255,0.1);
  color: #ffffff;
  border: 1px solid rgba(255,255,255,0.14);
  flex-shrink: 0;
}
@media (prefers-reduced-motion: reduce) {
  .aff-first-run__progress-bar,
  .aff-first-run__dot,
  .aff-first-run__btn--primary { transition: none; }
}
`;

// Insert before live terms block if present, else append
const liveAnchor = css.indexOf("/* Ao vivo");
if (liveAnchor >= 0) {
  css = css.slice(0, liveAnchor) + cleanFirstRun + "\n" + css.slice(liveAnchor);
  console.log("inserted first-run before live block");
} else if (css.includes(".affiliate-live__terms-sheet")) {
  const i = css.indexOf(".affiliate-live__blocker");
  if (i >= 0) {
    // find comment or start
    css = css.slice(0, i) + cleanFirstRun + "\n" + css.slice(i);
    console.log("inserted first-run before blocker");
  } else {
    css = css.replace(/\s+$/, "") + "\n" + cleanFirstRun + "\n";
    console.log("appended first-run at end (terms present)");
  }
} else {
  css = css.replace(/\s+$/, "") + "\n" + cleanFirstRun + "\n";
  console.log("appended first-run at end");
}

fs.writeFileSync(cssPath, css, "utf8");
const v = fs.readFileSync(cssPath, "utf8");
if (v.includes("\uFFFD")) {
  console.error("UTF-8 broken");
  process.exit(1);
}
console.log({
  bytes: Buffer.byteLength(v, "utf8"),
  has_first: v.includes(".aff-first-run {") || v.includes(".aff-first-run{"),
  media_1_1: v.includes("aspect-ratio: 1 / 1"),
  no_fade: !v.includes("aff-first-run__media-fade"),
  text_center: v.includes("text-align: center"),
});
