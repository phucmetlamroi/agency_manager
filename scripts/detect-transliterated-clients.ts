/**
 * [Invoice i18n] READ-ONLY audit — find client names that look Vietnamized / transliterated.
 *
 * Why: the agency's CLIENTS are foreign (English) so their names should be plain Latin
 * ("Jacob", "Vincent"). A now-frozen one-off importer (src/app/api/import-jan-2026) ran a
 * name through an LLM at ingest and stored Vietnamese transliterations like "Gia-cốp" (= Jacob),
 * "Giô-sép" (= Joseph), "Đa-vít" (= David). The LIVE app no longer translates names — this is
 * stale STORED DATA. It can't be reversed automatically (you'd risk mangling a genuinely
 * Vietnamese sub-client name), so this script only LISTS suspects for a human to review + fix.
 *
 * It writes NOTHING. To correct a row, use the admin "edit client name" UI (writes verbatim),
 * or an explicit reviewed UPDATE.
 *
 * Usage (defaults to the DATABASE_URL in .env — point it at the DB you want to audit):
 *   npx tsx scripts/detect-transliterated-clients.ts
 */
import fs from 'fs'

// tsx doesn't auto-load .env — load it so DATABASE_URL resolves.
try {
  const env = fs.readFileSync('.env', 'utf8')
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
} catch { /* env already in shell */ }

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

// Vietnamese-specific precomposed letters (đ/Đ + every toned vowel). English/Latin names
// (Jacob, Vincent, O'Brien, José→has diacritic but Spanish is rare here) won't match these.
const VN_DIACRITICS =
  /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ]/

// Bible/transliteration shape: hyphen-joined syllables, e.g. "Gia-cốp", "Giô-sép", "Đa-vít",
// "A-đam", "Mai-cơ". A strong secondary signal even when diacritics are subtle.
const HYPHENATED_SYLLABLES = /^[A-Za-zÀ-ỹ]{1,5}(-[A-Za-zÀ-ỹ]{1,6})+$/

async function main() {
  const masked = (process.env.DATABASE_URL || '').replace(/:[^:@/]+@/, ':***@').slice(0, 70)
  console.log('=== READ-ONLY: detect Vietnamized client names ===')
  console.log(`DB: ${masked}...\n`)

  const clients = await prisma.client.findMany({
    select: {
      id: true, name: true, parentId: true, workspaceId: true, profileId: true, status: true,
      parent: { select: { name: true } },
    },
    orderBy: { name: 'asc' },
  })

  const flagged = clients.filter((c) => {
    const n = (c.name || '').trim()
    if (!n) return false
    return VN_DIACRITICS.test(n) || HYPHENATED_SYLLABLES.test(n)
  })

  if (flagged.length === 0) {
    console.log(`✅ No suspicious client names found across ${clients.length} clients.`)
  } else {
    console.log(`⚠️  ${flagged.length} of ${clients.length} client names look Vietnamized / transliterated — REVIEW MANUALLY:\n`)
    console.log('  id'.padEnd(40) + 'name'.padEnd(28) + 'parent'.padEnd(20) + 'status')
    console.log('  ' + '─'.repeat(94))
    for (const c of flagged) {
      const reason = VN_DIACRITICS.test(c.name) ? 'VN-diacritics' : 'hyphen-syllables'
      console.log(
        '  ' +
          String(c.id).padEnd(38) +
          (c.name || '').slice(0, 26).padEnd(28) +
          (c.parent?.name || '—').slice(0, 18).padEnd(20) +
          `${c.status}  [${reason}]`,
      )
    }
    console.log(
      `\nNext: for each TRUE mistranslation (e.g. "Gia-cốp" → "Jacob"), recover the original\n` +
      `Latin spelling from the source brief/email and correct it via the admin edit-client UI\n` +
      `(writes the name verbatim). Do NOT machine-translate back. Genuinely Vietnamese local\n` +
      `client/brand names that legitimately use diacritics can be left as-is.`,
    )
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
