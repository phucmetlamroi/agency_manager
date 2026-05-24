/**
 * Convert HustlyTasker_Speaking_Script_VN.md → professional PDF
 *
 * Light theme, print-friendly, Vietnamese-optimized:
 *   - A4 portrait, comfortable margins
 *   - Large readable body text (12pt) for reading aloud
 *   - Color-coded speaker badges (5 speakers)
 *   - Highlighted [pause] / [click] / [chỉ vào] visual cues
 *   - Important phrases auto-emphasized
 *   - Clean page breaks between slide sections
 *
 * Run: node build-script-pdf.mjs
 */

import { createRequire } from 'module'
import { readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
process.env.NODE_PATH = 'C:\\Users\\Dareu\\AppData\\Roaming\\npm\\node_modules'
require('module').Module._initPaths()

const { marked } = require('marked')
const puppeteer = require('puppeteer')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/* ════════════════════════════════════════════════════════════════════ */
/*  1. Read markdown + convert to HTML                                 */
/* ════════════════════════════════════════════════════════════════════ */

const mdPath = path.join(__dirname, 'HustlyTasker_Speaking_Script_VN.md')
const md = readFileSync(mdPath, 'utf8')

// Configure marked with GFM + heading IDs
marked.setOptions({
    gfm: true,
    breaks: false,
    headerIds: true,
})

let html = marked.parse(md)

// Post-process HTML for better presentation:
// 1. Wrap [pause] / [click] / [chỉ vào] etc. in <span class="cue">
html = html.replace(/\[([^\]]*?(?:pause|click|chỉ|nhấn mạnh|smile|cúi chào|đứng|hand off|tone|nhìn|pause)[^\]]*?)\]/gi,
    '<span class="cue">[$1]</span>')

// 2. Highlight emphasized phrases (already wrapped in <strong> by marked from **bold**)
// — these stay as bold but get color from CSS

// 3. Style slide section headers — already h2/h3 from marked, CSS handles
//    Add slide-section class to h2 that match "SLIDE X — ..."
html = html.replace(/<h2 id="[^"]*">([🎬💸🔥✨🚀📊👥🌟💵💰📈⚔️🎯][^<]+)<\/h2>/g,
    '<h2 class="slide-section">$1</h2>')

// 4. Add speaker badge styling — text like "**Người 1 nói:**" or "**Người 2 nói:**"
html = html.replace(/<strong>Người (\d) nói:<\/strong>/g,
    '<span class="speaker-badge speaker-p$1">🎤 Người $1 đang nói</span>')

// 5. Q&A questions
html = html.replace(/<h3 id="[^"]*">(Q\d+:[^<]+)<\/h3>/g,
    '<h3 class="qa-question">$1</h3>')

/* ════════════════════════════════════════════════════════════════════ */
/*  2. Build full HTML document with print-optimized CSS               */
/* ════════════════════════════════════════════════════════════════════ */

const fullHtml = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<title>HustlyTasker — Script Thuyết Trình</title>
<style>
  /* ─── Reset + base ──────────────────────────────────────────────── */
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: 'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    color: #1a1a2e;
    background: #ffffff;
    line-height: 1.55;
    font-size: 11.5pt;
  }

  /* ─── Page setup ────────────────────────────────────────────────── */
  @page {
    size: A4 portrait;
    margin: 18mm 14mm 18mm 14mm;
  }

  /* ─── Cover-style H1 (top of doc) ───────────────────────────────── */
  h1 {
    font-size: 26pt;
    font-weight: 800;
    color: #5b21b6;
    margin: 0 0 8pt 0;
    letter-spacing: -0.5px;
    border-bottom: 3px solid #8b5cf6;
    padding-bottom: 8pt;
  }

  /* ─── H2 — sections (slide N, Q&A, checklist) ───────────────────── */
  h2 {
    font-size: 18pt;
    font-weight: 800;
    color: #1e1b4b;
    margin: 18pt 0 8pt 0;
    padding: 6pt 12pt 6pt 12pt;
    background: linear-gradient(90deg, rgba(139,92,246,0.10) 0%, rgba(139,92,246,0.02) 60%, transparent 100%);
    border-left: 4px solid #8b5cf6;
    border-radius: 2px;
    page-break-after: avoid;
  }
  h2.slide-section {
    page-break-before: always;
    background: linear-gradient(135deg, #8b5cf6 0%, #d946ef 100%);
    color: white;
    border-left: none;
    padding: 14pt 16pt;
    font-size: 22pt;
    border-radius: 8pt;
    box-shadow: 0 4px 16px rgba(139,92,246,0.25);
    margin-top: 0;
  }
  /* First slide-section doesn't force page break (it would create extra blank page) */
  h2.slide-section:first-of-type {
    /* keep page break */
  }

  /* ─── H3 — sub-sections ─────────────────────────────────────────── */
  h3 {
    font-size: 14pt;
    font-weight: 700;
    color: #4c1d95;
    margin: 14pt 0 6pt 0;
    page-break-after: avoid;
  }
  h3.qa-question {
    background: #fef3c7;
    color: #78350f;
    padding: 8pt 12pt;
    border-left: 4px solid #f59e0b;
    border-radius: 4pt;
  }

  /* ─── Paragraphs ────────────────────────────────────────────────── */
  p {
    margin: 6pt 0 8pt 0;
    text-align: justify;
    hyphens: auto;
  }

  /* ─── Strong / Emphasis ─────────────────────────────────────────── */
  strong {
    color: #5b21b6;
    font-weight: 700;
  }
  em {
    color: #4338ca;
    font-style: italic;
  }

  /* ─── Speaker badge (auto-injected) ─────────────────────────────── */
  .speaker-badge {
    display: inline-block;
    padding: 4pt 10pt;
    border-radius: 16pt;
    font-size: 10pt;
    font-weight: 700;
    margin: 4pt 0 8pt 0;
    color: white;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }
  .speaker-p1 { background: linear-gradient(135deg, #8b5cf6, #6d28d9); }
  .speaker-p2 { background: linear-gradient(135deg, #06b6d4, #0891b2); }
  .speaker-p3 { background: linear-gradient(135deg, #10b981, #047857); }
  .speaker-p4 { background: linear-gradient(135deg, #f59e0b, #d97706); }
  .speaker-p5 { background: linear-gradient(135deg, #ec4899, #be185d); }

  /* ─── Visual cue chip ───────────────────────────────────────────── */
  .cue {
    display: inline-block;
    background: #fef9c3;
    color: #713f12;
    font-size: 9.5pt;
    font-style: italic;
    padding: 1pt 6pt;
    border-radius: 4pt;
    border: 1px solid #fde68a;
    margin: 0 2pt;
  }

  /* ─── Blockquote (script lines) ─────────────────────────────────── */
  blockquote {
    margin: 10pt 0 10pt 0;
    padding: 10pt 14pt;
    border-left: 4px solid #8b5cf6;
    background: #f5f3ff;
    border-radius: 0 6pt 6pt 0;
    color: #1e1b4b;
    font-size: 12pt;
    line-height: 1.6;
  }
  blockquote p {
    margin: 0;
  }

  /* ─── Lists ─────────────────────────────────────────────────────── */
  ul, ol {
    margin: 6pt 0 10pt 0;
    padding-left: 22pt;
  }
  li {
    margin: 3pt 0;
    line-height: 1.55;
  }
  /* Checkbox-style list items (containing [ ]) */
  li {
    list-style-type: '✓  ';
    color: #1a1a2e;
  }
  /* Re-style for nested or non-checklist lists */
  ol li, ul.numbered li {
    list-style: decimal;
  }

  /* ─── Tables ────────────────────────────────────────────────────── */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 10pt 0;
    font-size: 10.5pt;
    page-break-inside: avoid;
  }
  th {
    background: #ede9fe;
    color: #4c1d95;
    padding: 8pt 10pt;
    text-align: left;
    font-weight: 700;
    border: 1px solid #c4b5fd;
    font-size: 10pt;
  }
  td {
    padding: 7pt 10pt;
    border: 1px solid #e5e7eb;
    vertical-align: top;
  }
  tr:nth-child(even) td {
    background: #fafafa;
  }

  /* ─── Code / inline highlights ──────────────────────────────────── */
  code {
    background: #f3f4f6;
    color: #be185d;
    padding: 1pt 5pt;
    border-radius: 3pt;
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 10pt;
  }
  pre {
    background: #1e1b4b;
    color: #e0e7ff;
    padding: 10pt;
    border-radius: 6pt;
    overflow-x: auto;
    margin: 10pt 0;
    font-size: 10pt;
  }
  pre code {
    background: none;
    color: inherit;
    padding: 0;
  }

  /* ─── Horizontal rule ───────────────────────────────────────────── */
  hr {
    border: none;
    height: 1px;
    background: linear-gradient(90deg, transparent, #8b5cf6, transparent);
    margin: 20pt 0;
  }

  /* ─── Page break helpers ────────────────────────────────────────── */
  .page-break { page-break-before: always; }
  .no-break { page-break-inside: avoid; }

  /* ─── Cover page header (custom layout for top) ─────────────────── */
  .cover {
    page-break-after: always;
    text-align: center;
    padding: 80pt 0 0 0;
  }
  .cover-logo {
    font-size: 48pt;
    font-weight: 900;
    background: linear-gradient(135deg, #8b5cf6, #d946ef);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    margin-bottom: 12pt;
    letter-spacing: -1.5px;
  }
  .cover-subtitle {
    font-size: 18pt;
    color: #4c1d95;
    margin-bottom: 24pt;
    font-weight: 600;
  }
  .cover-tag {
    display: inline-block;
    background: linear-gradient(135deg, #8b5cf6, #6d28d9);
    color: white;
    padding: 10pt 20pt;
    border-radius: 24pt;
    font-size: 12pt;
    font-weight: 600;
    margin-top: 30pt;
    box-shadow: 0 6px 16px rgba(139,92,246,0.3);
  }
  .cover-divider {
    width: 60pt;
    height: 4pt;
    background: linear-gradient(90deg, #8b5cf6, #d946ef);
    margin: 20pt auto;
    border-radius: 2pt;
  }
  .cover-meta {
    font-size: 11pt;
    color: #6b7280;
    margin-top: 40pt;
    line-height: 1.8;
  }

  /* ─── Hide marked-added IDs visual artifacts ────────────────────── */
  h2 a, h3 a { text-decoration: none; color: inherit; }
</style>
</head>
<body>

<!-- ─── Cover Page ─── -->
<div class="cover">
  <div class="cover-logo">HustlyTasker</div>
  <div class="cover-subtitle">Script Thuyết Trình EXE101</div>
  <div class="cover-divider"></div>
  <div style="font-size: 15pt; color: #4c1d95; font-weight: 600;">
    Pitch Deck Speaking Guide · 15 phút
  </div>
  <div class="cover-tag">📋 5 Speaker · 13 Slide · Vietnamese Script</div>
  <div class="cover-meta">
    Nhóm thuyết trình · EXE101 — Khởi nghiệp · 2026<br>
    <span style="font-size: 10pt; color: #9ca3af;">Tài liệu nội bộ — chỉ dùng để practice trước thuyết trình</span>
  </div>
</div>

${html}

</body>
</html>`

const htmlPath = path.join(__dirname, '.tmp-script.html')
writeFileSync(htmlPath, fullHtml, 'utf8')
console.log(`✏️  HTML draft written: ${htmlPath}`)

/* ════════════════════════════════════════════════════════════════════ */
/*  3. Render to PDF via puppeteer                                     */
/* ════════════════════════════════════════════════════════════════════ */

const pdfPath = path.join(__dirname, 'HustlyTasker_Speaking_Script_VN.pdf')

const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
})
const page = await browser.newPage()
await page.setContent(fullHtml, { waitUntil: 'networkidle0' })

await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: {
        top: '18mm',
        right: '14mm',
        bottom: '18mm',
        left: '14mm',
    },
    displayHeaderFooter: true,
    headerTemplate: `
        <div style="font-size: 8pt; color: #9ca3af; padding: 4pt 14mm; width: 100%; display: flex; justify-content: space-between; font-family: sans-serif;">
            <span>HustlyTasker · Speaking Script</span>
            <span>EXE101 · 2026</span>
        </div>
    `,
    footerTemplate: `
        <div style="font-size: 9pt; color: #6b7280; padding: 4pt 14mm; width: 100%; display: flex; justify-content: space-between; font-family: sans-serif;">
            <span>Tài liệu nội bộ — không phát hành công khai</span>
            <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
        </div>
    `,
})

await browser.close()

console.log(`✅ PDF generated: ${pdfPath}`)
