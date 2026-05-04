"use client"

import { useState, useEffect } from "react"
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
  bRoll: string
  sampleProject: string
  submissionFolder: string
  references: string
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
  onSubmit?: (data: TaskFormData) => void
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STEPS = [
  { label: "General", icon: ClipboardList },
  { label: "Video", icon: Video },
  { label: "Finance", icon: Banknote },
  { label: "Resources", icon: LinkIcon },
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
  bRoll: "",
  sampleProject: "",
  submissionFolder: "",
  references: "",
  notesVi: "",
  notesEn: "",
}

const USD_TO_VND = 25_000

/* ------------------------------------------------------------------ */
/*  Shared input styles                                                */
/* ------------------------------------------------------------------ */

const inputBase =
  "h-11 w-full rounded-full bg-white/[0.04] border border-white/[0.08] px-[18px] text-[13px] text-zinc-300 placeholder:text-zinc-600 outline-none transition-colors focus:border-indigo-500/50 focus:bg-white/[0.06]"

const selectBase =
  "h-11 w-full rounded-full bg-white/[0.04] border border-white/[0.08] px-[18px] pr-10 text-[13px] text-zinc-300 outline-none appearance-none cursor-pointer transition-colors focus:border-indigo-500/50 focus:bg-white/[0.06]"

const textareaBase =
  "w-full rounded-2xl bg-white/[0.04] border border-white/[0.08] px-[18px] py-3 text-[13px] text-zinc-300 placeholder:text-zinc-600 leading-[1.6] outline-none resize-none transition-colors focus:border-indigo-500/50 focus:bg-white/[0.06]"

const linkInputBase =
  "h-11 w-full rounded-full bg-white/[0.04] border border-white/[0.08] pl-[38px] pr-[18px] text-[13px] text-zinc-300 placeholder:text-zinc-600 outline-none transition-colors focus:border-indigo-500/50 focus:bg-white/[0.06]"

/* ------------------------------------------------------------------ */
/*  Small sub-components                                               */
/* ------------------------------------------------------------------ */

function SelectChevron() {
  return (
    <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

function LinkFieldIcon() {
  return (
    <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
      <LinkIcon size={14} />
    </div>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between p-[10px_14px] rounded-xl bg-white/[0.03] border border-white/[0.04]">
      <span className="text-xs text-zinc-500 font-semibold">{label}</span>
      <span className="text-[13px] text-zinc-300 font-semibold capitalize max-w-[60%] text-right truncate">
        {value || "—"}
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Step Indicator                                                     */
/* ------------------------------------------------------------------ */

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-0 py-4 px-6">
      {Array.from({ length: total }).map((_, i) => {
        const isActive = i === current
        const isCompleted = i < current

        return (
          <div key={i} className="flex items-center">
            {/* Circle */}
            <div
              className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold transition-all duration-200 ${
                isActive
                  ? "bg-white border-2 border-white text-zinc-900 shadow-[0_0_16px_rgba(255,255,255,0.25)]"
                  : isCompleted
                    ? "bg-indigo-500/25 border-2 border-indigo-500/50 text-indigo-300"
                    : "bg-white/[0.06] border-2 border-white/[0.08] text-zinc-600"
              }`}
            >
              {isCompleted ? <Check size={14} strokeWidth={3} /> : i + 1}
            </div>

            {/* Connector line */}
            {i < total - 1 && (
              <div
                className={`w-8 h-[2px] transition-colors duration-200 ${
                  isCompleted ? "bg-indigo-500/40" : "bg-white/[0.06]"
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

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setStep(0)
      setForm({ ...INITIAL_FORM })
      setSubmitted(false)
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
    "Add video URLs for this task",
    "Define pricing and editor compensation",
    "Attach resource links and notes",
    "Review everything before submitting",
  ]

  /* ---- navigation ---- */

  const goNext = () => {
    if (step < STEPS.length - 1) setStep((s) => s + 1)
  }
  const goBack = () => {
    if (step > 0) setStep((s) => s - 1)
  }

  const handleSubmit = () => {
    onSubmit?.(form)
    setSubmitted(true)
  }

  const handleDone = () => {
    onClose()
  }

  /* ---- step renderers ---- */

  const renderStep = () => {
    switch (step) {
      /* ============ STEP 1 : General Info ============ */
      case 0:
        return (
          <div className="flex flex-col gap-4">
            {/* Client */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-zinc-500 font-medium pl-1">Client</label>
              <div className="relative">
                <select
                  className={selectBase}
                  value={form.clientId}
                  onChange={(e) => set("clientId", e.target.value)}
                >
                  <option value="">Select client...</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.parent ? `${c.parent.name} / ${c.name}` : c.name}
                    </option>
                  ))}
                </select>
                <SelectChevron />
              </div>
            </div>

            {/* Task Type */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-zinc-500 font-medium pl-1">Task Type</label>
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

            {/* Deadline */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-zinc-500 font-medium pl-1">Deadline</label>
              <input
                type="date"
                className={inputBase}
                value={form.deadline}
                onChange={(e) => set("deadline", e.target.value)}
              />
            </div>

            {/* Assignee */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-zinc-500 font-medium pl-1">Assignee</label>
              <div className="relative">
                <select
                  className={selectBase}
                  value={form.assigneeId}
                  onChange={(e) => set("assigneeId", e.target.value)}
                >
                  <option value="">Select assignee...</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nickname ?? u.username}
                    </option>
                  ))}
                </select>
                <SelectChevron />
              </div>
            </div>
          </div>
        )

      /* ============ STEP 2 : Video ============ */
      case 1:
        return (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-zinc-500 font-medium pl-1">
                Video List <span className="text-zinc-600">(one URL per line)</span>
              </label>
              <textarea
                className={textareaBase}
                style={{ minHeight: 200 }}
                placeholder={"https://youtube.com/watch?v=...\nhttps://youtube.com/watch?v=..."}
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
            {/* Job Price USD */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-zinc-500 font-medium pl-1">Job Price (USD)</label>
              <input
                type="number"
                className={inputBase}
                placeholder="0.00"
                value={form.jobPriceUSD}
                onChange={(e) => set("jobPriceUSD", e.target.value)}
              />
            </div>

            {/* Editor Fee VND */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-zinc-500 font-medium pl-1">Editor Fee (VND)</label>
              <input
                type="number"
                className={inputBase}
                placeholder="0"
                value={form.editorFee}
                onChange={(e) => set("editorFee", e.target.value)}
              />
            </div>

            {/* Revenue progress bar */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs text-zinc-500 font-medium">Estimated Revenue</span>
                <span
                  className={`text-[13px] font-bold ${
                    revenueVND >= 0 ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {revenueVND.toLocaleString("vi-VN")} VND
                </span>
              </div>
              <div className="h-3 w-full rounded-full bg-white/[0.04] border border-white/[0.06] overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${revenuePercent}%` }}
                  transition={{ type: "spring", stiffness: 120, damping: 20 }}
                />
              </div>
              <p className="text-[11px] text-zinc-600 pl-1">
                {revenuePercent.toFixed(0)}% margin &middot; Rate: 1 USD = {USD_TO_VND.toLocaleString()} VND
              </p>
            </div>
          </div>
        )

      /* ============ STEP 4 : Resources & Notes ============ */
      case 3:
        return (
          <div className="flex flex-col gap-5">
            {/* 2x2 link grid */}
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ["rawFootage", "Raw Footage"],
                  ["bRoll", "B-Roll"],
                  ["sampleProject", "Sample Project"],
                  ["submissionFolder", "Submission Folder"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <label className="text-xs text-zinc-500 font-medium pl-1">{label}</label>
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

            {/* References */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-zinc-500 font-medium pl-1">References</label>
              <div className="relative">
                <LinkFieldIcon />
                <input
                  type="url"
                  className={linkInputBase}
                  placeholder="https://..."
                  value={form.references}
                  onChange={(e) => set("references", e.target.value)}
                />
              </div>
            </div>

            {/* Vietnamese Notes */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-zinc-500 font-medium pl-1">Notes (Vietnamese)</label>
              <textarea
                className={textareaBase}
                style={{ minHeight: 80 }}
                placeholder="Ghi chú bằng tiếng Việt..."
                value={form.notesVi}
                onChange={(e) => set("notesVi", e.target.value)}
              />
            </div>

            {/* English Notes */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-zinc-500 font-medium pl-1">Notes (English)</label>
              <textarea
                className={textareaBase}
                style={{ minHeight: 80 }}
                placeholder="Notes in English..."
                value={form.notesEn}
                onChange={(e) => set("notesEn", e.target.value)}
              />
            </div>
          </div>
        )

      /* ============ STEP 5 : Review ============ */
      case 4:
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
            <ReviewRow label="B-Roll" value={form.bRoll} />
            <ReviewRow label="Sample Project" value={form.sampleProject} />
            <ReviewRow label="Submission" value={form.submissionFolder} />
            <ReviewRow label="References" value={form.references} />
            <ReviewRow label="Notes (VI)" value={form.notesVi} />
            <ReviewRow label="Notes (EN)" value={form.notesEn} />
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
      <div className="flex items-center justify-center w-[72px] h-[72px] rounded-full bg-emerald-500/20 border border-emerald-500/30">
        <Check size={36} className="text-emerald-400" strokeWidth={2.5} />
      </div>
      <h3 className="text-xl font-bold text-white">Task Added</h3>
      <p className="text-sm text-zinc-400 text-center max-w-[320px]">
        Task mới đã được thêm vào hệ thống thành công. Bạn có thể đóng cửa sổ này.
      </p>
      <button
        type="button"
        onClick={handleDone}
        className="mt-2 h-11 px-10 rounded-full bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-semibold transition-colors"
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
            className="relative w-full max-w-[620px] max-h-[85vh] flex flex-col rounded-3xl border border-white/[0.08] shadow-[0_32px_80px_rgba(0,0,0,0.60)] overflow-hidden"
            style={{ background: "rgba(24,24,27,0.92)", backdropFilter: "blur(24px)" }}
            initial={{ opacity: 0, y: 32, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Ambient indigo orb */}
            <div
              className="pointer-events-none absolute top-[-60px] right-[-60px] w-[180px] h-[180px] rounded-full bg-indigo-500 opacity-[0.08]"
              style={{ filter: "blur(60px)" }}
            />

            {/* -------- Header -------- */}
            {!submitted && (
              <div className="flex items-start justify-between px-6 pt-6 pb-2">
                <div>
                  <p className="text-[13px] text-indigo-400 font-semibold tracking-wide">
                    Step {step + 1} of {STEPS.length}
                  </p>
                  <h2 className="text-lg font-bold text-white mt-0.5">{stepTitle}</h2>
                  <p className="text-xs text-zinc-500 mt-0.5">{stepSubtitles[step]}</p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex items-center justify-center w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-zinc-400 hover:text-white transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {/* -------- Step Indicator -------- */}
            {!submitted && <StepIndicator current={step} total={STEPS.length} />}

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
              <div className="flex items-center justify-between px-6 py-4 border-t border-white/[0.06]">
                {step > 0 ? (
                  <button
                    type="button"
                    onClick={goBack}
                    className="flex items-center gap-2 h-10 px-5 rounded-full bg-transparent border border-white/[0.08] text-zinc-400 hover:text-white hover:border-white/[0.16] text-sm font-medium transition-colors"
                  >
                    <ArrowLeft size={15} />
                    Back
                  </button>
                ) : (
                  <div />
                )}

                {step < STEPS.length - 1 ? (
                  <button
                    type="button"
                    onClick={goNext}
                    className="flex items-center gap-2 h-10 px-6 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors shadow-lg shadow-indigo-500/20"
                  >
                    Next
                    <ArrowRight size={15} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    className="flex items-center gap-2 h-10 px-6 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors shadow-lg shadow-emerald-500/20"
                  >
                    <Check size={15} />
                    Add Task
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
