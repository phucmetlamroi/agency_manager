/**
 * [Velox v1.0 — Spec section 4 mapping]
 *
 * Pure utility helpers for the Velox → AddTaskModal prefill refactor.
 * No React, no DB, no async — testable in isolation.
 *
 * Velox no longer creates tasks. Instead, it computes a prefill payload that
 * gets dumped into AddTaskModal's TaskFormData via a callback. This file holds:
 *
 *   • Field-mapping: ScannedVideo[] + common config → Partial<TaskFormData>
 *   • Conflict detection: which fields in the existing form would be overwritten
 *   • Field metadata: human-readable feature name for tooltip on Velox-filled fields
 */

/* ──────────────────────────────────────────────────────────────────── */
/*  Types — mirror AddTaskModal's TaskFormData shape (string-everywhere)*/
/* ──────────────────────────────────────────────────────────────────── */

export interface VeloxFormPrefill {
    clientId?: string
    taskType?: string
    deadline?: string
    assigneeId?: string
    videoList?: string
    jobPriceUSD?: string
    editorFee?: string
    rawFootage?: string
    notes?: string
}

/** Per-row data Velox computed (preview table). Phase 1 uses row 1 as canonical
 *  for common fields; Phase 2 batch table will use the full array. */
export interface VeloxRow {
    rowId: string
    title: string
    type: 'Short form' | 'Long form' | 'Trial'
    priceUSD: number
    wageVND: number
    durationSeconds: number
    previewUrl: string
    selected: boolean
}

export interface VeloxApplyPayload {
    rows: VeloxRow[]
    common: {
        clientId: number | null
        assigneeId: string | null
        deadline: string | null
        inheritedNote: string | null
    }
    toggles: {
        linkFootage: boolean
        autoName: boolean
        applyPricing: boolean
        inheritNotes: boolean
        autoAssign: boolean
        uniformDeadline: boolean
    }
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Mapper: VeloxApplyPayload → Partial<TaskFormData> + filled set     */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Convert Velox output into AddTaskModal form fields.
 *
 * - videoList: join all selected row titles with newlines (works for both
 *   N=1 and N≥2; AddTaskModal's submit path splits this into per-task titles
 *   and auto-routes to createTask / createBatchTasks).
 * - Common fields (type, prices, rawFootage): use row 1 as canonical. Phase 2
 *   batch table will let user override per row.
 */
export function mapVeloxPayloadToFormData(payload: VeloxApplyPayload): {
    prefill: VeloxFormPrefill
    filledFields: Set<keyof VeloxFormPrefill>
} {
    const filledFields = new Set<keyof VeloxFormPrefill>()
    const prefill: VeloxFormPrefill = {}

    const selected = payload.rows.filter((r) => r.selected)
    if (selected.length === 0) {
        return { prefill, filledFields }
    }

    const row1 = selected[0]

    // videoList — always set (Velox detects videos as primary feature)
    prefill.videoList = selected.map((r) => r.title).join('\n')
    filledFields.add('videoList')

    // taskType — from row 1's classification (Short/Long form)
    if (payload.toggles.autoName || row1.type) {
        prefill.taskType = row1.type
        filledFields.add('taskType')
    }

    // jobPriceUSD + editorFee (wageVND) — from row 1 when pricing toggle ON
    if (payload.toggles.applyPricing) {
        prefill.jobPriceUSD = String(row1.priceUSD)
        prefill.editorFee = String(row1.wageVND)
        filledFields.add('jobPriceUSD')
        filledFields.add('editorFee')
    }

    // rawFootage — from row 1's previewUrl when linkFootage toggle ON
    if (payload.toggles.linkFootage && row1.previewUrl) {
        prefill.rawFootage = row1.previewUrl
        filledFields.add('rawFootage')
    }

    // clientId — common field
    if (payload.common.clientId != null) {
        prefill.clientId = String(payload.common.clientId)
        filledFields.add('clientId')
    }

    // assigneeId — common (when autoAssign toggle ON, Velox UI already picks an assignee)
    if (payload.common.assigneeId) {
        prefill.assigneeId = payload.common.assigneeId
        filledFields.add('assigneeId')
    }

    // deadline — only when uniformDeadline toggle ON
    if (payload.toggles.uniformDeadline && payload.common.deadline) {
        prefill.deadline = payload.common.deadline
        filledFields.add('deadline')
    }

    // notes — only when inheritNotes toggle ON and we found a previous note
    if (payload.toggles.inheritNotes && payload.common.inheritedNote) {
        prefill.notes = payload.common.inheritedNote
        filledFields.add('notes')
    }

    return { prefill, filledFields }
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Conflict detection                                                  */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Check which prefill fields would overwrite non-empty form values.
 *
 * Returns the set of keys where the user already typed something AND Velox
 * wants to write a different value. The caller (AddTaskModal) shows a
 * conflict dialog with options Ghi đè / Giữ / Gộp.
 *
 * Spec 7.4 exception: notes field is NOT included in conflict set when both
 * the existing form notes are non-empty AND Velox is providing inherited notes
 * via the kế-thừa checkbox — in that case the intent is explicit "append",
 * caller should merge directly.
 */
export function detectFieldConflicts(
    currentForm: Record<string, string>,
    prefill: VeloxFormPrefill,
    options: { skipNotes?: boolean } = {},
): Set<keyof VeloxFormPrefill> {
    const conflicts = new Set<keyof VeloxFormPrefill>()
    const keys = Object.keys(prefill) as Array<keyof VeloxFormPrefill>

    for (const key of keys) {
        if (options.skipNotes && key === 'notes') continue

        const prefilledVal = (prefill[key] ?? '').toString().trim()
        const currentVal = (currentForm[key] ?? '').toString().trim()

        // No conflict if either side is blank or values are identical
        if (!prefilledVal || !currentVal) continue
        if (prefilledVal === currentVal) continue

        conflicts.add(key)
    }

    return conflicts
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Field metadata — for tooltip on Velox-filled fields                */
/* ──────────────────────────────────────────────────────────────────── */

const FIELD_META: Record<keyof VeloxFormPrefill, string> = {
    clientId: 'Client từ Velox',
    taskType: 'Phân loại Short/Long',
    deadline: 'Đặt deadline đồng loạt',
    assigneeId: 'Gán editor tự động',
    videoList: 'Tự nhận diện video',
    jobPriceUSD: 'Áp dụng bảng giá',
    editorFee: 'Áp dụng bảng giá',
    rawFootage: 'Gắn link footage gốc',
    notes: 'Kế thừa ghi chú tháng trước',
}

/** Get human-readable Velox feature name for a field — used in tooltips
 *  per spec 7.1: "Điền tự động bởi Velox · [tên feature]". */
export function getVeloxFieldMeta(fieldName: keyof VeloxFormPrefill): string {
    return FIELD_META[fieldName] ?? 'Velox'
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Merge helpers                                                       */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Apply prefill to form with per-field resolution strategy.
 *
 * - 'overwrite': blindly replace existing values
 * - 'keep': skip fields that already have non-empty values
 * - 'merge': join with newline (for videoList + notes only; falls back to
 *   overwrite for other fields)
 */
export function applyPrefill<T extends Record<string, string>>(
    currentForm: T,
    prefill: VeloxFormPrefill,
    strategy: 'overwrite' | 'keep' | 'merge',
): T {
    const next = { ...currentForm }
    const keys = Object.keys(prefill) as Array<keyof VeloxFormPrefill>

    for (const key of keys) {
        const prefilledVal = (prefill[key] ?? '').toString()
        const currentVal = (currentForm[key as keyof T] ?? '').toString().trim()

        if (!prefilledVal.trim()) continue

        if (strategy === 'keep' && currentVal) continue

        if (strategy === 'merge' && currentVal && (key === 'videoList' || key === 'notes')) {
            ;(next as any)[key] = `${currentVal}\n${prefilledVal}`
            continue
        }

        ;(next as any)[key] = prefilledVal
    }

    return next
}
