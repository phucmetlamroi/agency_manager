/**
 * [Velox v4 — Adapter from RawScanTree (v3 cloud-scanner output) → VeloxScanInput]
 *
 * The cloud scanner already returns a recursive tree shape used by Velox v3
 * (`RawScanTree` + `RawScanSubfolder` from `src/lib/scan-classifier.ts`).
 * v4 has its own input shape (`VeloxScanInput`) tuned for the new triage +
 * classifier pipeline. This thin adapter lets the API route call the
 * existing scanner once and feed BOTH v3 and v4 from the same data.
 */

import type { FileEntry } from '@/lib/velox-helpers'
import type { RawScanTree, RawScanSubfolder } from '@/lib/scan-classifier'
import type {
    ScanInputFile,
    ScanInputFolder,
    ScanInputNode,
    VeloxScanInput,
} from './v4-types'

export function rawTreeToScanInput(
    raw: RawScanTree,
    provider: 'dropbox' | 'gdrive',
    rootName: string,
    clientId?: number,
): VeloxScanInput {
    const tree: ScanInputNode[] = [
        ...raw.rootFiles.map(fileEntryToScanInputFile),
        ...raw.rootSubfolders.map(subfolderToScanInputFolder),
    ]
    return {
        rootFolder: { provider, name: rootName, url: raw.rootUrl },
        tree,
        clientId,
    }
}

function fileEntryToScanInputFile(f: FileEntry): ScanInputFile {
    return {
        name: f.fullName,
        path: f.parentFolderPath
            ? `${f.parentFolderPath}/${f.fullName}`
            : f.fullName,
        url: f.previewUrl,
        isFolder: false,
        sizeBytes: f.sizeBytes,
    }
}

function subfolderToScanInputFolder(s: RawScanSubfolder): ScanInputFolder {
    return {
        name: s.name,
        path: s.fullPath,
        isFolder: true,
        children: [
            ...s.files.map(fileEntryToScanInputFile),
            ...s.subSubfolders.map(subfolderToScanInputFolder),
        ],
    }
}
