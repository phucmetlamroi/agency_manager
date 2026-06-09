/**
 * [Velox v4 — Preview route]
 *
 * Dev-only preview at `/velox-v4-preview`. Builds a synthetic LGR-style
 * scan tree, runs it through the v4 engine, and renders the result with
 * `<VeloxMultiHookMap>` so the visual direction can be reviewed without
 * needing a real Dropbox / Drive scan.
 *
 * Gated by NEXT_PUBLIC_ENABLE_VELOX_V4_PREVIEW so this never ships to
 * an end user accidentally. Set the env var to "1" to see it in dev.
 */

import { notFound } from 'next/navigation'
import VeloxV4PreviewClient from './VeloxV4PreviewClient'
import { runEngineV4 } from '@/lib/velox/v4-engine'
import type { ScanInputNode, VeloxScanInput } from '@/lib/velox/v4-types'

export const dynamic = 'force-dynamic'

export default function VeloxV4PreviewPage() {
    if (process.env.NEXT_PUBLIC_ENABLE_VELOX_V4_PREVIEW !== '1') {
        notFound()
    }
    const result = buildSampleResult()
    return (
        <main className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-100">
            <div className="max-w-7xl mx-auto">
                <h1 className="text-2xl font-bold tracking-tight mb-1">
                    Velox v4 · Multi-Hook Map — preview
                </h1>
                <p className="text-sm text-zinc-500 mb-6">
                    Synthetic LGR-style fixture. Read-only. Drag-drop + Auto/Manual
                    toggle land in P4.
                </p>
                <VeloxV4PreviewClient result={result} />
            </div>
        </main>
    )
}

function file(name: string): ScanInputNode {
    return { name, path: name, isFolder: false, url: `dbx://${encodeURIComponent(name)}`, sizeBytes: 240_000_000 }
}
function folder(name: string, children: ScanInputNode[]): ScanInputNode {
    return { name, path: name, isFolder: true, children }
}

function buildSampleResult() {
    const tree: ScanInputNode[] = [
        file('LGR Video 1 Hooks.mov'),
        file('LGR Video 1 Body.mov'),
        file('LGR Video 2 Hooks.mov'),
        file('LGR Video 2.mov'),
        file('LGR Video 3 Hooks.mov'),
        file('LGR Video 3.mov'),
        file('Main CTA.mp4'),
        // OBJ-style Video 1 stuffed in for the SUPERSEDED/PENDING preview
        folder('OBJ Video 1 sample', [
            file('H1.mp4'),
            file('H2 NO Use.mov'),
            file('H2 Replacement.mov'),
            file('H3.mp4'),
            file('H4 Future edits.mov'),
            file('Body 1.mov'),
            file('Body 2 20 seconds.mov'),
            file('Body 3.mov'),
            file('CTA 20 seconds.mp4'),
        ]),
        folder('Video 1 A Roll', [
            file('Nested Sequence 247.mp4'),
            file('Nested Sequence 248.mp4'),
        ]),
        folder('B-Roll', [
            file('Nested Sequence 300.mp4'),
            file('Nested Sequence 301.mp4'),
            file('Nested Sequence 302.mp4'),
        ]),
        file('weird-filename.mp4'),
        file('Random clip.mp4'),
    ]
    const input: VeloxScanInput = {
        rootFolder: { provider: 'dropbox', name: 'Velox v4 preview · LGR + OBJ', url: 'dbx://preview' },
        tree,
    }
    const { result } = runEngineV4(input)
    result.scannedAt = '__preview__'
    return result
}
