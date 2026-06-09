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
import VeloxRawFootagesModal from "./VeloxRawFootagesModal"
import VeloxMultiHookMapEditor from "@/components/velox/VeloxMultiHookMapEditor"
import { AutocompleteInput } from "@/components/ui/AutocompleteInput"
import {
    mapVeloxPayloadToFormData,
    mapPayloadV3ToFormData,
    detectFieldConflicts,
    applyPrefill,
    getVeloxFieldMeta,
    type VeloxApplyPayload,
    type VeloxApplyPayloadV3,
    type VeloxFormPrefill,
} from "@/lib/velox-helpers"

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
    /**
     * Called on Add task click. Options:
     *   - veloxBatchRaw (V1): per-row primary URL array (1-to-1 với videoList).
     *     Used for V1 path → createTasksFromBatch with shared metadata.
     *   - veloxV3Payload: full V3 payload with mainItems + broll + sharedAssets +
     *     briefingDocs. Used for V3 path → createTasksFromBatch with per-task
     *     encoded resources (RAW_HOOKS, RAW_AROLL, SHARED_xxx, BROLL_xxx, BRIEF).
     */
    onSubmit?: (
        data: TaskFormData,
        options?: {
            veloxBatchRaw?: string[]
            veloxV3Payload?: VeloxApplyPayloadV3
            /** [Velox v4] Confirmed Multi-Hook Map — wrapper persists it via
             *  saveRawFootageMap after the task row is created. */
            veloxMapV4?: import('@/lib/velox/v4-types').VeloxScanResult
        },
    ) => void | Promise<void>
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

    // [Velox v1.0 — Phase 2 redesign] Per-video rawFootage URLs from Velox.
    // When N≥2 videos applied, each video has its own raw link. Stored here
    // (1:1 with videoList lines by index). Empty array = no Velox batch state.
    //
    // UX: Step 4 rawFootage cell shows "🚀 N link đã được trích xuất từ
    // Velox · Bấm để chỉnh sửa" when this array is non-empty. Click opens
    // VeloxRawFootagesModal for editing per-video URLs. On submit, these
    // are passed to DashboardActionWrapper which routes to
    // createTasksFromBatch (per-row resources) instead of createBatchTasks
    // (shared rawFootage).
    const [veloxBatchRaw, setVeloxBatchRaw] = useState<string[]>([])
    const [rawFootagesModalOpen, setRawFootagesModalOpen] = useState(false)
    /**
     * [Velox Deep Scan v3.1] Stash full V3 payload after apply. Used at submit
     * time to encode per-task resources (RAW_HOOKS, RAW_AROLL, SHARED_xxx,
     * BROLL_xxx). Cleared on close / successful submit / V1 apply.
     */
    const [veloxV3Payload, setVeloxV3Payload] = useState<VeloxApplyPayloadV3 | null>(null)

    // [Velox v4 — Multi-Hook Map] Step 4 raw-footage display mode toggle.
    // PER_LINK keeps the legacy 6-field grid (default — no behavioural change
    // for existing flows). MULTI_HOOK_MAP mounts the v4 editor in place of
    // the grid and stashes the user-confirmed VeloxScanResult so handleSubmit
    // can pass it to DashboardActionWrapper for saveRawFootageMap.
    const [rawFootageMode, setRawFootageMode] = useState<'PER_LINK' | 'MULTI_HOOK_MAP'>('PER_LINK')
    const [veloxMapV4, setVeloxMapV4] = useState<import('@/lib/velox/v4-types').VeloxScanResult | null>(null)

    // [Bug fix] Pad veloxBatchRaw with '' khi user thêm dòng vào videoList.
    // KHÔNG truncate khi user xóa dòng — vì truncate có thể MẤT URLs nếu
    // form.videoList tạm thời chưa match (vd: sau conflict dialog 'keep'
    // hoặc khi user undo videoList changes). veloxBatchRaw là source of
    // truth cho per-video URLs; videoList chỉ ảnh hưởng UI hiển thị.
    useEffect(() => {
        if (veloxBatchRaw.length === 0) return
        const lineCount = form.videoList
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean).length
        if (lineCount <= veloxBatchRaw.length) return
        setVeloxBatchRaw((prev) => [
            ...prev,
            ...Array(lineCount - prev.length).fill(''),
        ])
    }, [form.videoList, veloxBatchRaw.length])

    // [Sprint Z+1] Auto-save draft tới localStorage (Google Docs–style).
    // Reset trên mỗi keystroke; idle 3 phút → expire.
    // Key per-workspace để tránh cross-contamination giữa các workspace.
    //
    // [Velox v1.1 fix] Draft now also includes veloxBatchRaw (per-video raw
    // URLs) + veloxFilledFields (green badge tracker for fields auto-filled
    // by Velox). Set is serialized as string[] for JSON compat. This way,
    // user close modal sau Velox apply → re-open vẫn thấy:
    //   - Common form data (đã có sẵn ở v1.0)
    //   - The "X link đã được trích xuất từ Velox" summary chip ở Step 4
    //   - Green 🚀 badge trên các field được Velox prefill
    const DRAFT_KEY = `addTask:draft:${workspaceId}`
    const { restored, clearDraft, savedAt } = useAutoSaveDraft<{
        form: TaskFormData
        step: number
        veloxBatchRaw: string[]
        veloxFilledFields: string[]
    }>(
        DRAFT_KEY,
        {
            form,
            step,
            veloxBatchRaw,
            veloxFilledFields: Array.from(veloxFilledFields),
        },
        (draft) => {
            // Restore từ localStorage khi mở modal
            setForm(draft.form)
            setStep(draft.step)
            // Velox state restore — guard against older draft shapes (pre-v1.1)
            // that lack these keys → default to empty.
            if (Array.isArray(draft.veloxBatchRaw)) {
                setVeloxBatchRaw(draft.veloxBatchRaw)
            }
            if (Array.isArray(draft.veloxFilledFields)) {
                setVeloxFilledFields(
                    new Set(draft.veloxFilledFields as (keyof VeloxFormPrefill)[]),
                )
            }
        },
        {
            ttlMs: 3 * 60 * 1000, // 3 phút sliding TTL
            debounceMs: 500,
            enabled: open && !submitted, // chỉ save khi modal đang mở + chưa submit
            shouldSave: ({ form, veloxBatchRaw, veloxFilledFields }) => {
                // Save nếu form có content HOẶC Velox đã apply (kể cả form chưa
                // hoàn chỉnh, có Velox state là đáng save vì user đã đầu tư công
                // scan folder).
                return Boolean(
                    veloxBatchRaw.length > 0 ||
                        veloxFilledFields.length > 0 ||
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

    /* ────────────────────────────────────────────────────────────────
       [Velox Deep Scan v3.1] V3 apply handler
       ──────────────────────────────────────────────────────────────── */

    const handleApplyVeloxV3 = (payload: VeloxApplyPayloadV3) => {
        // Build pricing hints from MainItems (V3 doesn't carry per-row price in
        // mainItem directly — only via taskNameByMode. Pricing happens server-side
        // at createTasksFromBatch time. For form prefill we use durationSeconds
        // for taskType classification.)
        const pricingHints = payload.mainItems.map((m) => ({
            durationSeconds: m.durationSeconds,
        }))

        const { prefill, filledFields } = mapPayloadV3ToFormData(payload, pricingHints)

        // [Bug fix] Drop the `payload.broll !== null` gate — chip + popup should
        // hiển thị cho MỌI multi-item case (≥2), bất kể có broll hay không.
        // Trước đây, 18 video không có broll subfolder → veloxBatchRaw bị clear,
        // chip không render → user mất khả năng review/edit URLs.
        if (payload.mainItems.length >= 2) {
            // Multi-item: store per-task primary RAW URL. Encoding cuối cùng
            // (RAW_HOOKS / RAW_AROLL / SHARED / BROLL / BRIEF) xử lý ở submit time
            // qua DashboardActionWrapper.encodeResourcesV3.
            delete prefill.rawFootage
            filledFields.delete('rawFootage')
            setVeloxBatchRaw(payload.mainItems.map((m) => m.previewUrl ?? ''))
        } else if (payload.mainItems.length === 1) {
            // Single — prefill rawFootage from primary
            prefill.rawFootage = payload.mainItems[0].previewUrl
            filledFields.add('rawFootage')
            setVeloxBatchRaw([])
        } else {
            setVeloxBatchRaw([])
        }

        // Stash V3 result on form via assetsContext (consumed at submit)
        setVeloxV3Payload(payload)

        // Conflict detection (notes append exception)
        const noteAppendException =
            payload.appendBriefToNotes &&
            Boolean(form.notes?.replace(/<[^>]*>/g, '').trim()) &&
            payload.briefingDocs.length > 0

        const conflicts = detectFieldConflicts(
            form as unknown as Record<string, string>,
            prefill,
            { skipNotes: noteAppendException },
        )

        if (conflicts.size === 0) {
            applyVeloxPrefill(prefill, filledFields, 'overwrite')
            setQuickMode(false)
            return
        }

        setPendingPrefill({ prefill, filledFields, conflicts })
    }

    const handleApplyVelox = (payload: VeloxApplyPayload | VeloxApplyPayloadV3) => {
        // ─── V3 path: Deep Scan with full ScanResult ────────────────
        if ('version' in payload && payload.version === 'v3') {
            handleApplyVeloxV3(payload)
            return
        }

        // ─── V1 path: legacy flat scan ──────────────────────────────
        const v1 = payload as VeloxApplyPayload
        const selectedRows = v1.rows.filter((r) => r.selected)

        // [Velox v1.0 Phase 2 redesign] N≥2 → keep wizard UI 100% (no Batch
        // Table). Map common fields normally via mapVeloxPayloadToFormData
        // (uses row 1 for taskType/price). For per-video raw footage URLs,
        // store them in veloxBatchRaw state (1:1 with videoList lines).
        // Step 4 rendering switches rawFootage cell into a clickable
        // "X link đã được trích xuất từ Velox" summary that opens an edit
        // popup. On submit, parent routes to createTasksFromBatch when this
        // state is set.
        const { prefill, filledFields } = mapVeloxPayloadToFormData(v1)

        // Clear V3 state when V1 apply fires (mutually exclusive flow)
        setVeloxV3Payload(null)

        if (selectedRows.length >= 2 && v1.toggles.linkFootage) {
            // Drop rawFootage from prefill — UI uses the summary marker instead
            delete prefill.rawFootage
            filledFields.delete('rawFootage')
            setVeloxBatchRaw(selectedRows.map((r) => r.previewUrl ?? ''))
        } else {
            // Single video OR linkFootage toggle OFF → clear any stale batch state
            setVeloxBatchRaw([])
        }

        // Spec 7.4 exception: when kế thừa note ON + form notes already has content
        // → automatic append (no dialog ask).
        const noteAppendException =
            v1.toggles.inheritNotes &&
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
            // [Velox v1.0 Phase 2 + v3.1] Pass either V1 (veloxBatchRaw) or V3
            // (veloxV3Payload) to parent. Parent routes accordingly:
            //  - V3 payload → createTasksFromBatch với per-task encoded resources
            //  - V1 batchRaw → createTasksFromBatch với primary RAW only
            //  - Neither → standard createTask / createBatchTasks
            const options =
                veloxV3Payload != null
                    ? { veloxV3Payload }
                    : veloxBatchRaw.length > 0
                      ? { veloxBatchRaw }
                      : undefined
            // [Velox v4] Attach the Multi-Hook Map payload so
            // DashboardActionWrapper can persist it to TaskRawFootage after
            // the task row is created. Falls back to legacy submit when the
            // editor wasn't used.
            const optionsWithMap =
                rawFootageMode === 'MULTI_HOOK_MAP' && veloxMapV4
                    ? { ...(options ?? {}), veloxMapV4 }
                    : options
            await onSubmit?.(form, optionsWithMap)
            setSubmitted(true)
            // [Auto-save] Clear draft khi submit success — không còn cần restore
            clearDraft()
            // [Velox v1.0 spec 7.2] Reset cả form + Velox indicator state on successful create
            setVeloxFilledFields(new Set())
            setVeloxBatchRaw([])
            setVeloxV3Payload(null)
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
        setVeloxBatchRaw([])
        setVeloxV3Payload(null)
        onClose()
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
                        {/* [Velox v4] Display mode toggle — keeps the legacy 6-field grid
                            on the left tab (PER_LINK) and surfaces the new Multi-Hook
                            Map editor on the right tab. Mode persists to TaskRawFootage
                            via DashboardActionWrapper after task creation. */}
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="inline-flex items-center gap-0 rounded-full p-1 border border-white/10 bg-zinc-900/40">
                                <button
                                    type="button"
                                    onClick={() => setRawFootageMode('PER_LINK')}
                                    className={[
                                        'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold transition-colors',
                                        rawFootageMode === 'PER_LINK'
                                            ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-md shadow-violet-500/30'
                                            : 'text-zinc-400 hover:text-white',
                                    ].join(' ')}
                                >
                                    Link lẻ
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setRawFootageMode('MULTI_HOOK_MAP')}
                                    className={[
                                        'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold transition-colors',
                                        rawFootageMode === 'MULTI_HOOK_MAP'
                                            ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-md shadow-violet-500/30'
                                            : 'text-zinc-400 hover:text-white',
                                    ].join(' ')}
                                >
                                    🗺 Multi-Hook Map
                                </button>
                            </div>
                            {rawFootageMode === 'MULTI_HOOK_MAP' && veloxMapV4 && (
                                <span className="text-[11px] font-mono text-emerald-400">
                                    ✓ {veloxMapV4.stats.conceptsDetected} concept · {veloxMapV4.stats.mappedFiles} file
                                </span>
                            )}
                        </div>

                        {rawFootageMode === 'MULTI_HOOK_MAP' ? (
                            <VeloxMultiHookMapEditor
                                workspaceId={workspaceId}
                                initialMap={veloxMapV4 ?? undefined}
                                onChange={setVeloxMapV4}
                            />
                        ) : (
                        /* URL fields — 6 in 3×2 grid matching Figma layout exactly */
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
                                // VeloxField indicator: 'rawFootage' (link footage) hoặc 'script'
                                // (script/transcript). Other fields chưa được Velox prefill.
                                const isVeloxFilled =
                                    (key === 'rawFootage' && veloxFilledFields.has('rawFootage')) ||
                                    (key === 'script' && veloxFilledFields.has('script'))

                                // [Velox v1.0 Phase 2 redesign] When N≥2 raw links exist, show
                                // a clickable summary instead of the single input. Click opens
                                // VeloxRawFootagesModal where user edits per-video URLs.
                                if (key === 'rawFootage' && veloxBatchRaw.length > 0) {
                                    const filledCount = veloxBatchRaw.filter((u) => u.trim()).length
                                    return (
                                        <div key={key} className="flex flex-col gap-2">
                                            <label className="text-[14px] text-white font-bold pl-1">{label}</label>
                                            <button
                                                type="button"
                                                onClick={() => setRawFootagesModalOpen(true)}
                                                className="group flex items-center justify-between gap-2 h-11 w-full rounded-full bg-emerald-500/[0.06] border border-emerald-500/25 px-[18px] text-[13px] text-emerald-200 hover:bg-emerald-500/[0.10] hover:border-emerald-500/40 transition-colors text-left"
                                                title="Bấm để chỉnh sửa link raw từng video"
                                            >
                                                <span className="flex items-center gap-2 min-w-0">
                                                    <Rocket size={13} className="shrink-0 text-emerald-300" />
                                                    <span className="truncate font-semibold">
                                                        {filledCount}/{veloxBatchRaw.length} link đã được trích xuất từ Velox
                                                    </span>
                                                </span>
                                                <span className="text-[11px] text-emerald-300/70 group-hover:text-emerald-200 shrink-0">
                                                    Bấm để chỉnh sửa
                                                </span>
                                            </button>
                                        </div>
                                    )
                                }

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
                                                featureName={getVeloxFieldMeta(
                                                    key === 'script' ? 'script' : 'rawFootage',
                                                )}
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
                        )}

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
                        className="relative w-full max-w-[680px] max-h-[88vh] flex flex-col rounded-3xl border border-[rgba(139,92,246,0.15)] shadow-[0_32px_80px_rgba(0,0,0,0.60)] overflow-hidden"
                        style={{ background: "rgba(10,10,10,0.95)", backdropFilter: "blur(24px)" }}
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
                                                Velox
                                            </>
                                        ) : (
                                            <>Step {step + 1}. {stepTitle}:</>
                                        )}
                                    </h2>
                                    <p className="text-xs text-[#A1A1AA] mt-0.5">
                                        {quickMode
                                            ? 'Velox — dán link folder, tạo batch trong 1 click'
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
                                                  : 'Mở Velox'
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

                        {/* -------- Step Indicator -------- */}
                        {!submitted && !quickMode && (
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
                                // [Velox v1.0] Velox returns payload → AddTaskModal applies it
                                // to form. No self-create. N≥2 multi-link goes into veloxBatchRaw
                                // state + summary marker in Step 4 (Phase 2 redesign).
                                onApplyToForm={handleApplyVelox}
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

                        {/* -------- Footer (hidden in quickMode — submit lives inside QuickCreateMode) -------- */}
                        {!submitted && !quickMode && (
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

            {/* [Velox v1.0 Phase 2 redesign] Per-video raw footage editor — opens
                from the Step 4 rawFootage summary when N≥2 videos were applied via
                Velox. Edits 1:1 array aligned with videoList lines. */}
            <VeloxRawFootagesModal
                open={rawFootagesModalOpen}
                onClose={() => setRawFootagesModalOpen(false)}
                videoTitles={form.videoList.split('\n').map((s) => s.trim()).filter(Boolean)}
                urls={veloxBatchRaw}
                onChange={(nextUrls) => setVeloxBatchRaw(nextUrls)}
            />
        </AnimatePresence>
    )
}
