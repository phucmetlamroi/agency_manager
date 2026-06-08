'use client'

import VeloxMultiHookMap from '@/components/velox/VeloxMultiHookMap'
import type { VeloxScanResult } from '@/lib/velox/v4-types'

export default function VeloxV4PreviewClient({ result }: { result: VeloxScanResult }) {
    return (
        <VeloxMultiHookMap
            result={result}
            onNodeOpen={(node) => {
                const f = node.files[0]
                if (!f) return
                // Dev preview: just log; in production this would open the
                // Dropbox/Drive preview URL in a new tab.
                console.log('open', node.role, node.label, f.url)
            }}
            onTrayFileClick={(f) => console.log('tray file', f)}
        />
    )
}
