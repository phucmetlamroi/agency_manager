'use client'

/**
 * [Velox Deep Scan v3.1 — UI section 6.5]
 *
 * Banner shown when scan detects briefing documents (PDF/DOCX/...) at the
 * root level. Toggle "Auto-append URL vào notes" (D4) — default ON.
 *
 * When toggle ON: each task's notes_vi gets the brief block appended at
 * apply time (maybeAppendBriefToNotes in velox-helpers.ts).
 */

import { FileText, ExternalLink } from 'lucide-react'
import type { BriefingDoc } from '@/lib/velox-helpers'

interface Props {
    briefingDocs: BriefingDoc[]
    appendToNotes: boolean
    onToggleAppend: (next: boolean) => void
}

const BRIEF_ICON: Record<BriefingDoc['type'], string> = {
    pdf: '📄',
    docx: '📝',
    doc: '📝',
    pptx: '📊',
    rtf: '📄',
    txt: '📄',
    other: '📎',
}

export default function VeloxBriefBanner({
    briefingDocs,
    appendToNotes,
    onToggleAppend,
}: Props) {
    if (briefingDocs.length === 0) return null

    return (
        <div
            className="rounded-2xl p-4 flex items-start gap-3"
            style={{
                background: 'rgba(99,102,241,0.08)',
                border: '1px solid rgba(99,102,241,0.30)',
            }}
        >
            <div className="p-2 rounded-xl bg-indigo-500/15 border border-indigo-500/30 shrink-0">
                <FileText size={16} className="text-indigo-300" />
            </div>
            <div className="flex-1 min-w-0">
                <h4 className="text-sm font-extrabold text-indigo-100 mb-1.5">
                    Brief đính kèm ({briefingDocs.length})
                </h4>
                <ul className="space-y-1.5 mb-3">
                    {briefingDocs.map((b, i) => (
                        <li key={i} className="flex items-center gap-2 text-[12px] text-indigo-200/90">
                            <span>{BRIEF_ICON[b.type]}</span>
                            <span className="truncate flex-1">{b.file.fullName}</span>
                            <a
                                href={b.file.previewUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-[10px] text-indigo-300 hover:text-indigo-200 shrink-0"
                            >
                                <ExternalLink size={10} />
                                Open
                            </a>
                        </li>
                    ))}
                </ul>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={appendToNotes}
                        onChange={(e) => onToggleAppend(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-white/20 bg-zinc-900 text-indigo-500"
                    />
                    <span className="text-[11px] text-indigo-200">
                        Auto-append URL vào notes mọi task (D4)
                    </span>
                </label>
            </div>
        </div>
    )
}
