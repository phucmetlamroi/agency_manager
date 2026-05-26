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
    notes: 'Kế thừa ghi chú',
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

/* ════════════════════════════════════════════════════════════════════════ */
/*  Velox Deep Scan v3.1 — type definitions                                */
/*  Spec: VELOX-DEEP-SCAN.md v3.1 FINAL, section 5                          */
/* ════════════════════════════════════════════════════════════════════════ */

/**
 * Single file entry returned by recursive cloud scan.
 * Extends V1 ScannedVideo with classification-friendly fields.
 */
export interface FileEntry {
    fileId: string
    /** Filename without extension */
    name: string
    /** Filename with extension */
    fullName: string
    mimeType: string
    durationSeconds: number
    previewUrl: string
    sizeBytes: number
    isVideo: boolean
    isAudio: boolean
    isImage: boolean
    isDocument: boolean
    /** Depth from scan root (0 = root file, 1 = one folder deep, ...) */
    depth: number
    parentFolderName: string
    /** Full path inside the cloud storage */
    parentFolderPath: string
}

/** Classified role of a subfolder after Phase 2 scoring */
export type SubfolderRole =
    | 'broll'
    | 'per-video-broll'
    | 'bundle'
    | 'aroll-shared'
    | 'aroll-pervideo'
    | 'output-container'
    | 'images'
    | 'ambiguous'

/** B-roll variant — sub-classification when role ∈ {broll, per-video-broll} */
export type BrollVariant = 'general' | 'slomo' | 'drone' | 'aerial' | 'wide' | 'other'

/**
 * Subfolder profile after Phase 1-2. Recursive — `subSubfolders` carries the tree.
 * Scoring breakdown stored for diagnostics.
 */
export interface SubfolderProfile {
    name: string
    fullPath: string
    /** Provider-specific shared URL for this subfolder */
    url: string
    depth: number
    videoFiles: FileEntry[]
    audioFiles: FileEntry[]
    imageFiles: FileEntry[]
    documentFiles: FileEntry[]
    /** Count of video files in this folder + all descendants */
    totalVideoCountRecursive: number
    subSubfolders: SubfolderProfile[]
    scores: {
        broll: number
        perVideoBroll: number
        bundle: number
        arollShared: number
        arollPerVideo: number
        outputContainer: number
        images: number
    }
    classifiedAs: SubfolderRole | null
    /** Set when classified per-video-broll or aroll-pervideo */
    perVideoTag?: { videoIndex: number; prefix: string }
    brollVariant?: BrollVariant
}

/* ──────────────────────────────────────────────────────────────────── */
/*  TaskName mode (D1)                                                  */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * D1 — 3 mode taskName generation. Applied to pair-type MainItem.
 *   A — Base raw ("Video 1")
 *   B — Base + client prefix ("LGR Video 1") [default if prefix detected]
 *   C — Full body filename ("LGR Video 1 Body")
 */
export type TaskNameMode = 'A' | 'B' | 'C'

/* ──────────────────────────────────────────────────────────────────── */
/*  MainItem — discriminated union of 3 task-source shapes              */
/* ──────────────────────────────────────────────────────────────────── */

interface MainItemBase {
    /** Resolved task name per current mode (mode picked by user at apply time) */
    taskName: string
    /** All 3 mode resolutions — UI updates `taskName` from this dict when user changes D1 dropdown */
    taskNameByMode: Record<TaskNameMode, string>
    /** Default mode (auto-detect: B if client prefix found, else A) */
    defaultTaskNameMode: TaskNameMode
    /** URL used in `Task.resources` RAW: field */
    previewUrl: string
    durationSeconds: number
    /** Human-friendly label shown in preview table "Source" column */
    sourceLabel: string
    /** Set when MainItem corresponds to a numbered video (Video 1, AD 2, etc.) */
    videoIndex?: number
    /** Per-video broll folder URLs matched via videoIndex (Phase 5 step 2) */
    perVideoBrollUrls?: string[]
    /** Per-video A-roll folder URL matched via videoIndex (P5 pattern) */
    perVideoArollUrl?: string
}

/** Single file → 1 task (no pairing) */
export interface MainItemFile extends MainItemBase {
    kind: 'file'
    file: FileEntry
}

/** Body + Hooks pair → 1 task (D1 applies) */
export interface MainItemPair extends MainItemBase {
    kind: 'pair'
    /** Pair's basePart (vd: "LGR Video 1") */
    basePart: string
    body: FileEntry | null
    hooks: FileEntry | null
    /** Extra files in the same group (vd: outro, intro) */
    extras: FileEntry[]
    /** URLs cho RAW_HOOKS + RAW_EXTRA encoding in Task.resources */
    additionalUrls: string[]
}

/** Folder bundle → 1 task (P3 — Align West inner) */
export interface MainItemFolderBundle extends MainItemBase {
    kind: 'folder-bundle'
    folder: SubfolderProfile
}

export type MainItem = MainItemFile | MainItemPair | MainItemFolderBundle

/* ──────────────────────────────────────────────────────────────────── */
/*  Broll structure (D2)                                                */
/* ──────────────────────────────────────────────────────────────────── */

export interface BrollFolder {
    url: string
    name: string
    fileCount: number
    variant?: BrollVariant
}

export interface PerVideoBrollFolder extends BrollFolder {
    videoIndex: number
    prefix: string
}

export interface BrollV3 {
    /** Shared broll folders (general / variants) */
    generalFolders: BrollFolder[]
    /** Per-video-tagged broll folders (matched to MainItem.videoIndex in Phase 5) */
    perVideoFolders: PerVideoBrollFolder[]
    /** Loose broll files at root (DJI_*, camera-dump signatures) */
    looseFiles: FileEntry[]
    totalCount: number
}

/**
 * D2 — How broll URLs flow into each task's `resources` field.
 * - PENDING_USER_CONFIRM: both general + per-video exist; user must pick before Apply
 * - GENERAL_ONLY / PERVIDEO_ONLY / BOTH: explicit policy
 * - CUSTOM: per-task mapping (manager modal)
 * - NONE: no broll detected
 */
export type BrollMatchPolicy =
    | 'PENDING_USER_CONFIRM'
    | 'GENERAL_ONLY'
    | 'PERVIDEO_ONLY'
    | 'BOTH'
    | 'CUSTOM'
    | 'NONE'

/* ──────────────────────────────────────────────────────────────────── */
/*  Shared assets + briefing docs (D3, D4)                              */
/* ──────────────────────────────────────────────────────────────────── */

export type SharedAssetType =
    | 'cta'
    | 'intro'
    | 'outro'
    | 'logo'
    | 'bumper'
    | 'transition'
    | 'unknown'

export interface SharedAsset {
    type: SharedAssetType
    file: FileEntry
}

export type BriefingDocType = 'pdf' | 'docx' | 'doc' | 'pptx' | 'rtf' | 'txt' | 'other'

export interface BriefingDoc {
    type: BriefingDocType
    file: FileEntry
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Top-level scan result + diagnostics                                 */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Primary pattern detected by Phase 5. P6 is composed with inner pattern
 * (recorded separately via `isWrapper` flag — primaryPattern reflects inner).
 */
export type PrimaryPattern = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P7'

export interface ScanDiagnosticsV3 {
    isWrapper: boolean
    wrapperName?: string
    /** D5 layered confidence breakdown */
    wrapperConfidenceBreakdown?: {
        structure: number
        nonVideoFiles: number
        keywordMatch: number
        total: number
    }
    /** Effective root URL after wrapper drill (= original URL if not wrapper) */
    effectiveRootUrl: string
    /** Human-readable explanation of why primaryPattern was chosen */
    patternDetectionRationale: string
    totalVideoCountRecursive: number
    totalSubfolderCount: number
    /** Files dropped because depth > 4 limit */
    ignoredDeepFiles: string[]
    /** Per-subfolder scores + classification (UI diagnostic panel) */
    subfolderScores: Array<{
        name: string
        depth: number
        scores: SubfolderProfile['scores']
        classifiedAs: SubfolderRole | null
        perVideoTag?: { videoIndex: number; prefix: string }
    }>
    /** Per-root-file scores (Phase 3) — optional, populated when relevant */
    fileScores?: Array<{
        name: string
        scores: { main: number; broll: number; sharedAsset: number }
        classifiedAs: 'main' | 'broll' | 'shared_asset' | 'ambiguous'
    }>
    /** Pair groupings from Phase 4 */
    pairingGroups?: Array<{
        basePart: string
        bodyFile?: string
        hooksFile?: string
        extras: string[]
    }>
    /** Batch-wide prefix auto-detected (vd: "LGR", "Barmoor") */
    prefixDetected?: string
}

/* ──────────────────────────────────────────────────────────────────── */
/*  V3 Apply Payload + encoding                                         */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * V3 Apply payload — what QuickCreateMode emits when user clicks "Áp dụng
 * vào form". AddTaskModal.handleApplyVelox consumes this.
 *
 * Carries everything needed to render Step 4 textarea + per-task encoded
 * resources at submit time.
 */
export interface VeloxApplyPayloadV3 {
    /** Discriminator — distinguishes from VeloxApplyPayload V1 */
    version: 'v3'
    /** All MainItems user kept selected */
    mainItems: MainItem[]
    /** D2 final policy after user picked (PENDING resolved) */
    brollPolicy: BrollMatchPolicy
    /** Broll structure (null if no broll) */
    broll: BrollV3 | null
    /** Shared assets to append to every task */
    sharedAssets: SharedAsset[]
    /** Briefing docs detected */
    briefingDocs: BriefingDoc[]
    /** D4 — auto-append brief URL to notes_vi? */
    appendBriefToNotes: boolean
    /** D1 — taskName mode user picked (A/B/C) */
    taskNameMode: TaskNameMode
    /** Common fields (mirrored from V1 — client/assignee/deadline/inheritedNote) */
    common: {
        clientId: number | null
        assigneeId: string | null
        deadline: string | null
        inheritedNote: string | null
    }
    /** Pattern detected (for diagnostics + UI feedback) */
    primaryPattern: PrimaryPattern
    /** Selected MainItem map (per-task custom broll if user used VeloxBrollManagerModal) */
    customBrollMap?: Record<string, { generalUrls?: string[]; perVideoUrls?: string[]; looseUrls?: string[] }>
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Resources encoding (D3)                                             */
/* ──────────────────────────────────────────────────────────────────── */

/** Cap loose broll files at 5 per task to keep resources string readable */
const BROLL_LOOSE_CAP = 5

/**
 * D3 — Encode resources field for ONE task created from a MainItem.
 *
 * Format (multiline):
 *   RAW: <primary>
 *   RAW_HOOKS: <hooks>          (only if pair)
 *   RAW_EXTRA: <extras...>      (if any)
 *   RAW_AROLL: <per-video aroll>
 *   SHARED_CTA: <url>
 *   SHARED_INTRO: <url>
 *   SHARED_OUTRO: <url>
 *   BROLL_GENERAL: <urls; >    (per D2 policy)
 *   BROLL_PERVIDEO: <urls; >   (per D2 policy)
 *   BROLL_LOOSE: <urls; >      (cap 5)
 *   BRIEF: <urls>
 */
export function encodeResourcesV3(args: {
    mainItem: MainItem
    broll: BrollV3 | null
    brollPolicy: BrollMatchPolicy
    sharedAssets: SharedAsset[]
    briefingDocs: BriefingDoc[]
    /** Custom per-task override (from VeloxBrollManagerModal) */
    customBrollForTask?: { generalUrls?: string[]; perVideoUrls?: string[]; looseUrls?: string[] }
    /** Optional extra fields from form (bRoll/submitFolder) — appended for compat */
    extraBRoll?: string
    extraSubmissionFolder?: string
}): string {
    const lines: string[] = []
    const {
        mainItem,
        broll,
        brollPolicy,
        sharedAssets,
        briefingDocs,
        customBrollForTask,
        extraBRoll,
        extraSubmissionFolder,
    } = args

    // RAW (primary)
    lines.push(`RAW: ${mainItem.previewUrl}`)

    // RAW_HOOKS + RAW_EXTRA (pair items)
    if (mainItem.kind === 'pair') {
        if (mainItem.hooks) {
            lines.push(`RAW_HOOKS: ${mainItem.hooks.previewUrl}`)
        }
        for (const extra of mainItem.extras) {
            lines.push(`RAW_EXTRA: ${extra.previewUrl}`)
        }
    }

    // RAW_AROLL (per-video A-Roll)
    if ('perVideoArollUrl' in mainItem && mainItem.perVideoArollUrl) {
        lines.push(`RAW_AROLL: ${mainItem.perVideoArollUrl}`)
    }

    // SHARED assets (D3) — append cho mọi task
    for (const sa of sharedAssets) {
        const key = `SHARED_${sa.type.toUpperCase()}`
        lines.push(`${key}: ${sa.file.previewUrl}`)
    }

    // BROLL per policy (D2)
    if (customBrollForTask) {
        // Custom per-task overrides
        if (customBrollForTask.generalUrls?.length) {
            lines.push(`BROLL_GENERAL: ${customBrollForTask.generalUrls.join('; ')}`)
        }
        if (customBrollForTask.perVideoUrls?.length) {
            lines.push(`BROLL_PERVIDEO: ${customBrollForTask.perVideoUrls.join('; ')}`)
        }
        if (customBrollForTask.looseUrls?.length) {
            const cap = customBrollForTask.looseUrls.slice(0, BROLL_LOOSE_CAP).join('; ')
            const suffix =
                customBrollForTask.looseUrls.length > BROLL_LOOSE_CAP
                    ? ` (+${customBrollForTask.looseUrls.length - BROLL_LOOSE_CAP} more)`
                    : ''
            lines.push(`BROLL_LOOSE: ${cap}${suffix}`)
        }
    } else if (broll) {
        const wantGeneral = brollPolicy === 'BOTH' || brollPolicy === 'GENERAL_ONLY'
        const wantPerVideo = brollPolicy === 'BOTH' || brollPolicy === 'PERVIDEO_ONLY'

        if (wantGeneral && broll.generalFolders.length > 0) {
            const urls = broll.generalFolders.map((g) => g.url).join('; ')
            lines.push(`BROLL_GENERAL: ${urls}`)
        }
        if (wantPerVideo && 'perVideoBrollUrls' in mainItem && mainItem.perVideoBrollUrls?.length) {
            lines.push(`BROLL_PERVIDEO: ${mainItem.perVideoBrollUrls.join('; ')}`)
        }
        if (broll.looseFiles.length > 0) {
            const capped = broll.looseFiles
                .slice(0, BROLL_LOOSE_CAP)
                .map((f) => f.previewUrl)
                .join('; ')
            const suffix =
                broll.looseFiles.length > BROLL_LOOSE_CAP
                    ? ` (+${broll.looseFiles.length - BROLL_LOOSE_CAP} more)`
                    : ''
            lines.push(`BROLL_LOOSE: ${capped}${suffix}`)
        }
    }

    // BRIEF — append URL trong resources cho audit (notes_vi append xử lý riêng)
    for (const brief of briefingDocs) {
        lines.push(`BRIEF: ${brief.file.previewUrl}`)
    }

    // Form extras (user gõ tay vào form bRoll / submitFolder)
    if (extraBRoll?.trim()) {
        lines.push(`BROLL: ${extraBRoll.trim()}`)
    }
    if (extraSubmissionFolder?.trim()) {
        lines.push(`SUBMISSION: ${extraSubmissionFolder.trim()}`)
    }

    return lines.join('\n')
}

/* ──────────────────────────────────────────────────────────────────── */
/*  D4 — Append briefing URL to notes_vi                                */
/* ──────────────────────────────────────────────────────────────────── */

const BRIEF_MARKER = '[Brief đính kèm]'

/**
 * D4 — Maybe append briefing block to existing notes_vi (HTML).
 *
 * - Toggle OFF → return currentNotes unchanged
 * - No briefs → return unchanged
 * - Already has marker → skip (idempotent — re-apply doesn't double-append)
 * - Empty notes → set block directly
 * - Has content → append with 2 newline separator
 *
 * Format (plain text wrapped in <pre> for TipTap):
 *   [Brief đính kèm]
 *   📄 Name.pdf
 *      https://...
 */
export function maybeAppendBriefToNotes(
    currentNotes: string,
    briefingDocs: BriefingDoc[],
    toggleEnabled: boolean,
): string {
    if (!toggleEnabled || briefingDocs.length === 0) return currentNotes
    // Idempotency check — if marker already in notes, don't double-append
    if (currentNotes.includes(BRIEF_MARKER)) return currentNotes

    const briefLines = briefingDocs
        .map((b) => `📄 ${b.file.fullName}\n   ${b.file.previewUrl}`)
        .join('\n')
    const briefBlock = `${BRIEF_MARKER}\n${briefLines}`

    // Strip HTML tags for empty check
    const stripped = currentNotes.replace(/<[^>]*>/g, '').trim()
    if (!stripped) {
        // Empty notes — set as plain (caller may wrap in <p> if needed)
        return briefBlock
    }

    return `${currentNotes}\n\n${briefBlock}`
}

/* ──────────────────────────────────────────────────────────────────── */
/*  V3 → form prefill mapper                                            */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Convert V3 payload → form prefill. Different from V1's mapVeloxPayloadToFormData:
 *
 * - videoList: join all MainItem.taskName resolved per chosen mode
 * - jobPriceUSD / editorFee: use row 1 as canonical (form has single fields,
 *   per-task pricing only saved via createTasksFromBatch)
 * - rawFootage: encoded for row 1 ONLY (Step 4 chip xử lý multi-row case)
 * - notes: from inheritedNote + maybe appended brief
 *
 * The actual per-task resources encoding happens at submit time in
 * DashboardActionWrapper (consumes payload + form bRoll/submitFolder).
 */
export function mapPayloadV3ToFormData(
    payload: VeloxApplyPayloadV3,
    pricingHints?: { priceUSD?: number; wageVND?: number; durationSeconds?: number }[],
): { prefill: VeloxFormPrefill; filledFields: Set<keyof VeloxFormPrefill> } {
    const filledFields = new Set<keyof VeloxFormPrefill>()
    const prefill: VeloxFormPrefill = {}

    // videoList — resolved taskName per mode
    if (payload.mainItems.length > 0) {
        const titles = payload.mainItems.map((m) => {
            // Re-resolve with current mode (mainItem.taskName may have been from default)
            const resolved = m.taskNameByMode[payload.taskNameMode] ?? m.taskName
            return resolved
        })
        prefill.videoList = titles.join('\n')
        filledFields.add('videoList')

        // taskType — peek first MainItem (Short/Long classification needed but V3
        // doesn't carry it explicitly per MainItem). Pricing hints can carry it.
        // Default to 'Short form' if no hint.
        const firstHint = pricingHints?.[0]
        if (firstHint) {
            prefill.taskType =
                (firstHint.durationSeconds ?? 0) > 120 ? 'Long form' : 'Short form'
            filledFields.add('taskType')
            if (firstHint.priceUSD) {
                prefill.jobPriceUSD = String(firstHint.priceUSD)
                filledFields.add('jobPriceUSD')
            }
            if (firstHint.wageVND) {
                prefill.editorFee = String(firstHint.wageVND)
                filledFields.add('editorFee')
            }
        }
    }

    // Common fields
    if (payload.common.clientId != null) {
        prefill.clientId = String(payload.common.clientId)
        filledFields.add('clientId')
    }
    if (payload.common.assigneeId) {
        prefill.assigneeId = payload.common.assigneeId
        filledFields.add('assigneeId')
    }
    if (payload.common.deadline) {
        prefill.deadline = payload.common.deadline
        filledFields.add('deadline')
    }

    // Notes — combine inherited + brief
    if (payload.common.inheritedNote) {
        prefill.notes = payload.common.inheritedNote
        filledFields.add('notes')
    }
    const withBrief = maybeAppendBriefToNotes(
        prefill.notes ?? '',
        payload.briefingDocs,
        payload.appendBriefToNotes,
    )
    if (withBrief && withBrief !== prefill.notes) {
        prefill.notes = withBrief
        filledFields.add('notes')
    }

    return { prefill, filledFields }
}

/**
 * V3 scan output — drop-in replacement for V1 `{ videos, provider, count }`.
 * V1 backward compat: `videos` field still populated (= mainItems flattened).
 */
export interface ScanResultV3 {
    /** V1 backward compat — flat array of "videos" derived from mainItems */
    videos: import('./cloud-scanner').ScannedVideo[]

    /** Pattern detected by Phase 5 (inner pattern if wrapper) */
    primaryPattern: PrimaryPattern
    /** D5 wrapper detection */
    isWrapper: boolean
    wrapperConfidence: number
    /** Phase 5 overall confidence (0.0 - 1.0) */
    confidence: number

    /** Tasks to create (1 per MainItem) */
    mainItems: MainItem[]
    /** Broll structure (null if no broll detected) */
    broll: BrollV3 | null
    /** D2 policy — UI may prompt user to pick when PENDING_USER_CONFIRM */
    brollMatchPolicy: BrollMatchPolicy

    /** D3 shared assets (CTA / Intro / Outro / ...) — append to all tasks' resources */
    sharedAssets: SharedAsset[]
    /** D4 briefing docs (PDF / DOCX / ...) — auto-append URL to notes if toggle ON */
    briefingDocs: BriefingDoc[]

    /** Non-fatal warnings for UI (soft wrapper, ambiguous classification, ...) */
    warnings: string[]
    /** Diagnostic dump for the "Xem chi tiết" panel */
    diagnostics: ScanDiagnosticsV3
}
