/**
 * Verify the "Video N - Title" subfolder → bundle (one video) rule, and prove it
 * does NOT regress per-video b-roll / a-roll classification.
 * Run: npx tsx scripts/test-video-folder-detection.ts
 */
import { scoreSubfolder, classifySubfolderFromScores } from '../src/lib/scan-classifier-helpers'

function classify(name: string, videoCount = 2) {
  const scores = scoreSubfolder({
    name,
    videoCount,
    imageCount: 0,
    audioCount: 0,
    videoFilenames: Array.from({ length: videoCount }, (_, i) => `clip${i + 1}.mp4`),
  })
  return classifySubfolderFromScores(scores)
}

const cases: [string, string][] = [
  // NEW: real client folders from the screenshot → must become a video (bundle)
  ["Video 1 - The Buyer's Journey", 'bundle'],
  ['Video 2 - Why I Educate', 'bundle'],
  ["Video 5 - The 'I'm Not Ready' Myth", 'bundle'],
  ['Video 6 - Your First Home', 'bundle'],
  ['Video 4 - Navigating Life', 'bundle'],
  // backward-compat: bare bundle names still work
  ['Video 1', 'bundle'],
  ['AD 3', 'bundle'],
  ['Spot 2', 'bundle'],
  // REGRESSION GUARD: per-video b-roll / a-roll must NOT become a main video
  ['Video 1 - B-Roll', 'per-video-broll'],
  ['Video 3 - Broll', 'per-video-broll'],
  ['Video 2 A-Roll', 'aroll-pervideo'],
  // REGRESSION GUARD: shared b-roll / a-roll folders unchanged
  ['B-Roll', 'broll'],
  ['Footage', 'broll'],
  ['A-Roll', 'aroll-shared'],
]

let pass = 0, fail = 0
console.log('=== Video-N folder detection ===')
for (const [name, expect] of cases) {
  const got = classify(name)
  const ok = got === expect
  console.log(`  ${ok ? '✅' : '❌'} "${name}" → ${got}${ok ? '' : `  (expected ${expect})`}`)
  ok ? pass++ : fail++
}
console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
