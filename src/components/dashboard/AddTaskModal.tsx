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
} from "lucide-react"
import dynamic from "next/dynamic"
import { useAutoSaveDraft } from "@/hooks/useAutoSaveDraft"

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
    users: Array<{ id: string; username: string; nickname?: string | null }>
    onSubmit?: (data: TaskFormData) => void | Promise<void>
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

function AutocompleteInput({
    selectedId,
    onSelect,
    options,
    placeholder,
    emptyLabel,
}: {
    selectedId: string
    onSelect: (id: string) => void
    options: Array<{ id: string; label: string; parentLabel?: string }>
    placeholder: string
    emptyLabel?: string
}) {
    const [query, setQuery] = useState("")
    const [isOpen, setIsOpen] = useState(false)
    const [isSearching, setIsSearching] = useState(false)
    const wrapperRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    const selectedOption = options.find((o) => o.id === selectedId)

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setIsOpen(false)
                setIsSearching(false)
                setQuery("")
            }
        }
        document.addEventListener("mousedown", handler)
        return () => document.removeEventListener("mousedown", handler)
    }, [])

    useEffect(() => {
        if (!selectedId) {
            setQuery("")
            setIsSearching(false)
        }
    }, [selectedId])

    const filtered = query
        ? options.filter((o) => {
            const searchStr = o.parentLabel ? `${o.parentLabel} ${o.label}` : o.label
            return searchStr.toLowerCase().includes(query.toLowerCase())
        })
        : options

    const displayValue = isSearching
        ? query
        : selectedOption
            ? selectedOption.parentLabel
                ? `${selectedOption.parentLabel} / ${selectedOption.label}`
                : selectedOption.label
            : ""

    return (
        <div ref={wrapperRef} className="relative">
            <div className="relative">
                <div className="pointer-events-none absolute left-[14px] top-1/2 -translate-y-1/2 text-[#71717A]">
                    <Search size={14} />
                </div>
                <input
                    ref={inputRef}
                    className="h-11 w-full rounded-full bg-white/[0.04] border border-[rgba(139,92,246,0.12)] pl-9 pr-9 text-[13px] text-zinc-300 placeholder:text-zinc-600 outline-none transition-colors focus:border-[#8B5CF6]/50 focus:bg-white/[0.06]"
                    placeholder={placeholder}
                    value={displayValue}
                    onChange={(e) => {
                        if (selectedId && !isSearching) {
                            onSelect("")
                        }
                        setQuery(e.target.value)
                        setIsSearching(true)
                        setIsOpen(true)
                    }}
                    onFocus={() => {
                        setIsOpen(true)
                        if (selectedId) {
                            setIsSearching(true)
                            setQuery("")
                        }
                    }}
                />
                {selectedId && !isSearching && (
                    <button
                        type="button"
                        onClick={() => {
                            onSelect("")
                            setIsSearching(true)
                            setQuery("")
                            inputRef.current?.focus()
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A1A1AA] hover:text-white transition-colors"
                    >
                        <X size={14} />
                    </button>
                )}
            </div>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-full mt-1.5 left-0 w-full z-50 max-h-[200px] overflow-y-auto rounded-2xl border border-[rgba(139,92,246,0.15)] bg-[#0A0A0A] shadow-[0_16px_48px_rgba(0,0,0,0.5)] custom-scrollbar"
                    >
                        {emptyLabel && (
                            <button
                                type="button"
                                onClick={() => {
                                    onSelect("")
                                    setIsOpen(false)
                                    setIsSearching(false)
                                    setQuery("")
                                }}
                                className="w-full text-left px-4 py-2.5 text-[13px] text-zinc-500 hover:bg-white/[0.06] transition-colors"
                            >
                                {emptyLabel}
                            </button>
                        )}
                        {filtered.length > 0 ? (
                            filtered.map((o) => (
                                <button
                                    key={o.id}
                                    type="button"
                                    onClick={() => {
                                        onSelect(o.id)
                                        setIsOpen(false)
                                        setIsSearching(false)
                                        setQuery("")
                                    }}
                                    className={`w-full text-left px-4 py-2.5 text-[13px] transition-colors ${o.id === selectedId
                                        ? "bg-[#8B5CF6]/10 text-white"
                                        : "text-zinc-300 hover:bg-white/[0.06]"
                                        }`}
                                >
                                    {o.parentLabel ? (
                                        <>
                                            <span className="text-zinc-500">{o.parentLabel}</span>
                                            <span className="text-zinc-600 mx-1">/</span>
                                            <span>{o.label}</span>
                                        </>
                                    ) : (
                                        o.label
                                    )}
                                </button>
                            ))
                        ) : (
                            <div className="px-4 py-3 text-[13px] text-zinc-600">No results found</div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

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
}: AddTaskModalProps) {
    const [step, setStep] = useState(0)
    const [form, setForm] = useState<TaskFormData>({ ...INITIAL_FORM })
    const [submitted, setSubmitted] = useState(false)
    const [submitting, setSubmitting] = useState(false)

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

    const set = <K extends keyof TaskFormData>(key: K, value: TaskFormData[K]) =>
        setForm((prev) => ({ ...prev, [key]: value }))

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
    const assigneeName =
        users.find((u) => u.id === form.assigneeId)?.nickname ??
        users.find((u) => u.id === form.assigneeId)?.username ??
        ""
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
                    label: u.nickname ?? u.username,
                }))
                return (
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs text-[#A1A1AA] font-medium pl-1">Client&apos;s name</label>
                            <AutocompleteInput
                                selectedId={form.clientId}
                                onSelect={(id) => set("clientId", id)}
                                options={clientOptions}
                                placeholder="Search client..."
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs text-[#A1A1AA] font-medium pl-1">Editor&apos;s name</label>
                            <AutocompleteInput
                                selectedId={form.assigneeId}
                                onSelect={(id) => set("assigneeId", id)}
                                options={userOptions}
                                placeholder="Search assignee..."
                                emptyLabel="Leave Blank (Task Pool)"
                            />
                        </div>

                        <div className="flex gap-3">
                            <div className="flex-1 flex flex-col gap-1.5">
                                <label className="text-xs text-[#A1A1AA] font-medium pl-1">Task Type</label>
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
                            </div>

                            <div className="flex-1 flex flex-col gap-1.5">
                                <label className="text-xs text-[#A1A1AA] font-medium pl-1">Deadline (ngày & giờ)</label>
                                <input
                                    type="datetime-local"
                                    className={inputBase}
                                    value={form.deadline}
                                    onChange={(e) => set("deadline", e.target.value)}
                                />
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
                            <textarea
                                className={textareaBase}
                                style={{ minHeight: 220 }}
                                placeholder="Video name (one per line)..."
                                value={form.videoList}
                                onChange={(e) => set("videoList", e.target.value)}
                            />
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
                                <input
                                    type="number"
                                    className={inputBase}
                                    placeholder="0.00"
                                    value={form.jobPriceUSD}
                                    onChange={(e) => set("jobPriceUSD", e.target.value)}
                                />
                            </div>

                            <div className="flex-1 flex flex-col gap-1.5">
                                <label className="text-xs text-[#A1A1AA] font-medium pl-1">Editor Reward (VND)</label>
                                <input
                                    type="number"
                                    className={inputBase}
                                    placeholder="0"
                                    value={form.editorFee}
                                    onChange={(e) => set("editorFee", e.target.value)}
                                />
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
                            ).map(([key, label, placeholder]) => (
                                <div key={key} className="flex flex-col gap-2">
                                    <label className="text-[14px] text-white font-bold pl-1">{label}</label>
                                    <input
                                        type="url"
                                        className="h-11 w-full rounded-full bg-white/[0.04] border border-[rgba(139,92,246,0.12)] px-[18px] text-[13px] text-zinc-300 placeholder:text-zinc-600 outline-none transition-colors focus:border-[#8B5CF6]/50 focus:bg-white/[0.06]"
                                        placeholder={placeholder}
                                        value={form[key]}
                                        onChange={(e) => set(key, e.target.value)}
                                    />
                                </div>
                            ))}
                        </div>

                        {/* Notes — single TipTap rich-text editor (Figma's centerpiece in Step 4) */}
                        <div className="flex flex-col gap-2">
                            <label className="text-[14px] text-white font-bold pl-1">Notes</label>
                            <div className="rounded-2xl bg-white/[0.04] border border-[rgba(139,92,246,0.12)] overflow-hidden">
                                <TiptapEditor
                                    content={form.notes}
                                    onChange={(html) => set("notes", html)}
                                />
                            </div>
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
                                        Step {step + 1}. {stepTitle}:
                                    </h2>
                                    <p className="text-xs text-[#A1A1AA] mt-0.5">{stepSubtitle}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {/* [Auto-save] Indicator — Google Docs–style "Đã lưu nháp" */}
                                    <AutoSaveIndicator savedAt={savedAt} />
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
                        {!submitted && <StepIndicator current={step} total={STEPS.length} onStepClick={setStep} />}

                        {/* -------- Content -------- */}
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

                        {/* -------- Footer -------- */}
                        {!submitted && (
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
        </AnimatePresence>
    )
}
