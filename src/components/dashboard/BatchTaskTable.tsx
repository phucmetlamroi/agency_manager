'use client'

/**
 * [Velox v1.0 — Phase 2 spec section 5]
 *
 * Batch Table mode for AddTaskModal — activated when Velox detects N≥2 videos.
 * 9 cols × N rows of inline-edited task data. Each row will become a Task on
 * submit via `createTasksFromBatch`.
 *
 * Cols (spec 5.2):
 *   1. Title — inline text
 *   2. Type — dropdown (Short form / Long form / Trial)
 *   3. Raw footage — URL text input
 *   4. Notes — text input (one-liner; full rich-text editing stays in single mode)
 *   5. Assignee — user dropdown
 *   6. Deadline — datetime-local picker
 *   7. Price — number input (USD)
 *   8. Client — searchable autocomplete
 *   9. Actions — duplicate + delete row
 *
 * Validation indicators (spec 7.7, non-blocking):
 *   - URL invalid → red border + tooltip
 *   - Price = 0 → yellow border + tooltip "Chưa có giá"
 *   - Deadline < today → red border + tooltip "Deadline đã qua"
 *
 * Velox-filled cells render a thin green border-left bar (spec 7.1).
 */

import { useState, useMemo } from 'react'
import { Trash2, Copy, Plus, Loader2, ArrowLeft, Sparkles, AlertTriangle } from 'lucide-react'
import { AutocompleteInput } from '@/components/ui/AutocompleteInput'
import BatchBulkControls, { type BulkApplyField } from './BatchBulkControls'

/* ──────────────────────────────────────────────────────────────────── */
/*  Types                                                              */
/* ──────────────────────────────────────────────────────────────────── */

export type RowType = 'Short form' | 'Long form' | 'Trial'

export interface BatchRow {
    rowId: string
    title: string
    type: RowType
    rawFootage: string
    notes: string
    assigneeId: string // empty = queue (no assignee)
    deadline: string // ISO datetime-local "YYYY-MM-DDTHH:mm" or empty
    jobPriceUSD: number
    wageVND: number // editor reward (VND)
    clientId: string // empty = no client
    /** Field names set by Velox initially — green tint indicator (spec 7.1).
     *  Removed when user manually edits the cell. */
    veloxFilled: Set<keyof BatchRow>
}

interface Props {
    rows: BatchRow[]
    onRowsChange: (rows: BatchRow[]) => void
    onExit: () => void
    onSubmit: (skipInvalid: boolean) => Promise<void>
    submitting?: boolean

    clients: Array<{ id: string; name: string; parent?: { name: string } | null }>
    users: Array<{
        id: string
        username: string
        nickname?: string | null
        displayName?: string | null
    }>
    /** Display only — passed through for revenue/wage hint (Phase 2 MVP not used) */
    exchangeRate?: number
}

const TYPE_OPTIONS: RowType[] = ['Short form', 'Long form', 'Trial']

/* ──────────────────────────────────────────────────────────────────── */
/*  Per-cell validation                                                */
/* ──────────────────────────────────────────────────────────────────── */

interface RowValidation {
    titleOk: boolean // for now always true (DB dup check deferred to v2)
    rawFootageOk: boolean
    priceOk: boolean
    deadlineOk: boolean
    /** Aggregated: row is invalid if any required cell fails */
    hasError: boolean
}

function isValidUrl(s: string): boolean {
    if (!s.trim()) return true // empty is OK (optional field)
    try {
        // Accept http:// or https:// — anything else (file paths) is invalid for raw footage
        const u = new URL(s)
        return u.protocol === 'http:' || u.protocol === 'https:'
    } catch {
        return false
    }
}

function validateRow(row: BatchRow): RowValidation {
    const titleOk = row.title.trim().length > 0
    const rawFootageOk = isValidUrl(row.rawFootage)
    const priceOk = row.jobPriceUSD > 0
    // Deadline empty = OK; otherwise must be >= today (start of day)
    let deadlineOk = true
    if (row.deadline) {
        try {
            const d = new Date(row.deadline)
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            deadlineOk = d.getTime() >= today.getTime()
        } catch {
            deadlineOk = false
        }
    }
    // For "hasError" we treat: title missing = blocking, others = warning only
    const hasError = !titleOk
    return { titleOk, rawFootageOk, priceOk, deadlineOk, hasError }
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Cell wrapper — applies Velox tint + validation outline             */
/* ──────────────────────────────────────────────────────────────────── */

function CellShell({
    isVeloxFilled,
    state,
    title,
    children,
}: {
    isVeloxFilled: boolean
    /** 'ok' | 'warn' (yellow border) | 'error' (red border) */
    state?: 'ok' | 'warn' | 'error'
    title?: string
    children: React.ReactNode
}) {
    const borderClass =
        state === 'error'
            ? 'ring-1 ring-red-500/60'
            : state === 'warn'
              ? 'ring-1 ring-amber-400/60'
              : ''
    return (
        <div className={`relative ${borderClass} rounded-md`} title={title}>
            {isVeloxFilled && (
                <span
                    className="pointer-events-none absolute -left-0.5 top-1 bottom-1 w-[2px] rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.5)]"
                    aria-hidden="true"
                />
            )}
            {children}
        </div>
    )
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Cell input styles                                                   */
/* ──────────────────────────────────────────────────────────────────── */

const cellInput =
    'w-full bg-transparent border-0 px-2 py-1.5 text-[12px] text-zinc-100 placeholder-zinc-600 focus:outline-none focus:bg-white/[0.05] focus:rounded-md'

/* ──────────────────────────────────────────────────────────────────── */
/*  Component                                                           */
/* ──────────────────────────────────────────────────────────────────── */

export default function BatchTaskTable({
    rows,
    onRowsChange,
    onExit,
    onSubmit,
    submitting = false,
    clients,
    users,
}: Props) {
    const [skipInvalid, setSkipInvalid] = useState(false)

    // Map for autocomplete option lists
    const clientOptions = useMemo(
        () =>
            clients.map((c) => ({
                id: c.id,
                label: c.name,
                parentLabel: c.parent?.name,
            })),
        [clients],
    )
    const userOptions = useMemo(
        () =>
            users.map((u) => ({
                id: u.id,
                label: u.displayName?.trim() || u.username,
            })),
        [users],
    )

    // Per-row validation (memoized for footer error count)
    const validations = useMemo(() => rows.map(validateRow), [rows])
    const errorCount = validations.filter((v) => v.hasError).length

    /* ── Row mutators ── */

    const updateRow = (rowId: string, patch: Partial<BatchRow>, veloxClearKeys?: (keyof BatchRow)[]) => {
        onRowsChange(
            rows.map((r) => {
                if (r.rowId !== rowId) return r
                const next: BatchRow = { ...r, ...patch }
                if (veloxClearKeys && veloxClearKeys.length > 0) {
                    next.veloxFilled = new Set(r.veloxFilled)
                    for (const k of veloxClearKeys) next.veloxFilled.delete(k)
                }
                return next
            }),
        )
    }

    const deleteRow = (rowId: string) => {
        onRowsChange(rows.filter((r) => r.rowId !== rowId))
    }

    const duplicateRow = (rowId: string) => {
        const idx = rows.findIndex((r) => r.rowId === rowId)
        if (idx < 0) return
        const src = rows[idx]
        const cloned: BatchRow = {
            ...src,
            rowId: `${src.rowId}-dup-${Date.now()}`,
            title: `${src.title} (copy)`,
            veloxFilled: new Set(), // duplicate has no Velox tag (user-derived)
        }
        const next = [...rows]
        next.splice(idx + 1, 0, cloned)
        onRowsChange(next)
    }

    const addEmptyRow = () => {
        const empty: BatchRow = {
            rowId: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            title: '',
            type: 'Short form',
            rawFootage: '',
            notes: '',
            assigneeId: '',
            deadline: '',
            jobPriceUSD: 0,
            wageVND: 0,
            clientId: '',
            veloxFilled: new Set(),
        }
        onRowsChange([...rows, empty])
    }

    /* ── Bulk apply — set 1 field across all rows ── */

    const handleBulkApply = (field: BulkApplyField, value: any) => {
        onRowsChange(
            rows.map((r) => {
                const patch: Partial<BatchRow> = {}
                const veloxClear = new Set(r.veloxFilled)
                switch (field) {
                    case 'deadline':
                        patch.deadline = value
                        veloxClear.delete('deadline')
                        break
                    case 'assigneeId':
                        patch.assigneeId = value
                        veloxClear.delete('assigneeId')
                        break
                    case 'type':
                        patch.type = value
                        veloxClear.delete('type')
                        break
                    case 'clientId':
                        patch.clientId = value
                        veloxClear.delete('clientId')
                        break
                    case 'jobPriceUSD':
                        patch.jobPriceUSD = Number(value) || 0
                        veloxClear.delete('jobPriceUSD')
                        break
                }
                return { ...r, ...patch, veloxFilled: veloxClear }
            }),
        )
    }

    /* ── Render ── */

    return (
        <div className="flex flex-col flex-1 overflow-hidden">
            {/* Top header: title + Thoát Batch */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-white/5 shrink-0">
                <div>
                    <h3 className="text-[14px] font-extrabold text-violet-100 flex items-center gap-2">
                        <Sparkles size={14} className="text-violet-300" />
                        Batch — {rows.length} row{rows.length > 1 ? 's' : ''}
                    </h3>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                        Chỉnh sửa inline, áp dụng cho tất cả, hoặc duplicate row.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onExit}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-[11px] text-zinc-300 font-semibold transition-colors"
                >
                    <ArrowLeft size={12} />
                    Thoát Batch
                </button>
            </div>

            {/* Bulk controls bar */}
            <div className="px-6 py-2 border-b border-white/5 shrink-0">
                <BatchBulkControls
                    onApply={handleBulkApply}
                    clients={clientOptions}
                    users={userOptions}
                    typeOptions={TYPE_OPTIONS}
                />
            </div>

            {/* Table — horizontal scroll if narrow */}
            <div className="flex-1 overflow-auto custom-scrollbar">
                <table className="w-full text-[11px] border-collapse">
                    <thead className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur-xl">
                        <tr className="text-[10px] font-bold uppercase text-zinc-500">
                            <th className="text-left px-3 py-2 border-b border-white/5 w-[8%] min-w-[40px]">#</th>
                            <th className="text-left px-2 py-2 border-b border-white/5 min-w-[180px]">Title</th>
                            <th className="text-left px-2 py-2 border-b border-white/5 min-w-[110px]">Type</th>
                            <th className="text-left px-2 py-2 border-b border-white/5 min-w-[180px]">Raw footage</th>
                            <th className="text-left px-2 py-2 border-b border-white/5 min-w-[160px]">Notes</th>
                            <th className="text-left px-2 py-2 border-b border-white/5 min-w-[160px]">Assignee</th>
                            <th className="text-left px-2 py-2 border-b border-white/5 min-w-[160px]">Deadline</th>
                            <th className="text-left px-2 py-2 border-b border-white/5 min-w-[90px]">Price ($)</th>
                            <th className="text-left px-2 py-2 border-b border-white/5 min-w-[160px]">Client</th>
                            <th className="text-left px-2 py-2 border-b border-white/5 w-[70px]">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, idx) => {
                            const v = validations[idx]
                            return (
                                <tr
                                    key={row.rowId}
                                    className={`border-b border-white/5 ${
                                        v.hasError
                                            ? 'bg-red-500/[0.04]'
                                            : 'hover:bg-white/[0.02]'
                                    } transition-colors`}
                                >
                                    {/* # */}
                                    <td className="px-3 py-1.5 text-zinc-500 font-mono">
                                        {idx + 1}
                                    </td>

                                    {/* Title */}
                                    <td className="px-2 py-1">
                                        <CellShell
                                            isVeloxFilled={row.veloxFilled.has('title')}
                                            state={!v.titleOk ? 'error' : 'ok'}
                                            title={!v.titleOk ? 'Title không được trống' : undefined}
                                        >
                                            <input
                                                value={row.title}
                                                onChange={(e) =>
                                                    updateRow(row.rowId, { title: e.target.value }, ['title'])
                                                }
                                                placeholder="Task title..."
                                                className={cellInput}
                                            />
                                        </CellShell>
                                    </td>

                                    {/* Type */}
                                    <td className="px-2 py-1">
                                        <CellShell isVeloxFilled={row.veloxFilled.has('type')}>
                                            <select
                                                value={row.type}
                                                onChange={(e) =>
                                                    updateRow(
                                                        row.rowId,
                                                        { type: e.target.value as RowType },
                                                        ['type'],
                                                    )
                                                }
                                                className={cellInput + ' cursor-pointer'}
                                            >
                                                {TYPE_OPTIONS.map((t) => (
                                                    <option key={t} value={t}>
                                                        {t}
                                                    </option>
                                                ))}
                                            </select>
                                        </CellShell>
                                    </td>

                                    {/* Raw footage */}
                                    <td className="px-2 py-1">
                                        <CellShell
                                            isVeloxFilled={row.veloxFilled.has('rawFootage')}
                                            state={!v.rawFootageOk ? 'error' : 'ok'}
                                            title={!v.rawFootageOk ? 'Link không hợp lệ' : undefined}
                                        >
                                            <input
                                                value={row.rawFootage}
                                                onChange={(e) =>
                                                    updateRow(
                                                        row.rowId,
                                                        { rawFootage: e.target.value },
                                                        ['rawFootage'],
                                                    )
                                                }
                                                placeholder="https://..."
                                                className={cellInput + ' font-mono text-[11px]'}
                                            />
                                        </CellShell>
                                    </td>

                                    {/* Notes (one-liner in batch mode; full editing in single mode) */}
                                    <td className="px-2 py-1">
                                        <CellShell isVeloxFilled={row.veloxFilled.has('notes')}>
                                            <input
                                                value={row.notes}
                                                onChange={(e) =>
                                                    updateRow(row.rowId, { notes: e.target.value }, ['notes'])
                                                }
                                                placeholder="Notes..."
                                                className={cellInput}
                                            />
                                        </CellShell>
                                    </td>

                                    {/* Assignee */}
                                    <td className="px-2 py-1">
                                        <CellShell isVeloxFilled={row.veloxFilled.has('assigneeId')}>
                                            <select
                                                value={row.assigneeId}
                                                onChange={(e) =>
                                                    updateRow(
                                                        row.rowId,
                                                        { assigneeId: e.target.value },
                                                        ['assigneeId'],
                                                    )
                                                }
                                                className={cellInput + ' cursor-pointer'}
                                            >
                                                <option value="">— Queue (none) —</option>
                                                {userOptions.map((u) => (
                                                    <option key={u.id} value={u.id}>
                                                        {u.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </CellShell>
                                    </td>

                                    {/* Deadline */}
                                    <td className="px-2 py-1">
                                        <CellShell
                                            isVeloxFilled={row.veloxFilled.has('deadline')}
                                            state={!v.deadlineOk ? 'error' : 'ok'}
                                            title={!v.deadlineOk ? 'Deadline đã qua' : undefined}
                                        >
                                            <input
                                                type="datetime-local"
                                                value={row.deadline}
                                                onChange={(e) =>
                                                    updateRow(
                                                        row.rowId,
                                                        { deadline: e.target.value },
                                                        ['deadline'],
                                                    )
                                                }
                                                className={cellInput + ' font-mono text-[11px]'}
                                            />
                                        </CellShell>
                                    </td>

                                    {/* Price */}
                                    <td className="px-2 py-1">
                                        <CellShell
                                            isVeloxFilled={row.veloxFilled.has('jobPriceUSD')}
                                            state={!v.priceOk ? 'warn' : 'ok'}
                                            title={!v.priceOk ? 'Chưa có giá' : undefined}
                                        >
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={row.jobPriceUSD || ''}
                                                onChange={(e) =>
                                                    updateRow(
                                                        row.rowId,
                                                        { jobPriceUSD: Number(e.target.value) || 0 },
                                                        ['jobPriceUSD'],
                                                    )
                                                }
                                                placeholder="0.00"
                                                className={cellInput + ' font-mono'}
                                            />
                                        </CellShell>
                                    </td>

                                    {/* Client */}
                                    <td className="px-2 py-1">
                                        <CellShell isVeloxFilled={row.veloxFilled.has('clientId')}>
                                            <AutocompleteInput
                                                selectedId={row.clientId}
                                                onSelect={(id) =>
                                                    updateRow(
                                                        row.rowId,
                                                        { clientId: id },
                                                        ['clientId'],
                                                    )
                                                }
                                                options={clientOptions}
                                                placeholder="Pick client..."
                                            />
                                        </CellShell>
                                    </td>

                                    {/* Actions */}
                                    <td className="px-2 py-1">
                                        <div className="flex items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => duplicateRow(row.rowId)}
                                                title="Duplicate row"
                                                className="p-1 rounded-md text-zinc-500 hover:text-violet-300 hover:bg-violet-500/10 transition-colors"
                                            >
                                                <Copy size={12} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => deleteRow(row.rowId)}
                                                title="Delete row"
                                                className="p-1 rounded-md text-zinc-500 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )
                        })}

                        {/* Footer row: + Thêm row trống */}
                        <tr>
                            <td colSpan={10} className="px-3 py-2">
                                <button
                                    type="button"
                                    onClick={addEmptyRow}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] hover:bg-violet-500/10 border border-dashed border-white/10 hover:border-violet-500/30 text-[11px] text-zinc-400 hover:text-violet-200 font-semibold transition-colors"
                                >
                                    <Plus size={12} />
                                    Thêm row trống
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* Footer — error counter + skipInvalid + Tạo tất cả */}
            <div className="flex items-center justify-between gap-3 px-6 py-3 border-t border-white/5 shrink-0 bg-zinc-950/40">
                <div className="flex items-center gap-3 text-[11px]">
                    {errorCount > 0 ? (
                        <>
                            <span className="flex items-center gap-1.5 text-amber-300 font-semibold">
                                <AlertTriangle size={12} />
                                {errorCount} row có lỗi
                            </span>
                            <label className="flex items-center gap-1.5 text-zinc-400 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={skipInvalid}
                                    onChange={(e) => setSkipInvalid(e.target.checked)}
                                    className="w-3.5 h-3.5 rounded border-white/20 bg-zinc-900 text-violet-500"
                                />
                                Bỏ qua row lỗi & tạo phần còn lại
                            </label>
                        </>
                    ) : (
                        <span className="text-emerald-400 font-semibold">✓ Tất cả row hợp lệ</span>
                    )}
                </div>

                <button
                    type="button"
                    onClick={() => onSubmit(skipInvalid)}
                    disabled={
                        submitting ||
                        rows.length === 0 ||
                        (errorCount > 0 && !skipInvalid) ||
                        (errorCount === rows.length && skipInvalid)
                    }
                    className="flex items-center gap-2 px-5 py-2 rounded-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[12px] font-bold transition-colors shadow-[0_8px_20px_rgba(139,92,246,0.3)]"
                >
                    {submitting ? (
                        <Loader2 size={12} className="animate-spin" />
                    ) : (
                        <Sparkles size={12} />
                    )}
                    Tạo tất cả ({rows.length - (skipInvalid ? errorCount : 0)})
                </button>
            </div>
        </div>
    )
}
