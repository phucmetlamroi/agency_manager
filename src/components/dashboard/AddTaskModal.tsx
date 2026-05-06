"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  X,
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardList,
  Video,
  Banknote,
  Link as LinkIcon,
  CheckCircle,
  FileText,
  Search,
} from "lucide-react"

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
  notesVi: string
  notesEn: string
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
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STEPS = [
  { label: "General", icon: ClipboardList },
  { label: "Video", icon: Video },
  { label: "Finance", icon: Banknote },
  { label: "Resources", icon: LinkIcon },
  { label: "Notes", icon: FileText },
  { label: "Review", icon: CheckCircle },
] as const

const TASK_TYPES = ["SHORT", "LONG", "TRIAL"] as const

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
  notesVi: "",
  notesEn: "",
}

const USD_TO_VND = 25_000

/* ------------------------------------------------------------------ */
/*  Neon Purple input styles                                           */
/* ------------------------------------------------------------------ */

const inputBase =
  "h-11 w-full rounded-full bg-white/[0.04] border border-[rgba(139,92,246,0.12)] px-[18px] text-[13px] text-zinc-300 placeholder:text-zinc-600 outline-none transition-colors focus:border-[#8B5CF6]/50 focus:bg-white/[0.06]"

const selectBase =
  "h-11 w-full rounded-full bg-white/[0.04] border border-[rgba(139,92,246,0.12)] px-[18px] pr-10 text-[13px] text-zinc-300 outline-none appearance-none cursor-pointer transition-colors focus:border-[#8B5CF6]/50 focus:bg-white/[0.06]"

const textareaBase =
  "w-full rounded-2xl bg-white/[0.04] border border-[rgba(139,92,246,0.12)] px-[18px] py-3 text-[13px] text-zinc-300 placeholder:text-zinc-600 leading-[1.6] outline-none resize-none transition-colors focus:border-[#8B5CF6]/50 focus:bg-white/[0.06]"

const linkInputBase =
  "h-11 w-full rounded-full bg-white/[0.04] border border-[rgba(139,92,246,0.12)] pl-[38px] pr-[18px] text-[13px] text-zinc-300 placeholder:text-zinc-600 outline-none transition-colors focus:border-[#8B5CF6]/50 focus:bg-white/[0.06]"

/* ------------------------------------------------------------------ */
/*  Small sub-components                                               */
/* ------------------------------------------------------------------ */

function SelectChevron() {
  return (
    <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#A1A1AA]">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

function LinkFieldIcon() {
  return (
    <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#A1A1AA]">
      <LinkIcon size={14} />
    </div>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between p-[10px_14px] rounded-xl bg-white/[0.03] border border-[rgba(139,92,246,0.08)]">
      <span className="text-xs text-[#A1A1AA] font-semibold">{label}</span>
      <span className="text-[13px] text-zinc-300 font-semibold capitalize max-w-[60%] text-right truncate">
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
                  className={`w-full text-left px-4 py-2.5 text-[13px] transition-colors ${
                    o.id === selectedId
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
/*  Step Indicator                                                     */
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
                className={`relative z-10 flex items-center justify-center w-9 h-9 rounded-full text-xs font-bold transition-all duration-200 cursor-pointer ${
                  isActive
                    ? "bg-[#8B5CF6] border-2 border-[#A855F7] text-white shadow-[0_4px_20px_rgba(139,92,246,0.35)]"
                    : isCompleted
                      ? "bg-[#8B5CF6]/25 border-2 border-[#8B5CF6]/50 text-[#D8B4FE] shadow-[0_4px_16px_rgba(139,92,246,0.15)]"
                      : "bg-white/[0.06] border-2 border-white/[0.08] text-zinc-500"
                }`}
              >
                {isCompleted ? <Check size={13} strokeWidth={3} className="text-[#D8B4FE]" /> : i + 1}
              </button>
              <span
                className={`text-[10px] leading-none transition-colors duration-200 ${
                  isActive
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
                className={`flex-1 min-w-[12px] h-[2px] mx-0.5 transition-colors duration-200 ${
                  isCompleted ? "bg-[#8B5CF6]/40" : "bg-white/[0.06]"
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

  useEffect(() => {
    if (open) {
      setStep(0)
      setForm({ ...INITIAL_FORM })
      setSubmitted(false)
      setSubmitting(false)
    }
  }, [open])

  /* ---- helpers ---- */

  const set = <K extends keyof TaskFormData>(key: K, value: TaskFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const jobPriceNum = parseFloat(form.jobPriceUSD) || 0
  const editorFeeNum = parseFloat(form.editorFee) || 0
  const revenueVND = jobPriceNum * USD_TO_VND - editorFeeNum
  const revenuePercent =
    jobPriceNum > 0
      ? Math.min(100, Math.max(0, (revenueVND / (jobPriceNum * USD_TO_VND)) * 100))
      : 0

  const clientName =
    clients.find((c) => c.id === form.clientId)?.name ?? ""
  const assigneeName =
    users.find((u) => u.id === form.assigneeId)?.nickname ??
    users.find((u) => u.id === form.assigneeId)?.username ??
    ""

  const stepTitle = STEPS[step]?.label ?? ""
  const stepSubtitles = [
    "Set the basic task details",
    "Add video names for this task",
    "Define pricing and editor compensation",
    "Attach resource links for this task",
    "Manager instructions and client requests",
    "Review everything before submitting",
  ]

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
    } catch {
      // Keep modal open on error
    } finally {
      setSubmitting(false)
    }
  }

  const handleDone = () => {
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
              <label className="text-xs text-[#A1A1AA] font-medium pl-1">Client</label>
              <AutocompleteInput
                selectedId={form.clientId}
                onSelect={(id) => set("clientId", id)}
                options={clientOptions}
                placeholder="Search client..."
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
                <label className="text-xs text-[#A1A1AA] font-medium pl-1">Deadline</label>
                <input
                  type="date"
                  className={inputBase}
                  value={form.deadline}
                  onChange={(e) => set("deadline", e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-[#A1A1AA] font-medium pl-1">Assignee</label>
              <AutocompleteInput
                selectedId={form.assigneeId}
                onSelect={(id) => set("assigneeId", id)}
                options={userOptions}
                placeholder="Search assignee..."
                emptyLabel="Leave Blank (Task Pool)"
              />
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
                style={{ minHeight: 200 }}
                placeholder="Video name..."
                value={form.videoList}
                onChange={(e) => set("videoList", e.target.value)}
              />
            </div>
            <p className="text-[11px] text-zinc-600 pl-1">
              {form.videoList.split("\n").filter((l) => l.trim()).length} video(s) added
            </p>
          </div>
        )

      /* ============ STEP 3 : Finance ============ */
      case 2:
        return (
          <div className="flex flex-col gap-5">
            <div className="flex gap-3">
              <div className="flex-1 flex flex-col gap-1.5">
                <label className="text-xs text-[#A1A1AA] font-medium pl-1">Job Price (USD)</label>
                <input
                  type="number"
                  className={inputBase}
                  placeholder="0.00"
                  value={form.jobPriceUSD}
                  onChange={(e) => set("jobPriceUSD", e.target.value)}
                />
              </div>

              <div className="flex-1 flex flex-col gap-1.5">
                <label className="text-xs text-[#A1A1AA] font-medium pl-1">Editor Fee (VND)</label>
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
                <span className="text-xs text-[#A1A1AA] font-medium">Estimated Revenue</span>
                <span
                  className={`text-[13px] font-bold ${
                    revenueVND >= 0 ? "text-emerald-400" : "text-red-400"
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

      /* ============ STEP 4 : Resources (6 link fields) ============ */
      case 3:
        return (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ["rawFootage", "Raw Footage"],
                  ["collectFile", "Collect File"],
                  ["bRoll", "B-Rolls"],
                  ["references", "Reference"],
                  ["submitFolder", "Submit Folder"],
                  ["script", "Script"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <label className="text-xs text-[#A1A1AA] font-medium pl-1">{label}</label>
                  <div className="relative">
                    <LinkFieldIcon />
                    <input
                      type="url"
                      className={linkInputBase}
                      placeholder="https://..."
                      value={form[key]}
                      onChange={(e) => set(key, e.target.value)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )

      /* ============ STEP 5 : Notes ============ */
      case 4:
        return (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-[#A1A1AA] font-medium pl-1">Manager Instruction</label>
              <textarea
                className={textareaBase}
                style={{ minHeight: 100 }}
                placeholder="Hướng dẫn từ quản lý..."
                value={form.notesVi}
                onChange={(e) => set("notesVi", e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-[#A1A1AA] font-medium pl-1">Client Request</label>
              <textarea
                className={textareaBase}
                style={{ minHeight: 100 }}
                placeholder="Yêu cầu từ khách hàng..."
                value={form.notesEn}
                onChange={(e) => set("notesEn", e.target.value)}
              />
            </div>
          </div>
        )

      /* ============ STEP 6 : Review ============ */
      case 5:
        return (
          <div className="flex flex-col gap-2">
            <ReviewRow label="Client" value={clientName} />
            <ReviewRow label="Task Type" value={form.taskType} />
            <ReviewRow label="Deadline" value={form.deadline} />
            <ReviewRow label="Assignee" value={assigneeName} />
            <ReviewRow
              label="Videos"
              value={`${form.videoList.split("\n").filter((l) => l.trim()).length} video(s)`}
            />
            <ReviewRow label="Job Price" value={form.jobPriceUSD ? `$${form.jobPriceUSD}` : ""} />
            <ReviewRow
              label="Editor Fee"
              value={form.editorFee ? `${parseFloat(form.editorFee).toLocaleString("vi-VN")} VND` : ""}
            />
            <ReviewRow
              label="Revenue"
              value={`${revenueVND.toLocaleString("vi-VN")} VND`}
            />
            <ReviewRow label="Raw Footage" value={form.rawFootage} />
            <ReviewRow label="Collect File" value={form.collectFile} />
            <ReviewRow label="B-Rolls" value={form.bRoll} />
            <ReviewRow label="Reference" value={form.references} />
            <ReviewRow label="Submit Folder" value={form.submitFolder} />
            <ReviewRow label="Script" value={form.script} />
            <ReviewRow label="Manager Instruction" value={form.notesVi} />
            <ReviewRow label="Client Request" value={form.notesEn} />
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
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <motion.div
            className="relative w-full max-w-[620px] max-h-[85vh] flex flex-col rounded-3xl border border-[rgba(139,92,246,0.15)] shadow-[0_32px_80px_rgba(0,0,0,0.60)] overflow-hidden"
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
                  <p className="text-xs text-[#A1A1AA] mt-0.5">{stepSubtitles[step]}</p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex items-center justify-center w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-[#A1A1AA] hover:text-white transition-colors"
                >
                  <X size={16} />
                </button>
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
                  className={`flex items-center gap-2 h-10 px-5 rounded-full bg-transparent border text-sm font-medium transition-colors ${
                    step === 0
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
                    {submitting ? "Adding..." : "Add Task"}
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
