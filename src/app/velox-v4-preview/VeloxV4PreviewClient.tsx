'use client'

import { useState } from 'react'
import VeloxMultiHookMap from '@/components/velox/VeloxMultiHookMap'
import VeloxMultiHookMapEditor from '@/components/velox/VeloxMultiHookMapEditor'
import type { VeloxScanResult } from '@/lib/velox/v4-types'

export default function VeloxV4PreviewClient({ result }: { result: VeloxScanResult }) {
    const [tab, setTab] = useState<'readonly' | 'editor'>('editor')

    return (
        <div className="space-y-4">
            <div className="inline-flex items-center gap-0 rounded-full p-1 border border-white/10 bg-zinc-900/40">
                <TabBtn current={tab} value="editor" onClick={() => setTab('editor')}>
                    Editor (P4)
                </TabBtn>
                <TabBtn current={tab} value="readonly" onClick={() => setTab('readonly')}>
                    Read-only (P3)
                </TabBtn>
            </div>

            {tab === 'editor' ? (
                <VeloxMultiHookMapEditor
                    workspaceId="preview"
                    initialMap={result}
                    onChange={(m) => console.log('changed', m.stats)}
                />
            ) : (
                <VeloxMultiHookMap
                    result={result}
                    onNodeOpen={(node) => console.log('open', node.role, node.label)}
                    onTrayFileClick={(f) => console.log('tray file', f)}
                />
            )}
        </div>
    )
}

function TabBtn({
    current, value, onClick, children,
}: {
    current: 'readonly' | 'editor'
    value: 'readonly' | 'editor'
    onClick: () => void
    children: React.ReactNode
}) {
    const active = current === value
    return (
        <button
            type="button"
            onClick={onClick}
            className={[
                'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold transition-colors',
                active
                    ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-md shadow-violet-500/30'
                    : 'text-zinc-400 hover:text-white',
            ].join(' ')}
        >
            {children}
        </button>
    )
}
