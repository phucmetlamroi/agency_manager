"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import {
    X,
    ArrowLeft,
    ArrowRight,
    Check,
    Search,
    ChevronDown,
    Cloud,
    CloudOff,
    Rocket,
    ClipboardList,
} from "lucide-react"
import dynamic from "next/dynamic"
import { useAutoSaveDraft } from "@/hooks/useAutoSaveDraft"
import QuickCreateMode from "./QuickCreateMode"
import VeloxConflictDialog, { type ConflictStrategy } from "./VeloxConflictDialog"
import BatchTaskTable, { type BatchRow, type RowType } from "./BatchTaskTable"
import { AutocompleteInput } from "@/components/ui/AutocompleteInput"
import {
    mapVeloxPayloadToFormData,
    detectFieldConflicts,
    applyPrefill,
    getVeloxFieldMeta,
    type VeloxApplyPayload,
    type VeloxFormPrefill,
} from "@/lib/velox-helpers"
import { createTasksFromBatch, type BatchTaskRow } from "@/actions/velox-batch-actions"
import { useRouter } from "next/navigation"

// TiptapEditor uses browser-only APIs — load on client only
const TiptapEditor = dynamic(() => import("@/components/tiptap/TiptapEditor"), { ssr: false })

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TaskFormData {
    clientId: string
    taskType: string
    deadline: string
    assigneeId: string
    videoList: string
    jobPriceUSD: string
    editorFee: string
    rawFootage: string
    collectFile: string
    bRoll: string
    references: string
    submitFolder: string
    script: string
    frameUsername: string
    framePassword: string
    frameNote: string
    /** Single rich-text Notes (replaces former notesVi/notesEn split) — TipTap HTML */
    notes: string
}

interface AddTaskModalProps {
    open: boolean
    onClose: () => void
    workspaceId: string
    clients: Array<{
        id: string
        name: string
        parentId?: string | null
        parent?: { name: string } | null
    }>
    users: Array<{ id: string; username: string; nickname?: string | null; displayName?: string | null }>
    onSubmit?: (data: TaskFormData) => void | Promise<void>
    /** [Quick Create] Pricing rules available for this workspace */
    pricingRules?: Array<{
        id: string
        name: string
        clientId: number | null
        ruleType: string
        config: any
        isDefault: boolean
    }>
    /** [Quick Create] Current exchange rate snapshot */
    exchangeRate?: number
}

/* ------------------------------------------------------------------ */
/*  Constants — Figma 5-step wizard                                    */
/* ------------------------------------------------------------------ */

const STEPS = [
    { label: "General Info" },
    { label: "Video" },
    { label: "Finance" },
    { label: "Assets" },
    { label: "Preview" },
] as const

const STEP_SUBTITLES = [
    "Add basic task details",
    "Add video names for this task",
    "Define pricing and editor compensation",
    "Add resource links and notes for the editor",
    "Review everything before submitting",
] as const

const TASK_TYPES = ["Short form", "Long form", "Trial"] as const

const INITIAL_FORM: TaskFormData = {
    clientId: "",
    taskType: "",
    deadline: "",
    assigneeId: "",
    videoList: "",
    jobPriceUSD: "",
    editorFee: "",
    rawFootage: "",
    collectFile: "",
    bRoll: "",
    references: "",
    submitFolder: "",
    script: "",
    frameUsername: "",
    framePassword: "",
    frameNote: "",
    notes: "",
}

const USD_TO_VND = 25_000

/* ------------------------------------------------------------------ */
/*  Format helpers                                                     */
/* ------------------------------------------------------------------ */

/**
 * Format datetime-local string ("YYYY-MM-DDTHH:mm") thành "DD/MM/YYYY HH:mm" cho preview.
 * Trả về raw string nếu không parse được (fallback an toàn).
 */
function formatDeadlinePreview(raw: string): string {
    if (!raw) return ""
    // datetime-local format: "YYYY-MM-DDTHH:mm" or "YYYY-MM-DDTHH:mm:ss"
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
    if (match) {
        const [, y, m, d, hh, mm] = match
        return `${d}/${m}/${y} ${hh}:${mm}`
    }
    // Fallback: date-only "YYYY-MM-DD" (legacy)
    const dateMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (dateMatch) {
        const [, y, m, d] = dateMatch
        return `${d}/${m}/${y}`
    }
    return raw
}

/* ------------------------------------------------------------------ */
/*  Tailwind input styles                                              */
/* ------------------------------------------------------------------ */

const inputBase =
    "h-11 w-full rounded-full bg-white/[0.04] border border-[rgba(139,92,246,0.12)] px-[18px] text-[13px] text-zinc-300 placeholder:text-zinc-600 outline-none transition-colors focus:border-[#8B5CF6]/50 focus:bg-white/[0.06]"

const selectBase =
    "h-11 w-full rounded-full bg-white/[0.04] border border-[rgba(139,92,246,0.12)] px-[18px] pr-10 text-[13px] text-zinc-300 outline-none appearance-none cursor-pointer transition-colors focus:border-[#8B5CF6]/50 focus:bg-white/[0.06]"

const textareaBase =
    "w-full rounded-2xl bg-white/[0.04] border border-[rgba(139,92,246,0.12)] px-[18px] py-3 text-[13px] text-zinc-300 placeholder:text-zinc-600 leading-[1.6] outline-none resize-none transition-colors focus:border-[#8B5CF6]/50 focus:bg-white/[0.06]"

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

/**
 * [Velox v1.0 spec 7.1] Wrapper that decorates a field with a Velox-filled
 * indicator: subtle green border-left bar + small 🚀 chip top-right + tooltip
 * "Điền tự động bởi Velox · [feature name]".
 *
 * Renders children passthrough when `filled=false` (no visual overhead for
 * non-Velox fields).
 */
function VeloxField({
    filled,
    fieldName,
    featureName,
    children,
}: {
    filled: boolean
    fieldName: string
    featureName: string
    children: React.ReactNode
}) {
    if (!filled) return <>{children}</>
    return (
        <div
            className="relative"
            data-velox-field={fieldName}
            title={`Điền tự động bởi Velox · ${featureName}`}
        >
            {/* Green border-left bar — sits just outside the input */}
            <span
                className="pointer-events-none absolute -left-1.5 top-1.5 bottom-1.5 w-[2px] rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.55)]"
                aria-hidden="true"
            />
            {/* Top-right Velox chip */}
            <span
                className="pointer-events-none absolute -top-1.5 right-2 z-10 flex items-center gap-1 px-1.5 py-[1px] rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[8px] font-bold uppercase tracking-wider text-emerald-300"
                aria-hidden="true"
            >
                <Rocket size={7} strokeWidth={2.5} />
                Velox
            </span>
            {children}
        </div>
    )
}

function SelectChevron() {
    return (
        <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#A1A1AA]">
            <ChevronDown size={16} strokeWidth={1.5} />
        </div>
    )
}

function PreviewRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-3 py-1.5">
            <span className="text-[11px] text-[#A1A1AA] font-medium uppercase tracking-wide">{label}</span>
            <span className="text-[13px] text-zinc-200 font-medium max-w-[60%] text-right truncate">
                {value || "—"}
            </span>
        </div>
    )
}

// [Quick Create] AutocompleteInput đã extract sang src/components/ui/AutocompleteInput.tsx
// — shared với QuickCreateMode để 2 nơi dùng cùng UX search client.

/* ------------------------------------------------------------------ */
/*  AutoSaveIndicator — Google Docs–style "Đã lưu nháp Xs trước"       */
/* ------------------------------------------------------------------ */

function AutoSaveIndicator({ savedAt }: { savedAt: number | null }) {
    const [now, setNow] = useState(Date.now())

    useEffect(() => {
        if (!savedAt) return
        const interval = setInterval(() => setNow(Date.now()), 5000) // refresh "Xs ago" mỗi 5s
        return () => clearInterval(interval)
    }, [savedAt])

    if (!savedAt) {
        return (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] text-[10px] text-[#71717A]">
                <CloudOff size={11} strokeWidth={2} />
                <span>Chưa lưu</span>
            </div>
        )
    }

    const elapsed = Math.floor((now - savedAt) / 1000)
    const label =
        elapsed < 5
            ? "Đã lưu nháp"
            : elapsed < 60
              ? `Đã lưu ${elapsed}s trước`
              : `Đã lưu ${Math.floor(elapsed / 60)} phút trước`

    return (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-300">
            <Cloud size={11} strokeWidth={2} />
            <span>{label}</span>
        </div>
    )
}

/* ------------------------------------------------------------------ */
/*  Step Indicator (5 steps per Figma)                                 */
/* ------------------------------------------------------------------ */

function StepIndicator({
    current,
    total,
    onStepClick,
}: {
    current: number
    total: number
    onStepClick: (step: number) => void
}) {
    return (
        <div className="flex items-center justify-center gap-0 py-4 px-4">
            {Array.from({ length: total }).map((_, i) => {
                const isActive = i === current
                const isCompleted = i < current
                const stepLabel = STEPS[i]?.label ?? ""

                return (
                    <div key={i} className="flex items-center">
                        <div className="flex flex-col items-center gap-1.5">
                            <button
                                type="button"
                                onClick={() => onStepClick(i)}
                                className={`relative z-10 flex items-center justify-center w-9 h-9 rounded-full text-xs font-bold transition-all duration-200 cursor-pointer ${isActive
                                    ? "bg-[#8B5CF6] border-2 border-[#A855F7] text-white shadow-[0_4px_20px_rgba(139,92,246,0.35)]"
                                    : isCompleted
                                        ? "bg-[#8B5CF6]/25 border-2 border-[#8B5CF6]/50 text-[#D8B4FE] shadow-[0_4px_16px_rgba(139,92,246,0.15)]"
                                        : "bg-white/[0.06] border-2 border-white/[0.08] text-zinc-500"
                                    }`}
                            >
                                {isCompleted ? <Check size={13} strokeWidth={3} className="text-[#D8B4FE]" /> : i + 1}
                            </button>
                            <span
                                className={`text-[10px] leading-none transition-colors duration-200 whitespace-nowrap ${isActive
                                    ? "font-bold text-white"
                                    : isCompleted
                                        ? "font-medium text-[#D8B4FE]"
                                        : "font-medium text-zinc-600"
                                    }`}
                            >
                                {stepLabel}
                            </span>
                        </div>

                        {i < total - 1 && (
                            <div
                                className={`flex-1 min-w-[12px] h-[2px] mx-0.5 transition-colors duration-200 ${isCompleted ? "bg-[#8B5CF6]/40" : "bg-white/[0.06]"
                                    }`}
                            />
                        )}
                    </div>
                )
            })}
        </div>
    )
}

/* ------------------------------------------------------------------ */
/*  Preview accordion (Step 5)                                         */
/* ------------------------------------------------------------------ */

function PreviewAccordion({
    title,
    children,
    defaultOpen = false,
}: {
    title: string
    children: React.ReactNode
    defaultOpen?: boolean
}) {
    const [open, setOpen] = useState(defaultOpen)
    return (
        <div className="rounded-2xl border border-[rgba(139,92,246,0.12)] bg-white/[0.02] overflow-hidden">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.04] transition-colors"
            >
                <span className="text-[13px] font-semibold text-white">{title}</span>
                <ChevronDown
                    size={16}
                    className={`text-[#A1A1AA] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                    strokeWidth={1.8}
                />
            </button>
            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="px-4 pb-3 pt-1 border-t border-[rgba(139,92,246,0.06)]">{children}</div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function AddTaskModal({
    open,
    onClose,
    workspaceId,
    clients,
    users,
    onSubmit,
    pricingRules = [],
    exchangeRate = 26300,
}: AddTaskModalProps) {
    const [step, setStep] = useState(0)
    const [form, setForm] = useState<TaskFormData>({ ...INITIAL_FORM })
    const [submitted, setSubmitted] = useState(false)
    /** [Quick Create] Toggle between standard wizard (📋) and Quick Create mode (🚀) */
    const [quickMode, setQuickMode] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    // [Velox v1.0] Set of fields prefilled by Velox — drives the green-tint
    // indicator + 🚀 icon per spec 7.1. Removed when user manually edits a field.
    const [veloxFilledFields, setVeloxFilledFields] = useState<Set<keyof VeloxFormPrefill>>(
        new Set(),
    )
    // [Velox v1.0] Pending prefill awaiting conflict resolution (spec 7.4 dialog)
    const [pendingPrefill, setPendingPrefill] = useState<{
        prefill: VeloxFormPrefill
        filledFields: Set<keyof VeloxFormPrefill>
        conflicts: Set<keyof VeloxFormPrefill>
    } | null>(null)

    // [Velox v1.0 Phase 2] Modal mode — 'single' (5-step wizard) vs 'batch'
    // (BatchTaskTable). N≥2 from Velox switches to 'batch'.
    const [mode, setMode] = useState<'single' | 'batch'>('single')
    const [batchRows, setBatchRows] = useState<BatchRow[]>([])
    const [exitBatchConfirmOpen, setExitBatchConfirmOpen] = useState(false)
    const router = useRouter()

    // [Sprint Z+1] Auto-save draft tới localStorage (Google Docs–style).
    // Reset trên mỗi keystroke; idle 3 phút → expire.
    // Key per-workspace để tránh cross-contamination giữa các workspace.
    const DRAFT_KEY = `addTask:draft:${workspaceId}`
    const { restored, clearDraft, savedAt } = useAutoSaveDraft<{
        form: TaskFormData
        step: number
    }>(
        DRAFT_KEY,
        { form, step },
        (draft) => {
            // Restore từ localStorage khi mở modal
            setForm(draft.form)
            setStep(draft.step)
        },
        {
            ttlMs: 3 * 60 * 1000, // 3 phút sliding TTL
            debounceMs: 500,
            enabled: open && !submitted, // chỉ save khi modal đang mở + chưa submit
            shouldSave: ({ form }) => {
                // Bỏ qua nếu form hoàn toàn trống (tránh lưu draft empty)
                return Boolean(
                    form.clientId ||
                        form.assigneeId ||
                        form.taskType ||
                        form.deadline ||
                        form.videoList?.trim() ||
                        form.jobPriceUSD ||
                        form.editorFee ||
                        form.notes?.replace(/<[^>]*>/g, "").trim() ||
                        form.rawFootage ||
                        form.bRoll ||
                        form.references ||
                        form.script ||
                        form.submitFolder ||
                        form.collectFile ||
                        form.frameUsername ||
                        form.framePassword ||
                        form.frameNote,
                )
            },
        },
    )

    // Toast khi restore từ localStorage (chỉ chạy 1 lần sau restore)
    const toastedRestore = useRef(false)
    useEffect(() => {
        if (restored && !toastedRestore.current && open) {
            toastedRestore.current = true
            toast.success("Đã khôi phục bản nháp đang nhập dở", {
                description: "Tự động xóa sau 3 phút không hoạt động.",
                duration: 4000,
            })
        }
    }, [restored, open])

    useEffect(() => {
        if (open) {
            // KHÔNG reset form ngay — để useAutoSaveDraft có cơ hội restore từ localStorage trước.
            // Nếu không có draft hoặc draft đã expire, form vẫn ở INITIAL_FORM (state cũ).
            setSubmitted(false)
            setSubmitting(false)
            toastedRestore.current = false
        }
    }, [open])

    const set = <K extends keyof TaskFormData>(key: K, value: TaskFormData[K]) => {
        setForm((prev) => ({ ...prev, [key]: value }))
        // [Velox v1.0 spec 7.1] User manually edits a field → remove its Velox tag
        // (field is now "of the user", not auto-filled).
        if (veloxFilledFields.has(key as keyof VeloxFormPrefill)) {
            setVeloxFilledFields((prev) => {
                const next = new Set(prev)
                next.delete(key as keyof VeloxFormPrefill)
                return next
            })
        }
    }

    /* ──────────────────────────────────────────────────────────────
       [Velox v1.0] Apply prefill from Velox modal → form
       ────────────────────────────────────────────────────────────── */

    const applyVeloxPrefill = (
        prefill: VeloxFormPrefill,
        filledFields: Set<keyof VeloxFormPrefill>,
        strategy: 'overwrite' | 'keep' | 'merge',
    ) => {
        setForm((prev) => applyPrefill(prev as unknown as Record<string, string>, prefill, strategy) as unknown as TaskFormData)
        // Track filled fields — but only those actually written (strategy='keep'
        // may have skipped some). Conservative: union the planned set.
        setVeloxFilledFields((prev) => {
            const next = new Set(prev)
            filledFields.forEach((f) => {
                // For 'keep' strategy, skip the field if the form already had a value
                // (it wasn't actually written by Velox).
                if (strategy === 'keep' && (prefill[f] ?? '').toString().trim() && (form as any)[f]?.toString().trim()) {
                    return
                }
                next.add(f)
            })
            return next
        })
    }

    const handleApplyVelox = (payload: VeloxApplyPayload) => {
        // [Velox v1.0 Phase 2] N≥2 → switch to Batch Table mode (spec 5.1).
        // Per-row data preserved, user can edit inline + bulk-apply common fields.
        const selectedRows = payload.rows.filter((r) => r.selected)
        if (selectedRows.length >= 2) {
            const newBatch: BatchRow[] = selectedRows.map((r) => {
                const veloxFilled = new Set<keyof BatchRow>()
                veloxFilled.add('title')
                if (payload.toggles.autoName || r.type) veloxFilled.add('type')
                if (payload.toggles.applyPricing) {
                    veloxFilled.add('jobPriceUSD')
                    veloxFilled.add('wageVND')
                }
                if (payload.toggles.linkFootage && r.previewUrl) veloxFilled.add('rawFootage')
                if (payload.common.clientId != null) veloxFilled.add('clientId')
                if (payload.common.assigneeId) veloxFilled.add('assigneeId')
                if (payload.toggles.uniformDeadline && payload.common.deadline) veloxFilled.add('deadline')
                if (payload.toggles.inheritNotes && payload.common.inheritedNote) veloxFilled.add('notes')

                return {
                    rowId: r.rowId,
                    title: r.title,
                    type: r.type as RowType,
                    rawFootage: payload.toggles.linkFootage ? r.previewUrl ?? '' : '',
                    notes: payload.toggles.inheritNotes ? payload.common.inheritedNote ?? '' : '',
                    assigneeId: payload.common.assigneeId ?? '',
                    deadline:
                        payload.toggles.uniformDeadline && payload.common.deadline
                            ? payload.common.deadline
                            : '',
                    jobPriceUSD: payload.toggles.applyPricing ? r.priceUSD : 0,
                    wageVND: payload.toggles.applyPricing ? r.wageVND : 0,
                    clientId: payload.common.clientId != null ? String(payload.common.clientId) : '',
                    veloxFilled,
                }
            })
            setBatchRows(newBatch)
            setMode('batch')
            setQuickMode(false) // close Velox modal — back to wizard host
            toast.success(`Đã áp dụng ${selectedRows.length} task vào Batch Table — chỉnh inline + bấm "Tạo tất cả"`)
            return
        }

        // N=1 → single-mode prefill (Phase 1 behavior)
        const { prefill, filledFields } = mapVeloxPayloadToFormData(payload)

        // Spec 7.4 exception: when kế thừa note ON + form notes already has content
        // → automatic append (no dialog ask).
        const noteAppendException =
            payload.toggles.inheritNotes &&
            Boolean(form.notes?.replace(/<[^>]*>/g, "").trim()) &&
            Boolean(prefill.notes)

        const conflicts = detectFieldConflicts(
            form as unknown as Record<string, string>,
            prefill,
            { skipNotes: noteAppendException },
        )

        if (conflicts.size === 0) {
            // No conflicts → apply directly with overwrite (writes only non-empty fields anyway)
            applyVeloxPrefill(prefill, filledFields, 'overwrite')
            if (noteAppendException && prefill.notes) {
                // Manual append for notes (spec exception)
                setForm((prev) => ({
                    ...prev,
                    notes: `${prev.notes}\n${prefill.notes}`,
                }))
                setVeloxFilledFields((prev) => new Set(prev).add('notes'))
            }
            setQuickMode(false) // close Velox modal — back to wizard
            return
        }

        // Conflicts present → show dialog
        setPendingPrefill({ prefill, filledFields, conflicts })
    }

    const handleConflictResolve = (strategy: ConflictStrategy) => {
        if (!pendingPrefill) return
        applyVeloxPrefill(pendingPrefill.prefill, pendingPrefill.filledFields, strategy)
        setPendingPrefill(null)
        setQuickMode(false) // back to wizard
    }

    const handleConflictCancel = () => {
        setPendingPrefill(null)
        // Stay in Velox modal so user can adjust toggles and retry
    }

    const jobPriceNum = parseFloat(form.jobPriceUSD) || 0
    const editorFeeNum = parseFloat(form.editorFee) || 0
    const revenueVND = jobPriceNum * USD_TO_VND - editorFeeNum
    const revenuePercent =
        jobPriceNum > 0
            ? Math.min(100, Math.max(0, (revenueVND / (jobPriceNum * USD_TO_VND)) * 100))
            : 0

    const clientName = clients.find((c) => c.id === form.clientId)?.name ?? ""
    const clientFullName = (() => {
        const c = clients.find((c) => c.id === form.clientId)
        if (!c) return ""
        return c.parent?.name ? `${c.parent.name} / ${c.name}` : c.name
    })()
    // [Username Handle] displayName → username (clean handle), never email fallback
    const assigneeUser = users.find((u) => u.id === form.assigneeId)
    const assigneeName = assigneeUser?.displayName?.trim() || assigneeUser?.username || ""
    const videoCount = form.videoList.split("\n").filter((l) => l.trim()).length

    const stepTitle = STEPS[step]?.label ?? ""
    const stepSubtitle = STEP_SUBTITLES[step] ?? ""

    /* ---- navigation ---- */

    const goNext = () => {
        if (step < STEPS.length - 1) setStep((s) => s + 1)
    }
    const goBack = () => {
        if (step > 0) setStep((s) => s - 1)
    }

    const handleSubmit = async () => {
        setSubmitting(true)
        try {
            await onSubmit?.(form)
            setSubmitted(true)
            // [Auto-save] Clear draft khi submit success — không còn cần restore
            clearDraft()
            // [Velox v1.0 spec 7.2] Reset cả form + Velox indicator state on successful create
            setVeloxFilledFields(new Set())
        } catch (err: any) {
            toast.error(err?.message || "Lỗi khi tạo task. Vui lòng thử lại.")
        } finally {
            setSubmitting(false)
        }
    }

    const handleDone = () => {
        // [Auto-save] Reset form state cho lần mở next (submitted = đã clear draft rồi)
        setForm({ ...INITIAL_FORM })
        setStep(0)
        setVeloxFilledFields(new Set())
        setMode('single')
        setBatchRows([])
        onClose()
    }

    /* ──────────────────────────────────────────────────────────────
       [Velox v1.0 Phase 2] Batch mode handlers
       ────────────────────────────────────────────────────────────── */

    /** Confirm + leave batch mode → return to single wizard with empty form. */
    const confirmExitBatch = () => {
        setMode('single')
        setBatchRows([])
        setVeloxFilledFields(new Set())
        setExitBatchConfirmOpen(false)
    }

    /** Submit batch → call createTasksFromBatch action. */
    const handleBatchSubmit = async (skipInvalid: boolean) => {
        setSubmitting(true)
        try {
            const payload: BatchTaskRow[] = batchRows.map((r) => ({
                title: r.title,
                type: r.type,
                jobPriceUSD: r.jobPriceUSD,
                wageVND: r.wageVND,
                clientId: r.clientId ? Number(r.clientId) || null : null,
                assigneeId: r.assigneeId || null,
                deadline: r.deadline || null,
                rawFootage: r.rawFootage || null,
                notes: r.notes || null,
            }))
            const res = await createTasksFromBatch(
                { rows: payload, exchangeRate, skipInvalid },
                workspaceId,
            )
            if ('error' in res) {
                toast.error(res.error)
                return
            }
            toast.success(
                res.skipped.length > 0
                    ? `Đã tạo ${res.count} task. Bỏ qua ${res.skipped.length} row lỗi.`
                    : `Đã tạo ${res.count} task!`,
            )
            // Treat batch submit as "submitted" → show success state, then reset
            setSubmitted(true)
            clearDraft()
            setBatchRows([])
            setMode('single')
            setVeloxFilledFields(new Set())
            router.refresh()
        } catch (err: any) {
            toast.error(err?.message || 'Lỗi khi tạo task hàng loạt.')
        } finally {
            setSubmitting(false)
        }
    }

    /* ---- step renderers ---- */

    const renderStep = () => {
        switch (step) {
            /* ============ STEP 1 : General Info ============ */
            case 0: {
                const clientOptions = clients.map((c) => ({
                    id: c.id,
                    label: c.name,
                    parentLabel: c.parent?.name,
                }))
                const userOptions = users.map((u) => ({
                    id: u.id,
                    // [Username Handle] displayName → username (clean handle, never email)
                    label: u.displayName?.trim() || u.username,
                }))
                return (
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs text-[#A1A1AA] font-medium pl-1">Client&apos;s name</label>
                            <VeloxField
                                filled={veloxFilledFields.has('clientId')}
                                fieldName="clientId"
                                featureName={getVeloxFieldMeta('clientId')}
                            >
                                <AutocompleteInput
                                    selectedId={form.clientId}
                                    onSelect={(id) => set("clientId", id)}
                                    options={clientOptions}
                                    placeholder="Search client..."
                                />
                            </VeloxField>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs text-[#A1A1AA] font-medium pl-1">Editor&apos;s name</label>
                            <VeloxField
                                filled={veloxFilledFields.has('assigneeId')}
                                fieldName="assigneeId"
                                featureName={getVeloxFieldMeta('assigneeId')}
                            >
                                <AutocompleteInput
                                    selectedId={form.assigneeId}
                                    onSelect={(id) => set("assigneeId", id)}
                                    options={userOptions}
                                    placeholder="Search assignee..."
                                    emptyLabel="Leave Blank (Task Pool)"
                                />
                            </VeloxField>
                        </div>

                        <div className="flex gap-3">
                            <div className="flex-1 flex flex-col gap-1.5">
                                <label className="text-xs text-[#A1A1AA] font-medium pl-1">Task Type</label>
                                <VeloxField
                                    filled={veloxFilledFields.has('taskType')}
                                    fieldName="taskType"
                                    featureName={getVeloxFieldMeta('taskType')}
                                >
                                    <div className="relative">
                                        <select
                                            className={selectBase}
                                            value={form.taskType}
                                            onChange={(e) => set("taskType", e.target.value)}
                                        >
                                            <option value="">Select type...</option>
                                            {TASK_TYPES.map((t) => (
                                                <option key={t} value={t}>
                                                    {t}
                                                </option>
                                            ))}
                                        </select>
                                        <SelectChevron />
                                    </div>
                                </VeloxField>
                            </div>

                            <div className="flex-1 flex flex-col gap-1.5">
                                <label className="text-xs text-[#A1A1AA] font-medium pl-1">Deadline (ngày & giờ)</label>
                                <VeloxField
                                    filled={veloxFilledFields.has('deadline')}
                                    fieldName="deadline"
                                    featureName={getVeloxFieldMeta('deadline')}
                                >
                                <input
                                    type="datetime-local"
                                    className={inputBase}
                                    value={form.deadline}
                                    onChange={(e) => set("deadline", e.target.value)}
                                />
                                </VeloxField>
                            </div>
                        </div>
                    </div>
                )
            }

            /* ============ STEP 2 : Video ============ */
            case 1:
                return (
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs text-[#A1A1AA] font-medium pl-1">Video list</label>
                            <VeloxField
                                filled={veloxFilledFields.has('videoList')}
                                fieldName="videoList"
                                featureName={getVeloxFieldMeta('videoList')}
                            >
                            <textarea
                                className={textareaBase}
                                style={{ minHeight: 220 }}
                                placeholder="Video name (one per line)..."
                                value={form.videoList}
                                onChange={(e) => set("videoList", e.target.value)}
                            />
                            </VeloxField>
                        </div>
                        <p className="text-[11px] text-zinc-600 pl-1">
                            {videoCount} video(s) added
                        </p>
                    </div>
                )

            /* ============ STEP 3 : Finance ============ */
            case 2:
                return (
                    <div className="flex flex-col gap-5">
                        <div className="flex gap-3">
                            <div className="flex-1 flex flex-col gap-1.5">
                                <label className="text-xs text-[#A1A1AA] font-medium pl-1">Task Price (USD)</label>
                                <VeloxField
                                    filled={veloxFilledFields.has('jobPriceUSD')}
                                    fieldName="jobPriceUSD"
                                    featureName={getVeloxFieldMeta('jobPriceUSD')}
                                >
                                    <input
                                        type="number"
                                        className={inputBase}
                                        placeholder="0.00"
                                        value={form.jobPriceUSD}
                                        onChange={(e) => set("jobPriceUSD", e.target.value)}
                                    />
                                </VeloxField>
                            </div>

                            <div className="flex-1 flex flex-col gap-1.5">
                                <label className="text-xs text-[#A1A1AA] font-medium pl-1">Editor Reward (VND)</label>
                                <VeloxField
                                    filled={veloxFilledFields.has('editorFee')}
                                    fieldName="editorFee"
                                    featureName={getVeloxFieldMeta('editorFee')}
                                >
                                    <input
                                        type="number"
                                        className={inputBase}
                                        placeholder="0"
                                        value={form.editorFee}
                                        onChange={(e) => set("editorFee", e.target.value)}
                                    />
                                </VeloxField>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between px-1">
                                <span className="text-xs text-[#A1A1AA] font-medium">Revenue (estimated)</span>
                                <span
                                    className={`text-[13px] font-bold ${revenueVND >= 0 ? "text-emerald-400" : "text-red-400"
                                        }`}
                                >
                                    {revenueVND.toLocaleString("vi-VN")} VND
                                </span>
                            </div>
                            <div className="relative h-[28px] w-full rounded-full bg-white/[0.04] border border-[rgba(139,92,246,0.08)] overflow-hidden">
                                <motion.div
                                    className="h-full rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#A855F7]"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${revenuePercent}%` }}
                                    transition={{ type: "spring", stiffness: 120, damping: 20 }}
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-mono text-[#A1A1AA]">
                                    {revenueVND.toLocaleString("vi-VN")} / {form.jobPriceUSD ? (jobPriceNum * USD_TO_VND).toLocaleString("vi-VN") : "0"}
                                </span>
                            </div>
                            <p className="text-[11px] text-zinc-600 pl-1">
                                {revenuePercent.toFixed(0)}% margin &middot; Rate: 1 USD = {USD_TO_VND.toLocaleString()} VND
                            </p>
                        </div>
                    </div>
                )

            /* ============ STEP 4 : Assets — 6 URLs + Notes (Figma fidelity) ============ */
            case 3:
                return (
                    <div className="flex flex-col gap-5">
                        {/* URL fields — 6 in 3×2 grid matching Figma layout exactly */}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                            {(
                                [
                                    ["rawFootage", "Raw footage", "Paste raw footage link"],
                                    ["collectFile", "Collect file", "Paste collect file link"],
                                    ["bRoll", "B-rolls", "Paste B-roll link"],
                                    ["references", "References", "Paste references link"],
                                    ["submitFolder", "Submit file", "Paste submit location"],
                                    ["script", "Scription", "Paste scription"],
                                ] as const
                            ).map(([key, label, placeholder]) => {
                                const isVeloxFilled = key === 'rawFootage' && veloxFilledFields.has('rawFootage')
                                const fieldEl = (
                                    <input
                                        type="url"
                                        className="h-11 w-full rounded-full bg-white/[0.04] border border-[rgba(139,92,246,0.12)] px-[18px] text-[13px] text-zinc-300 placeholder:text-zinc-600 outline-none transition-colors focus:border-[#8B5CF6]/50 focus:bg-white/[0.06]"
                                        placeholder={placeholder}
                                        value={form[key]}
                                        onChange={(e) => set(key, e.target.value)}
                                    />
                                )
                                return (
                                    <div key={key} className="flex flex-col gap-2">
                                        <label className="text-[14px] text-white font-bold pl-1">{label}</label>
                                        {isVeloxFilled ? (
                                            <VeloxField
                                                filled={true}
                                                fieldName={key}
                                                featureName={getVeloxFieldMeta('rawFootage')}
                                            >
                                                {fieldEl}
                                            </VeloxField>
                                        ) : (
                                            fieldEl
                                        )}
                                    </div>
                                )
                            })}
                        </div>

                        {/* Notes — single TipTap rich-text editor (Figma's centerpiece in Step 4) */}
                        <div className="flex flex-col gap-2">
                            <label className="text-[14px] text-white font-bold pl-1">Notes</label>
                            <VeloxField
                                filled={veloxFilledFields.has('notes')}
                                fieldName="notes"
                                featureName={getVeloxFieldMeta('notes')}
                            >
                                <div className="rounded-2xl bg-white/[0.04] border border-[rgba(139,92,246,0.12)] overflow-hidden">
                                    <TiptapEditor
                                        content={form.notes}
                                        onChange={(html) => set("notes", html)}
                                    />
                                </div>
                            </VeloxField>
                        </div>
                    </div>
                )

            /* ============ STEP 5 : Preview (collapsed accordions per Figma) ============ */
            case 4:
                return (
                    <div className="flex flex-col gap-3">
                        <PreviewAccordion title="General information" defaultOpen={false}>
                            <div className="flex flex-col">
                                <PreviewRow label="Client" value={clientFullName} />
                                <PreviewRow label="Editor" value={assigneeName || "Unassigned (pool)"} />
                                <PreviewRow label="Task type" value={form.taskType} />
                                <PreviewRow label="Deadline" value={formatDeadlinePreview(form.deadline)} />
                            </div>
                        </PreviewAccordion>

                        <PreviewAccordion title={`Video(s) (${String(videoCount).padStart(2, "0")})`} defaultOpen={false}>
                            <div className="flex flex-col gap-1.5">
                                {videoCount === 0 ? (
                                    <span className="text-[13px] text-zinc-600">No videos added</span>
                                ) : (
                                    form.videoList
                                        .split("\n")
                                        .map((s) => s.trim())
                                        .filter(Boolean)
                                        .map((v, idx) => (
                                            <div
                                                key={idx}
                                                className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.03] border border-[rgba(139,92,246,0.08)]"
                                            >
                                                <span className="text-[13px] text-zinc-300">Video {idx + 1}</span>
                                                <span className="text-[12px] text-zinc-400 truncate max-w-[60%] text-right">
                                                    {v}
                                                </span>
                                            </div>
                                        ))
                                )}
                            </div>
                        </PreviewAccordion>

                        <PreviewAccordion title="Finance" defaultOpen={false}>
                            <div className="flex flex-col">
                                <PreviewRow
                                    label="Task price"
                                    value={form.jobPriceUSD ? `$ ${form.jobPriceUSD}` : ""}
                                />
                                <PreviewRow
                                    label="Editor reward"
                                    value={
                                        form.editorFee
                                            ? `đ ${parseFloat(form.editorFee).toLocaleString("vi-VN")}`
                                            : ""
                                    }
                                />
                                <PreviewRow
                                    label="Revenue"
                                    value={`đ ${revenueVND.toLocaleString("vi-VN")}`}
                                />
                            </div>
                        </PreviewAccordion>

                        <PreviewAccordion title="Assets" defaultOpen={false}>
                            <div className="flex flex-col">
                                <PreviewRow label="Raw footage" value={form.rawFootage} />
                                <PreviewRow label="Collected file" value={form.collectFile} />
                                <PreviewRow label="B-rolls" value={form.bRoll} />
                                <PreviewRow label="References" value={form.references} />
                                <PreviewRow label="Submission" value={form.submitFolder} />
                                <PreviewRow label="Script" value={form.script} />
                            </div>
                        </PreviewAccordion>

                        {/* Notations (rich text preview) */}
                        <PreviewAccordion title="Notations" defaultOpen={false}>
                            {form.notes.trim() ? (
                                <div
                                    className="text-[13px] text-zinc-300 leading-relaxed prose prose-invert prose-sm max-w-none"
                                    dangerouslySetInnerHTML={{ __html: form.notes }}
                                />
                            ) : (
                                <span className="text-[13px] text-zinc-600">No notes added</span>
                            )}
                        </PreviewAccordion>
                    </div>
                )

            default:
                return null
        }
    }

    /* ---- success state ---- */

    const renderSuccess = () => (
        <motion.div
            className="flex flex-col items-center justify-center py-12 gap-5"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
        >
            <div className="flex items-center justify-center w-[72px] h-[72px] rounded-full bg-[#8B5CF6]/20 border border-[#8B5CF6]/30">
                <Check size={36} className="text-[#A855F7]" strokeWidth={2.5} />
            </div>
            <h3 className="text-xl font-bold text-white">Successfully</h3>
            <p className="text-sm text-[#A1A1AA] text-center max-w-[320px]">
                Task đã được thêm thành công vào hàng đợi. Bạn có thể xem trong Task Queue.
            </p>
            <button
                type="button"
                onClick={handleDone}
                className="mt-2 h-11 px-10 rounded-full bg-[#8B5CF6] hover:bg-[#A855F7] text-white text-sm font-semibold transition-colors shadow-[0_8px_20px_rgba(139,92,246,0.35)]"
            >
                Done
            </button>
        </motion.div>
    )

    /* ================================================================ */
    /*  Render                                                           */
    /* ================================================================ */

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-[8px]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    onClick={(e) => {
                        // [Sprint K P1] Block backdrop click while submitting to prevent
                        // closing modal mid-request (request still inflight, user loses
                        // confirmation feedback).
                        if (submitting) return
                        if (e.target === e.currentTarget) onClose()
                    }}
                >
                    <motion.div
                        className="relative w-full max-h-[88vh] flex flex-col rounded-3xl border border-[rgba(139,92,246,0.15)] shadow-[0_32px_80px_rgba(0,0,0,0.60)] overflow-hidden"
                        style={{
                            background: "rgba(10,10,10,0.95)",
                            backdropFilter: "blur(24px)",
                            // [Velox v1.0 Phase 2 spec 5.1] Animate width when mode switches:
                            // single (680px wizard) ↔ batch (1200px table for 9 cols).
                            maxWidth: mode === 'batch' ? 1200 : 680,
                            transition: 'max-width 300ms ease-out',
                        }}
                        initial={{ opacity: 0, y: 32, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 24, scale: 0.97 }}
                        transition={{ type: "spring", stiffness: 260, damping: 28 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Ambient purple orb */}
                        <div
                            className="pointer-events-none absolute top-[-60px] right-[-60px] w-[180px] h-[180px] rounded-full bg-[#8B5CF6] opacity-[0.08]"
                            style={{ filter: "blur(60px)" }}
                        />

                        {/* -------- Header -------- */}
                        {!submitted && (
                            <div className="flex items-start justify-between px-6 pt-6 pb-2">
                                <div>
                                    <h2 className="text-[16px] font-extrabold text-white">
                                        {quickMode ? (
                                            <>
                                                <Rocket size={14} className="inline mr-1.5 text-violet-300" />
                                                Tạo Task Nhanh
                                            </>
                                        ) : mode === 'batch' ? (
                                            <>
                                                <Rocket size={14} className="inline mr-1.5 text-violet-300" />
                                                Velox Batch — {batchRows.length} task
                                            </>
                                        ) : (
                                            <>Step {step + 1}. {stepTitle}:</>
                                        )}
                                    </h2>
                                    <p className="text-xs text-[#A1A1AA] mt-0.5">
                                        {quickMode
                                            ? 'Quick Create — dán link folder, tạo batch trong 1 click'
                                            : mode === 'batch'
                                              ? 'Review + chỉnh sửa inline trước khi tạo tất cả'
                                              : stepSubtitle}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {/* [Quick Create] Toggle between standard wizard and quick mode.
                                        [Velox v1.0 spec 7.2] Green dot badge top-right when Velox has
                                        already been applied to ≥1 field. */}
                                    <button
                                        type="button"
                                        onClick={() => setQuickMode(!quickMode)}
                                        disabled={submitting}
                                        title={
                                            quickMode
                                                ? 'Chuyển sang form thường'
                                                : veloxFilledFields.size > 0
                                                  ? `Velox đã áp dụng cho ${veloxFilledFields.size} field`
                                                  : 'Mở Velox (Tạo Task Nhanh)'
                                        }
                                        className={`relative flex items-center justify-center w-8 h-8 rounded-full transition-colors disabled:opacity-40 ${
                                            quickMode
                                                ? 'bg-violet-500/20 border border-violet-500/40 text-violet-200'
                                                : 'bg-white/[0.06] hover:bg-white/[0.12] text-zinc-400 hover:text-violet-300'
                                        }`}
                                    >
                                        {quickMode ? <ClipboardList size={16} /> : <Rocket size={16} />}
                                        {!quickMode && veloxFilledFields.size > 0 && (
                                            <span
                                                className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]"
                                                aria-hidden="true"
                                            />
                                        )}
                                    </button>
                                    {/* [Auto-save] Indicator — Google Docs–style "Đã lưu nháp" */}
                                    {!quickMode && <AutoSaveIndicator savedAt={savedAt} />}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            // [Sprint K P1] Block close while submitting
                                            if (submitting) return
                                            onClose()
                                        }}
                                        disabled={submitting}
                                        className="flex items-center justify-center w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-[#A1A1AA] hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* -------- Step Indicator (single mode only) -------- */}
                        {!submitted && !quickMode && mode === 'single' && (
                            <StepIndicator current={step} total={STEPS.length} onStepClick={setStep} />
                        )}

                        {/* -------- Content -------- */}
                        {quickMode && !submitted ? (
                            <QuickCreateMode
                                workspaceId={workspaceId}
                                clients={clients.map((c) => ({
                                    id: Number(c.id),
                                    name: c.name,
                                    parentName: c.parent?.name ?? null,
                                }))}
                                users={users.map((u) => ({ id: u.id, username: u.username, nickname: u.nickname ?? null }))}
                                pricingRules={pricingRules}
                                exchangeRate={exchangeRate}
                                // [Velox v1.0] Preferred: Velox returns payload → AddTaskModal
                                // applies it to form. No self-create.
                                onApplyToForm={handleApplyVelox}
                            />
                        ) : mode === 'batch' && !submitted ? (
                            <BatchTaskTable
                                rows={batchRows}
                                onRowsChange={setBatchRows}
                                onExit={() => setExitBatchConfirmOpen(true)}
                                onSubmit={handleBatchSubmit}
                                submitting={submitting}
                                clients={clients}
                                users={users}
                                exchangeRate={exchangeRate}
                            />
                        ) : (
                        <div className="flex-1 overflow-y-auto px-6 pb-2 custom-scrollbar">
                            {submitted ? (
                                renderSuccess()
                            ) : (
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={step}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0.4 }}
                                        transition={{ duration: 0.15 }}
                                        className="py-1"
                                    >
                                        {renderStep()}
                                    </motion.div>
                                </AnimatePresence>
                            )}
                        </div>
                        )}

                        {/* -------- Footer (hidden in quickMode + batch mode — submit lives inside QuickCreateMode/BatchTaskTable) -------- */}
                        {!submitted && !quickMode && mode === 'single' && (
                            <div className="flex items-center justify-between px-6 py-4 border-t border-[rgba(139,92,246,0.08)]">
                                <button
                                    type="button"
                                    onClick={goBack}
                                    disabled={step === 0}
                                    className={`flex items-center gap-2 h-10 px-5 rounded-full bg-transparent border text-sm font-medium transition-colors ${step === 0
                                        ? "border-white/[0.04] text-zinc-700 cursor-default"
                                        : "border-[rgba(139,92,246,0.15)] text-[#A1A1AA] hover:text-white hover:border-[#8B5CF6]/40 cursor-pointer"
                                        }`}
                                >
                                    <ArrowLeft size={15} />
                                    Back
                                </button>

                                {step < STEPS.length - 1 ? (
                                    <button
                                        type="button"
                                        onClick={goNext}
                                        className="flex items-center gap-2 h-10 px-6 rounded-full bg-[#8B5CF6] hover:bg-[#A855F7] text-white text-sm font-semibold transition-colors shadow-[0_8px_20px_rgba(139,92,246,0.35)]"
                                    >
                                        Next
                                        <ArrowRight size={15} />
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={handleSubmit}
                                        disabled={submitting}
                                        className="flex items-center gap-2 h-10 px-6 rounded-full bg-[#8B5CF6] hover:bg-[#A855F7] text-white text-sm font-semibold transition-colors shadow-[0_8px_20px_rgba(139,92,246,0.35)] disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <Check size={15} />
                                        {submitting ? "Adding..." : "Add task"}
                                    </button>
                                )}
                            </div>
                        )}
                    </motion.div>
                </motion.div>
            )}

            {/* [Velox v1.0 spec 7.4] Conflict resolution dialog — renders above
                AddTaskModal when prefill detects existing form values. Higher z-index. */}
            <VeloxConflictDialog
                open={pendingPrefill !== null}
                conflicts={pendingPrefill?.conflicts ?? new Set()}
                onResolve={handleConflictResolve}
                onCancel={handleConflictCancel}
            />

            {/* [Velox v1.0 Phase 2 spec 5.4] Exit Batch confirmation — warns user
                that switching back to single mode discards all batch data. */}
            <AnimatePresence>
                {exitBatchConfirmOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                        onClick={() => setExitBatchConfirmOpen(false)}
                    >
                        <motion.div
                            initial={{ opacity: 0, y: 16, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 16, scale: 0.97 }}
                            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-sm rounded-3xl bg-zinc-950/95 backdrop-blur-xl border border-[rgba(245,158,11,0.20)] shadow-[0_24px_64px_rgba(0,0,0,0.6)] overflow-hidden p-6"
                        >
                            <h3 className="text-[15px] font-extrabold text-white mb-2">Thoát Batch?</h3>
                            <p className="text-[12px] text-zinc-400 mb-5 leading-relaxed">
                                Toàn bộ dữ liệu Velox + chỉnh sửa inline trong batch sẽ mất.
                                Bạn có chắc muốn quay về form single?
                            </p>
                            <div className="flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setExitBatchConfirmOpen(false)}
                                    className="px-4 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.10] text-[12px] text-zinc-300 font-semibold transition-colors"
                                >
                                    Giữ batch
                                </button>
                                <button
                                    type="button"
                                    onClick={confirmExitBatch}
                                    className="px-4 py-2 rounded-full bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-[12px] text-red-200 font-bold transition-colors"
                                >
                                    Thoát + xóa
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </AnimatePresence>
    )
}
