'use client'

/**
 * [Velox Deep Scan v3.1 — PR4 polish]
 *
 * Collapsible diagnostic panel showing internals of a v=3 scan: wrapper
 * confidence breakdown, subfolder scoring per dimension, root file scoring,
 * pairing groups, batch prefix detected.
 *
 * Default collapsed. User clicks "Xem chi tiết" to expand. Useful for:
 * - Debugging unexpected pattern detection
 * - Verifying D5 wrapper scoring on borderline cases
 * - Understanding which subfolder scored which role
 */

import { useState } from 'react'
import { ChevronDown, ChevronRight, Bug } from 'lucide-react'
import type { ScanResultV3, ScanDiagnosticsV3 } from '@/lib/velox-helpers'

interface Props {
    result: ScanResultV3
}

export default function VeloxDiagnosticPanel({ result }: Props) {
    const [expanded, setExpanded] = useState(false)
    const d = result.diagnostics

    return (
        <div className="rounded-2xl bg-zinc-950/40 border border-white/8 overflow-hidden">
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-white/[0.03] transition-colors"
            >
                <div className="flex items-center gap-2">
                    <Bug size={12} className="text-zinc-500" />
                    <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">
                        Xem chi tiết — Diagnostic
                    </span>
                </div>
                {expanded ? (
                    <ChevronDown size={12} className="text-zinc-500" />
                ) : (
                    <ChevronRight size={12} className="text-zinc-500" />
                )}
            </button>

            {expanded && (
                <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
                    {/* Pattern rationale */}
                    <div>
                        <p className="text-[10px] font-bold uppercase text-zinc-500 mb-1">
                            Pattern detection rationale
                        </p>
                        <p className="text-[11px] text-zinc-300">
                            {d.patternDetectionRationale}
                        </p>
                    </div>

                    {/* Wrapper breakdown (D5) */}
                    {d.isWrapper && d.wrapperConfidenceBreakdown && (
                        <div>
                            <p className="text-[10px] font-bold uppercase text-zinc-500 mb-1">
                                D5 Wrapper confidence — {d.wrapperConfidenceBreakdown.total}/10
                            </p>
                            <div className="text-[11px] text-zinc-300 space-y-0.5 pl-2 border-l border-white/10">
                                <div>Structure (+1 subfolder + 0 root video): <span className="font-mono text-violet-300">+{d.wrapperConfidenceBreakdown.structure}</span></div>
                                <div>Non-video files (PDF / DOC): <span className="font-mono text-violet-300">+{d.wrapperConfidenceBreakdown.nonVideoFiles}</span></div>
                                <div>Keyword matching (brief / month): <span className="font-mono text-violet-300">+{d.wrapperConfidenceBreakdown.keywordMatch}</span></div>
                                <div className="font-bold mt-1">
                                    Total: <span className={`font-mono ${d.wrapperConfidenceBreakdown.total >= 6 ? 'text-emerald-300' : 'text-amber-300'}`}>{d.wrapperConfidenceBreakdown.total}</span> → {d.wrapperConfidenceBreakdown.total >= 6 ? 'Confirmed wrapper' : 'Soft wrapper (warning)'}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Counts */}
                    <div className="grid grid-cols-3 gap-2 text-[10px]">
                        <DiagStat label="Tổng video" value={d.totalVideoCountRecursive} />
                        <DiagStat label="Subfolders" value={d.totalSubfolderCount} />
                        <DiagStat label="Files dropped (depth > 4)" value={d.ignoredDeepFiles.length} />
                    </div>

                    {/* Batch prefix detected */}
                    {d.prefixDetected && (
                        <div>
                            <p className="text-[10px] font-bold uppercase text-zinc-500 mb-1">
                                Batch prefix detected (D1)
                            </p>
                            <code className="text-[11px] text-violet-300 bg-zinc-900/60 px-2 py-0.5 rounded">
                                "{d.prefixDetected}"
                            </code>
                        </div>
                    )}

                    {/* Subfolder scores */}
                    {d.subfolderScores.length > 0 && (
                        <SubfolderTable scores={d.subfolderScores} />
                    )}

                    {/* File scores */}
                    {d.fileScores && d.fileScores.length > 0 && (
                        <FileTable scores={d.fileScores} />
                    )}

                    {/* Pairing groups */}
                    {d.pairingGroups && d.pairingGroups.length > 0 && (
                        <PairingTable groups={d.pairingGroups} />
                    )}
                </div>
            )}
        </div>
    )
}

function DiagStat({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-lg bg-white/[0.03] border border-white/5 p-2">
            <p className="text-[9px] text-zinc-500 uppercase font-semibold">{label}</p>
            <p className="text-[14px] font-mono font-bold text-zinc-200 mt-0.5">{value}</p>
        </div>
    )
}

function SubfolderTable({ scores }: { scores: ScanDiagnosticsV3['subfolderScores'] }) {
    return (
        <details className="text-[11px]">
            <summary className="cursor-pointer text-[10px] font-bold uppercase text-zinc-500 hover:text-zinc-300">
                Subfolder scores ({scores.length})
            </summary>
            <div className="mt-2 overflow-auto max-h-[200px] custom-scrollbar">
                <table className="w-full text-[10px]">
                    <thead className="text-zinc-500">
                        <tr>
                            <th className="text-left px-1 py-1">Name</th>
                            <th className="text-left px-1 py-1">Role</th>
                            <th className="text-left px-1 py-1">br</th>
                            <th className="text-left px-1 py-1">p-br</th>
                            <th className="text-left px-1 py-1">bun</th>
                            <th className="text-left px-1 py-1">ar-s</th>
                            <th className="text-left px-1 py-1">ar-p</th>
                            <th className="text-left px-1 py-1">out</th>
                            <th className="text-left px-1 py-1">img</th>
                        </tr>
                    </thead>
                    <tbody>
                        {scores.map((s, i) => (
                            <tr key={i} className="border-t border-white/5">
                                <td className="px-1 py-1 truncate max-w-[120px]">{s.name}</td>
                                <td className="px-1 py-1 text-violet-300">{s.classifiedAs ?? '-'}</td>
                                <td className="px-1 py-1 font-mono">{s.scores.broll}</td>
                                <td className="px-1 py-1 font-mono">{s.scores.perVideoBroll}</td>
                                <td className="px-1 py-1 font-mono">{s.scores.bundle}</td>
                                <td className="px-1 py-1 font-mono">{s.scores.arollShared}</td>
                                <td className="px-1 py-1 font-mono">{s.scores.arollPerVideo}</td>
                                <td className="px-1 py-1 font-mono">{s.scores.outputContainer}</td>
                                <td className="px-1 py-1 font-mono">{s.scores.images}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </details>
    )
}

function FileTable({ scores }: { scores: NonNullable<ScanDiagnosticsV3['fileScores']> }) {
    return (
        <details className="text-[11px]">
            <summary className="cursor-pointer text-[10px] font-bold uppercase text-zinc-500 hover:text-zinc-300">
                Root file scores ({scores.length})
            </summary>
            <div className="mt-2 overflow-auto max-h-[200px] custom-scrollbar">
                <table className="w-full text-[10px]">
                    <thead className="text-zinc-500">
                        <tr>
                            <th className="text-left px-1 py-1">Name</th>
                            <th className="text-left px-1 py-1">Class</th>
                            <th className="text-left px-1 py-1">main</th>
                            <th className="text-left px-1 py-1">broll</th>
                            <th className="text-left px-1 py-1">shared</th>
                        </tr>
                    </thead>
                    <tbody>
                        {scores.map((s, i) => (
                            <tr key={i} className="border-t border-white/5">
                                <td className="px-1 py-1 truncate max-w-[140px]">{s.name}</td>
                                <td className="px-1 py-1 text-violet-300">{s.classifiedAs}</td>
                                <td className="px-1 py-1 font-mono">{s.scores.main}</td>
                                <td className="px-1 py-1 font-mono">{s.scores.broll}</td>
                                <td className="px-1 py-1 font-mono">{s.scores.sharedAsset}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </details>
    )
}

function PairingTable({ groups }: { groups: NonNullable<ScanDiagnosticsV3['pairingGroups']> }) {
    return (
        <details className="text-[11px]">
            <summary className="cursor-pointer text-[10px] font-bold uppercase text-zinc-500 hover:text-zinc-300">
                Pairing groups ({groups.length})
            </summary>
            <div className="mt-2 space-y-1.5">
                {groups.map((g, i) => (
                    <div key={i} className="rounded bg-white/[0.02] p-2 text-[10px]">
                        <p className="font-bold text-violet-300 mb-0.5">{g.basePart}</p>
                        <div className="space-y-0.5 text-zinc-400">
                            <div>Body: <span className="text-zinc-200">{g.bodyFile ?? '—'}</span></div>
                            <div>Hooks: <span className="text-zinc-200">{g.hooksFile ?? '—'}</span></div>
                            {g.extras.length > 0 && (
                                <div>Extras: <span className="text-zinc-200">{g.extras.join(', ')}</span></div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </details>
    )
}
