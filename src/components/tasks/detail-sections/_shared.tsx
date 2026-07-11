"use client"

// [P2-01] Shared, STATELESS primitives extracted verbatim from TaskDetailModal.
// Pure presentational — no server actions, no task state. Both the desktop modal
// (TaskDetailModal) and the mobile full-screen route (P2-PR3) import these so the
// two surfaces stay visually identical. Moving these here does NOT change render
// output (DR-3 safe by construction).

import React, { useState, useEffect } from "react"
import DOMPurify from 'dompurify'
import { cn } from "@/lib/utils"
import { taskTypeLabel } from "@/lib/display-labels"
import {
    X, Pencil, LayoutGrid, FolderOpen, ExternalLink, Check, Plus,
} from "lucide-react"

/* ────────────────────────────────────────────────────────────────────── */
/*  Shared form shape (live values for display + base for save merging)    */
/* ────────────────────────────────────────────────────────────────────── */

export type TaskDetailForm = {
    productLink: string
    deadline: string
    jobPriceUSD: number
    value: number
    linkRaw: string
    linkBroll: string
    submissionFolder: string
    references: string
    scriptLink: string
    collectFilesLink: string
    notes: string
}

/* ────────────────────────────────────────────────────────────────────── */
/*  DOMPurify global hook: force every anchor in sanitized HTML to open in  */
/*  a new tab. Runs once at module load (DOMPurify is a singleton, so this   */
/*  applies to ALL .sanitize() calls in this module + downstream consumers). */
/*  Guard with a global flag so HMR / multiple imports don't stack hooks.    */
/* ────────────────────────────────────────────────────────────────────── */

declare global {
    // eslint-disable-next-line no-var
    var __taskDetailDompurifyLinkHookRegistered: boolean | undefined
}
if (typeof window !== 'undefined' && !globalThis.__taskDetailDompurifyLinkHookRegistered) {
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
        if (node.tagName === 'A') {
            node.setAttribute('target', '_blank')
            node.setAttribute('rel', 'noopener noreferrer')
        }
    })
    globalThis.__taskDetailDompurifyLinkHookRegistered = true
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Status / Type maps                                                     */
/* ────────────────────────────────────────────────────────────────────── */

// [P3] STATUS_COLORS/TYPE_COLORS/getStatusInfo/getTypeInfo moved verbatim to the
// server-safe '@/lib/status-colors' (this file is "use client" → can't be imported by
// RSC dashboard code). Imported here (for internal use below) AND re-exported so every
// existing P2 consumer keeps working and both surfaces share ONE map. Values unchanged
// → desktop render identical (DR-3 safe).
import { STATUS_COLORS, TYPE_COLORS, getStatusInfo, getTypeInfo } from '@/lib/status-colors'
export { STATUS_COLORS, TYPE_COLORS, getStatusInfo, getTypeInfo }

/* ────────────────────────────────────────────────────────────────────── */
/*  Helpers                                                                */
/* ────────────────────────────────────────────────────────────────────── */

export function formatDate(d: Date | string | null): string {
    if (!d) return '—'
    const dt = new Date(d)
    if (isNaN(dt.getTime())) return '—'
    const pad = (n: number) => (n < 10 ? '0' + n : String(n))
    return `${dt.getFullYear()} - ${pad(dt.getMonth() + 1)} - ${pad(dt.getDate())}  ·  ${pad(dt.getHours())}:${pad(dt.getMinutes())}`
}

export function parseContent(content: string | null): string {
    if (!content) return ''
    if (/<[a-z][\s\S]*>/i.test(content)) return content
    return content.split('\n').filter((l) => l.trim()).map((l) => `<p>${l}</p>`).join('')
}

export function formatLink(link: string | null) {
    if (!link) return '#'
    if (link.startsWith('http')) return link
    return `https://${link}`
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Card wrapper                                                           */
/* ────────────────────────────────────────────────────────────────────── */

export function Card({
    title,
    children,
    className = '',
    rightSlot,
}: {
    title?: string
    children: React.ReactNode
    className?: string
    rightSlot?: React.ReactNode
}) {
    return (
        <div
            className={cn(
                "rounded-2xl bg-white/[0.04] border border-[rgba(139,92,246,0.12)] p-4 flex flex-col",
                className,
            )}
        >
            {(title || rightSlot) && (
                <div className="flex items-center justify-between mb-3">
                    {title && (
                        <h4 className="text-[12px] font-bold uppercase tracking-wide text-zinc-400">
                            {title}
                        </h4>
                    )}
                    {rightSlot}
                </div>
            )}
            {children}
        </div>
    )
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Pills                                                                  */
/* ────────────────────────────────────────────────────────────────────── */

export function StatusPill({ status }: { status: string }) {
    const s = getStatusInfo(status)
    return (
        <span
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold"
            style={{ background: s.bg, color: s.color, border: `1px solid color-mix(in srgb, ${s.color} 18.82%, transparent)` }}
        >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
            {s.label}
        </span>
    )
}
export function TypePill({ type }: { type: string }) {
    if (!type) return null
    const t = getTypeInfo(type)
    return (
        <span
            className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold"
            style={{ background: t.bg, color: t.color, border: `1px solid color-mix(in srgb, ${t.color} 18.82%, transparent)` }}
        >
            {taskTypeLabel(type)}
        </span>
    )
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Tab navigation                                                         */
/* ────────────────────────────────────────────────────────────────────── */

export function TabNav({
    activeTab,
    onChange,
}: {
    activeTab: 'main' | 'assets'
    onChange: (tab: 'main' | 'assets') => void
}) {
    const tabs = [
        { id: 'main' as const, label: 'Chính', icon: LayoutGrid },
        { id: 'assets' as const, label: 'Tài nguyên', icon: FolderOpen },
    ]
    return (
        <div className="mx-6 my-4 flex items-center bg-white/[0.04] border border-white/5 rounded-full p-1">
            {tabs.map((tab) => {
                const isActive = activeTab === tab.id
                const Icon = tab.icon
                return (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => onChange(tab.id)}
                        className={cn(
                            "flex-1 flex items-center justify-center gap-2 py-2 rounded-full text-[13px] font-semibold transition-colors",
                            isActive
                                ? "bg-white/[0.08] text-white shadow-[0_2px_8px_rgba(139,92,246,0.15)]"
                                : "text-zinc-400 hover:text-zinc-200",
                        )}
                    >
                        <Icon size={14} strokeWidth={1.8} />
                        {tab.label}
                    </button>
                )
            })}
        </div>
    )
}

/* ────────────────────────────────────────────────────────────────────── */
/*  LinkRow — per-field inline edit + named hyperlink display              */
/* ────────────────────────────────────────────────────────────────────── */

export function LinkRow({
    label,
    value,
    canEdit,
    onSave,
}: {
    label: string
    value: string
    canEdit: boolean
    onSave: (newValue: string) => Promise<void>
}) {
    const [isEditing, setIsEditing] = useState(false)
    const [draft, setDraft] = useState(value)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        setDraft(value)
    }, [value])

    const startEdit = () => {
        setDraft(value)
        setIsEditing(true)
    }
    const cancelEdit = () => {
        setDraft(value)
        setIsEditing(false)
    }
    const handleConfirm = async () => {
        if (saving) return
        if (draft.trim() === value.trim()) {
            setIsEditing(false)
            return
        }
        setSaving(true)
        try {
            await onSave(draft.trim())
            setIsEditing(false)
        } finally {
            setSaving(false)
        }
    }

    if (isEditing) {
        return (
            <div className="flex items-center gap-2 py-2 border-b border-white/5 last:border-0">
                <span className="text-[12px] font-medium text-zinc-300 flex-shrink-0 w-[120px]">
                    {label}
                </span>
                <input
                    type="url"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') handleConfirm()
                        if (e.key === 'Escape') cancelEdit()
                    }}
                    autoFocus
                    placeholder="Dán link…"
                    className="flex-1 h-8 rounded-full bg-white/[0.06] border border-violet-500/40 px-3 text-[12px] text-zinc-200 placeholder:text-muted-foreground outline-none focus:border-violet-500"
                />
                <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={saving}
                    title="Xác nhận"
                    className="w-7 h-7 flex items-center justify-center rounded-full bg-primary hover:bg-primary-accent text-white disabled:opacity-50 transition-colors"
                >
                    <Check size={13} strokeWidth={3} />
                </button>
                <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={saving}
                    title="Huỷ"
                    className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-zinc-400 disabled:opacity-50 transition-colors"
                >
                    <X size={13} />
                </button>
            </div>
        )
    }

    return (
        <div className="flex items-center justify-between gap-3 py-2 border-b border-white/5 last:border-0 group">
            <span className="text-[12px] font-medium text-zinc-300 flex-shrink-0">{label}</span>
            <div className="flex items-center gap-2 min-w-0">
                {value?.trim() ? (
                    <a
                        href={formatLink(value)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[12px] text-violet-400 hover:text-violet-300 truncate max-w-[180px]"
                        title={value}
                    >
                        <span className="truncate">Xem {label}</span>
                        <ExternalLink size={11} className="flex-shrink-0" />
                    </a>
                ) : canEdit ? (
                    <button
                        type="button"
                        onClick={startEdit}
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-violet-300 transition-colors"
                    >
                        <Plus size={11} />
                        Thêm link
                    </button>
                ) : (
                    <span className="text-[12px] text-muted-foreground">Chưa có</span>
                )}
                {canEdit && value?.trim() && (
                    <button
                        type="button"
                        onClick={startEdit}
                        title="Sửa"
                        className="opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/[0.06]"
                    >
                        <Pencil size={11} className="text-muted-foreground" />
                    </button>
                )}
            </div>
        </div>
    )
}

/* ────────────────────────────────────────────────────────────────────── */
/*  EditButton + ConfirmCancelGroup (inline edit toggles)                  */
/* ────────────────────────────────────────────────────────────────────── */

export function EditButton({ onClick, title }: { onClick: () => void; title?: string }) {
    const label = title ?? "Sửa"
    return (
        <button
            type="button"
            onClick={onClick}
            title={label}
            aria-label={label}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/[0.06] transition-colors"
        >
            <Pencil size={12} className="text-muted-foreground hover:text-violet-300" />
        </button>
    )
}

export function ConfirmCancelGroup({
    onConfirm,
    onCancel,
    saving,
}: {
    onConfirm: () => void
    onCancel: () => void
    saving: boolean
}) {
    return (
        <div className="flex items-center gap-1.5">
            <button
                type="button"
                onClick={onConfirm}
                disabled={saving}
                title="Xác nhận"
                aria-label="Xác nhận"
                className="w-7 h-7 flex items-center justify-center rounded-full bg-primary hover:bg-primary-accent text-white disabled:opacity-50 transition-colors"
            >
                <Check size={13} strokeWidth={3} />
            </button>
            <button
                type="button"
                onClick={onCancel}
                disabled={saving}
                title="Huỷ"
                aria-label="Huỷ"
                className="w-7 h-7 flex items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-zinc-400 disabled:opacity-50 transition-colors"
            >
                <X size={13} />
            </button>
        </div>
    )
}
