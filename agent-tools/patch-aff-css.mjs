import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cssPath = path.join(root, "frontend", "src", "index.css");
const recoverPath = path.join(root, "frontend", "src", "aff-extra-recover.css");

let css = fs.readFileSync(cssPath, "utf8");

if (!css.includes(".aff-lib") && fs.existsSync(recoverPath)) {
  const recover = fs.readFileSync(recoverPath, "utf8");
  css = css.replace(/\s+$/, "") + "\n\n/* recovered affiliate materials + first-run (from dist) */\n" + recover + "\n";
  console.log("appended recover");
} else if (css.includes(".aff-lib")) {
  console.log("aff-lib already present");
} else {
  console.log("WARN: no aff-lib and no recover file");
}

const liveCss = `
/* Ao vivo — checklist e aceite de termos */
.affiliate-live__blocker {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  margin-top: 0.75rem;
  padding: 0.75rem 0.85rem;
  border-radius: 0.875rem;
  background: rgba(0,0,0,0.28);
  color: rgba(255,255,255,0.92);
  font-size: 0.8125rem;
  line-height: 1.4;
}
.affiliate-live__blocker > svg { flex-shrink: 0; margin-top: 0.1rem; opacity: 0.9; }
.affiliate-live__blocker button {
  flex-shrink: 0;
  height: 2rem;
  padding: 0 0.75rem;
  border: 0;
  border-radius: 0.65rem;
  background: #fff;
  color: #171717;
  font-size: 0.75rem;
  font-weight: 700;
  white-space: nowrap;
}
.affiliate-live__checklist {
  list-style: none;
  margin: 0.65rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.affiliate-live__checklist li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.55rem 0.7rem;
  border-radius: 0.75rem;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.1);
}
.affiliate-live__check-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(255,255,255,0.88);
}
.affiliate-live__check-cta {
  border: 0;
  background: transparent;
  color: #86efac;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.25rem 0.15rem;
  white-space: nowrap;
}
.affiliate-live__terms-sheet {
  max-height: min(88dvh, 40rem);
  display: flex;
  flex-direction: column;
  text-align: left !important;
}
.affiliate-live__terms-sheet h2,
.affiliate-live__terms-sheet > p {
  text-align: left;
}
.affiliate-live__terms-body {
  margin: 0.75rem 0;
  max-height: 40vh;
  overflow: auto;
  border-radius: 0.85rem;
  border: 1px solid #e5e5e5;
  background: #fafafa;
  padding: 0.85rem 1rem;
}
.affiliate-live__terms-html {
  font-size: 0.8125rem;
  line-height: 1.5;
  color: #404040;
}
.affiliate-live__terms-html p { margin: 0 0 0.65rem; }
.affiliate-live__terms-check {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #171717;
  margin: 0.25rem 0 0.75rem;
  cursor: pointer;
}
.affiliate-live__terms-check input {
  margin-top: 0.15rem;
  width: 1.05rem;
  height: 1.05rem;
  accent-color: #171717;
  flex-shrink: 0;
}
`;

if (!css.includes("affiliate-live__terms-sheet")) {
  css = css.replace(/\s+$/, "") + "\n" + liveCss + "\n";
  console.log("appended live terms css");
} else {
  console.log("live terms css already present");
}

fs.writeFileSync(cssPath, css, "utf8");
const verify = fs.readFileSync(cssPath, "utf8");
if (verify.includes("\uFFFD")) {
  console.error("UTF-8 replacement still present");
  process.exit(1);
}
console.log({
  bytes: Buffer.byteLength(verify, "utf8"),
  has_aff_lib: verify.includes(".aff-lib"),
  has_first: verify.includes("aff-first-run"),
  has_terms: verify.includes("affiliate-live__terms-sheet"),
});
