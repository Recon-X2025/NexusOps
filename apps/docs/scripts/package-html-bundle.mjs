import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.join(__dirname, "..");
const outDir = path.join(docsRoot, "html-export");
const pagesDir = path.join(docsRoot, ".next", "server", "pages");
const staticDir = path.join(docsRoot, ".next", "static");

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true });
}

function copyRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    if (fs.statSync(s).isDirectory()) copyRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

function walkCopyHtml(dir, relBase = "") {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.join(relBase, name);
    if (fs.statSync(full).isDirectory()) {
      walkCopyHtml(full, rel);
      continue;
    }
    if (!name.endsWith(".html")) continue;
    const dest = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(full, dest);
  }
}

if (!fs.existsSync(staticDir)) {
  console.error("Missing .next/static — run `pnpm build` in apps/docs first.");
  process.exit(1);
}
if (!fs.existsSync(pagesDir)) {
  console.error("Missing .next/server/pages — run `pnpm build` in apps/docs first.");
  process.exit(1);
}

rmrf(outDir);
fs.mkdirSync(outDir, { recursive: true });
copyRecursive(staticDir, path.join(outDir, "_next", "static"));
walkCopyHtml(pagesDir);

console.log(
  `Wrote static HTML bundle to ${path.relative(process.cwd(), outDir)}`,
);
console.log("Preview: pnpm preview:html  (or npx serve -l 3003 html-export)");
