"use client"

import { useState, useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import DashboardActionBar from "./DashboardActionBar"
import AddTaskModal from "./AddTaskModal"
import McAddTaskModal from "@/components/mission-control/McAddTaskModal"
import { toast } from "sonner"
import { createTask } from "@/actions/admin-actions"
import { markRequestAccepted } from "@/actions/client-request-actions"
import { saveHookGraph } from "@/actions/raw-footage-actions"
import { createBatchTasks } from "@/actions/bulk-task-actions"
import { createTasksFromBatch, type BatchTaskRow } from "@/actions/velox-batch-actions"
import {
    encodeResourcesV3,
    maybeAppendBriefToNotes,
    type VeloxApplyPayloadV3,
    type MainItem,
} from "@/lib/velox-helpers"

interface DashboardActionWrapperProps {
  workspaceId: string
  clients: Array<{
    id: string
    name: string
    parentId?: string | null
    parent?: { name: string } | null
  }>
  users: Array<{ id: string; username: string; nickname?: string | null; displayName?: string | null }>
  workspaces: Array<{ id: string; name: string; description: string | null }>
  userRole: string
  /** [Sprint Y] Gate "Tạo Workspace mới" button visibility */
  canCreateWorkspace?: boolean
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
  onTaskCreated?: () => void
  /** [Giao diện 2] Hide the default DashboardActionBar (workspace picker + "Thêm task mới").
   *  Mission Control supplies its OWN trigger (topbar button + ⌘K) and only needs the modal.
   *  Default false → /admin renders the bar exactly as before. */
  hideBar?: boolean
  /** [Giao diện 2] Controlled open state. When `onOpenChange` is provided the host owns the
   *  modal's open/close; otherwise the wrapper keeps its own internal state (unchanged /admin
   *  behavior). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /**
   * [Mobile P2 §2b] 'bar' (default) = the desktop DashboardActionBar; 'fab' = a floating
   * "+" button (mobile Task tab) that opens the SAME AddTaskModal + submit flow. Desktop is
   * byte-identical because it never passes this prop.
   */
  variant?: 'bar' | 'fab'
  /** [Giao diện 2] Portal the AddTaskModal to <body> — needed when the host sits inside a
   *  `backdrop-filter` container (the MC topbar), which would otherwise trap the modal's
   *  `fixed inset-0` scrim in that box. Default false → /admin renders inline, unchanged. */
  portalToBody?: boolean
  /** [Giao diện 2 · M10] 'wizard' (default) = the /admin 5-step AddTaskModal — byte-identical.
   *  'mc' = the faithful single-screen 3-column "Thêm Task mới" (McAddTaskModal), submitting
   *  through the SAME money-safe handleSubmit. Deep Velox bridges back to the wizard. */
  layout?: 'wizard' | 'mc'
}

// [QA R1 — user decision] A Multi-Hook Map can't fan out across a batch — attach it to
// the FIRST created task + toast so the admin's work isn't silently discarded.
async function attachMapToFirstBatchTask(
  graph: import('@/lib/velox/hook-graph-types').HookGraph | undefined,
  taskIds: string[] | undefined,
) {
  if (!graph || graph.blocks.length === 0) return
  if (!taskIds || taskIds.length === 0) {
    // [QA R2 fix] Don't silently drop a built map when no task id came back.
    toast.error('Đã dựng Multi-Hook Map nhưng không có task nào được tạo để gắn — kiểm tra lại danh sách video.')
    return
  }
  try {
    const saveResult = await saveHookGraph(taskIds[0], graph)
    if ('error' in saveResult) {
      toast.error(`Đã tạo các task nhưng không lưu được Multi-Hook Map: ${saveResult.error}`)
    } else {
      toast.success(`Đã gắn Multi-Hook Map vào task đầu của lô (${taskIds.length} task).`)
    }
  } catch (err) {
    console.error('[hook-graph] batch attach threw:', err)
    toast.error('Đã tạo các task nhưng lưu Multi-Hook Map thất bại — thử lại từ Task detail.')
  }
}

export default function DashboardActionWrapper({
  workspaceId,
  clients,
  users,
  workspaces,
  userRole,
  canCreateWorkspace = false,
  pricingRules = [],
  exchangeRate = 26300,
  hideBar = false,
  open,
  onOpenChange,
  variant = 'bar',
  portalToBody = false,
  layout = 'wizard',
}: DashboardActionWrapperProps) {
  // [M10] Deep-Velox bridge: the MC screen hands off folder scanning to the vetted wizard.
  const [mcVelox, setMcVelox] = useState(false)
  // [Giao diện 2] Controlled vs uncontrolled open. When the host passes `onOpenChange`
  // it owns the state (Mission Control); otherwise the wrapper keeps its own — /admin
  // behavior is byte-identical because neither prop is passed there.
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const isControlled = onOpenChange !== undefined
  const modalOpen = isControlled ? !!open : uncontrolledOpen
  const setModalOpen = (v: boolean) => {
    if (isControlled) onOpenChange!(v)
    else setUncontrolledOpen(v)
  }
  const router = useRouter()
  const [, startTransition] = useTransition()

  // [Client Task Submission v2] Seed from the admin inbox "Quét bằng Velox" flow —
  // /admin?veloxRequest=<id>&folder=<url>&clientId=<n> opens AddTaskModal straight
  // into Velox mode seeded with the client's folder link. Read via window (not
  // useSearchParams) to avoid a Suspense boundary requirement.
  const [seed, setSeed] = useState<{ requestId: string; folder: string; clientId?: number } | null>(null)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const requestId = sp.get('veloxRequest')
    if (!requestId) return
    const clientIdRaw = sp.get('clientId')
    const clientIdNum = clientIdRaw ? Number(clientIdRaw) : NaN
    setSeed({ requestId, folder: sp.get('folder') || '', clientId: Number.isFinite(clientIdNum) ? clientIdNum : undefined })
    setModalOpen(true)
  }, [])

  const clearSeed = () => {
    if (seed) { setSeed(null); router.replace(`/${workspaceId}/admin`) }
  }
  const closeModal = () => { setModalOpen(false); setMcVelox(false); clearSeed() }

  const handleSubmit = async (
    data: {
      clientId: string
      taskType: string
      deadline: string
      assigneeId: string
      /** [Trial P0] Người quản lý — blank defaults to creator server-side. */
      managerId: string
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
      /** Single rich-text Notes HTML (replaces notesVi/notesEn split per Figma redesign) */
      notes: string
    },
    options?: {
      veloxBatchRaw?: string[]
      veloxV3Payload?: VeloxApplyPayloadV3
      /** [Hook Graph — Multi-Hook Map] The user-built graph from Step 4,
       *  persisted via saveHookGraph AFTER the task is created (two-step flow:
       *  we need the new task id). */
      hookGraphV1?: import('@/lib/velox/hook-graph-types').HookGraph
    },
  ) => {
    const client = clients.find((c) => c.id === data.clientId)

    // Parse video names from the multiline textarea (one per line)
    const videoNames = data.videoList
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    // [Owner bug report 2026-07-22] The title is the VIDEO NAME, nothing else.
    //
    // It used to be built as `${clientLabel} · ${videoName}` where clientLabel was
    // "Parent / Child" — so a task came out as "Jordan / Georgie MiCosmetics · What to expect
    // from IPL consultation". That prefix is pure duplication: `clientId` is stored as a real
    // relation on the same row (passed separately in all three branches below), and every task
    // surface already renders the client hierarchy on its own line from that relation
    // (formatClientHierarchy in TitleCell / NewDesktopTaskTable / MobileTaskCard / TaskDrawer).
    // The result was the client name showing twice on one row, and the actual name the user
    // typed pushed to the end.
    //
    // Fallback when the user names nothing: the client label is a poor title (it re-creates the
    // duplication), so use the neutral placeholder and let the row's own client line carry the
    // identity. This branch is near-unreachable in practice — the modal treats videoList as the
    // task name and Velox always fills it.
    const titles =
      videoNames.length > 0
        ? videoNames
        : [client?.name ? `Task mới — ${client.name}` : "Task mới"]

    // [BUG FIX] AddTaskModal field mapping — match TaskDetailModal's packed format expectations.
    // CRITICAL bug user reported: `script` was sent to `productLink` (delivery field) →
    //   script link hiển thị trong Delivery card khi mở task detail.
    //   `productLink` là field cho USER (assignee) nộp link sản phẩm SAU khi làm xong.
    //   Admin KHÔNG được set productLink lúc tạo task.
    // Similar bug: `bRoll` was sent to `fileLink` (separate column) — TaskDetailModal
    //   chỉ đọc B-roll từ packed `resources` string → B-roll value bị MẤT.
    //
    // TaskDetailModal expected packed formats:
    //   resources: "RAW: <url> | BROLL: <url> | SUBMISSION: <url>"
    //   references: "REF:<url> | SCRIPT:<url>"
    const packedResources =
      data.rawFootage || data.bRoll || data.submitFolder
        ? `RAW: ${(data.rawFootage || '').trim()} | BROLL: ${(data.bRoll || '').trim()} | SUBMISSION: ${(data.submitFolder || '').trim()}`
        : ''
    const packedReferences = data.script
      ? `REF:${(data.references || '').trim()} | SCRIPT:${(data.script || '').trim()}`
      : (data.references || '')

    // [Velox Deep Scan v3.1] V3 payload — full per-task encoding với
    // RAW_HOOKS/RAW_AROLL/SHARED_*/BROLL_*/BRIEF. Takes priority over V1
    // path. Used khi user vào Velox với deep scan toggle ON.
    if (options?.veloxV3Payload) {
      const v3 = options.veloxV3Payload

      // Pack references field: REF:formRef | SCRIPT:formScript+veloxScript
      // Velox scriptDocs URLs đã được merged vào data.script via mapPayloadV3ToFormData
      // tại apply time, nên data.script đã chứa script URL(s). Same pattern như V1.
      const v3PackedReferences = data.script
        ? `REF:${(data.references || '').trim()} | SCRIPT:${(data.script || '').trim()}`
        : (data.references || null)

      const rows: BatchTaskRow[] = v3.mainItems.map((m: MainItem) => {
        const resolvedTitle = m.taskNameByMode[v3.taskNameMode] ?? m.taskName
        const customForTask =
          v3.brollPolicy === 'CUSTOM' && v3.customBrollMap
            ? v3.customBrollMap[
                m.kind === 'file'
                  ? m.file.fileId
                  : m.kind === 'pair'
                    ? m.basePart
                    : m.folder.url
              ]
            : undefined
        const encodedResources = encodeResourcesV3({
          mainItem: m,
          broll: v3.broll,
          brollPolicy: v3.brollPolicy,
          sharedAssets: v3.sharedAssets,
          briefingDocs: v3.briefingDocs,
          customBrollForTask: customForTask,
          extraBRoll: data.bRoll,
          extraSubmissionFolder: data.submitFolder,
        })
        // D4 — maybe-append brief HTML block per task. Hyperlink format với
        // per-task title: "📄 Brief của video <strong>X</strong>: <a>...</a>"
        const notesWithBrief = maybeAppendBriefToNotes(
          data.notes,
          v3.briefingDocs,
          v3.appendBriefToNotes,
          resolvedTitle,
        )
        return {
          title: resolvedTitle,
          // Use form-level taskType (one global type for the batch — UI prevents
          // mixed types at apply time)
          type: data.taskType || 'Short form',
          jobPriceUSD: parseFloat(data.jobPriceUSD) || 0,
          wageVND: parseFloat(data.editorFee) || 0,
          clientId: v3.common.clientId ?? (data.clientId ? parseInt(data.clientId) : null),
          // [Velox blank-assignee fix] Use || (not ??) so an empty-string assignee from
          // "Leave Blank (Task Pool)" coalesces to null instead of being sent as '' (which
          // is not a valid User FK and trips Task_assigneeId_fkey). No real assigneeId is falsy.
          assigneeId: v3.common.assigneeId || data.assigneeId || null,
          deadline: v3.common.deadline ?? data.deadline ?? null,
          rawFootage: encodedResources,
          // [QA R1 fix] Forward the "Collect file" link — was dropped on the V3 batch path.
          collectFilesLink: data.collectFile || null,
          references: v3PackedReferences,
          notes: notesWithBrief || null,
        }
      })
      const result = await createTasksFromBatch(
        { rows, exchangeRate, managerId: data.managerId || null },
        workspaceId,
      )
      if ('error' in result) throw new Error(result.error)
      // [QA R1 — user decision] Attach the Multi-Hook Map to the batch's first task.
      await attachMapToFirstBatchTask(options?.hookGraphV1, result.taskIds)

      startTransition(() => {
        router.refresh()
      })
      return
    }

    // [Velox v1.0 Phase 2 redesign] When Velox applied N≥2 videos with linkFootage
    // toggle ON, options.veloxBatchRaw carries per-video URLs (1:1 with videoNames).
    // Route to createTasksFromBatch with per-row resources instead of the shared
    // createBatchTasks (which would force all tasks to use the same rawFootage).
    // [QA R2 fix] Guard the Velox-batch desync (e.g. the conflict dialog kept an old /
    // merged video list): if per-video links exist but their count no longer matches the
    // video lines, abort LOUDLY instead of silently routing to the shared path that
    // drops every per-video link.
    if (
      options?.veloxBatchRaw &&
      options.veloxBatchRaw.length > 0 &&
      options.veloxBatchRaw.length !== videoNames.length
    ) {
      throw new Error(
        `Số dòng video (${videoNames.length}) không khớp số link Velox (${options.veloxBatchRaw.length}). ` +
          `Mở lại Velox chọn "Ghi đè", hoặc bấm "Bỏ Velox" rồi nhập lại danh sách.`,
      )
    }

    const hasVeloxBatch =
      options?.veloxBatchRaw &&
      options.veloxBatchRaw.length === videoNames.length &&
      videoNames.length >= 2

    if (hasVeloxBatch) {
      const veloxUrls = options!.veloxBatchRaw!
      const rows: BatchTaskRow[] = titles.map((title, idx) => {
        // Pack THIS row's rawFootage with shared bRoll + submitFolder values
        const rowRaw = (veloxUrls[idx] || '').trim()
        const rowResources =
          rowRaw || data.bRoll || data.submitFolder
            ? `RAW: ${rowRaw} | BROLL: ${(data.bRoll || '').trim()} | SUBMISSION: ${(data.submitFolder || '').trim()}`
            : ''
        return {
          title,
          type: data.taskType || 'Short form',
          jobPriceUSD: parseFloat(data.jobPriceUSD) || 0,
          wageVND: parseFloat(data.editorFee) || 0,
          clientId: data.clientId ? parseInt(data.clientId) : null,
          assigneeId: data.assigneeId || null,
          deadline: data.deadline || null,
          // rawFootage in createTasksFromBatch maps to `resources` field
          rawFootage: rowResources || null,
          // [QA R1 fix] Forward the "Collect file" link — was dropped on the V1 Velox batch path.
          collectFilesLink: data.collectFile || null,
          references: packedReferences || null,
          notes: data.notes || null,
        }
      })
      const result = await createTasksFromBatch(
        { rows, exchangeRate, managerId: data.managerId || null },
        workspaceId,
      )
      if ('error' in result) throw new Error(result.error)
      // [QA R1 — user decision] Attach the Multi-Hook Map to the batch's first task.
      await attachMapToFirstBatchTask(options?.hookGraphV1, result.taskIds)
    } else if (titles.length === 1) {
      // Single task — use the original createTask path
      const fd = new FormData()
      fd.set("title", titles[0])
      fd.set("type", data.taskType || "Short form")
      fd.set("assigneeId", data.assigneeId || "")
      fd.set("managerId", data.managerId || "")
      fd.set("deadline", data.deadline || "")
      fd.set("jobPriceUSD", data.jobPriceUSD || "0")
      fd.set("value", data.editorFee || "0")
      fd.set("exchangeRate", String(exchangeRate))
      fd.set("references", packedReferences)
      fd.set("resources", packedResources)
      fd.set("fileLink", "")                     // [FIX] Empty — bRoll giờ packed trong resources
      fd.set("collectFilesLink", data.collectFile || "")
      fd.set("submissionFolder", data.submitFolder || "")  // Keep separate column (defensive backup)
      fd.set("productLink", "")                  // [FIX] Empty — delivery field cho USER nộp, không phải admin
      fd.set("frameUsername", data.frameUsername || "")
      fd.set("framePassword", data.framePassword || "")
      fd.set("frameNote", data.frameNote || "")
      fd.set("notes", data.notes || "")
      fd.set("notes_en", "")
      fd.set("clientId", data.clientId || "")

      const result = await createTask(fd, workspaceId)
      if (result?.error) throw new Error(result.error)
      // [Velox v4] Single-task create succeeded → persist the Multi-Hook
      // Map if the editor was used. Best-effort: log + toast on failure so
      // the task itself isn't lost.
      if (options?.hookGraphV1 && result?.taskId) {
        try {
          const saveResult = await saveHookGraph(result.taskId, options.hookGraphV1)
          if ('error' in saveResult) {
            console.warn('[hook-graph] saveHookGraph failed:', saveResult.error)
            toast.error(`Đã tạo task nhưng không lưu được Multi-Hook Map: ${saveResult.error}`)
          }
        } catch (err: any) {
          console.error('[hook-graph] saveHookGraph threw:', err)
          toast.error('Đã tạo task nhưng lưu Multi-Hook Map thất bại — thử lại từ Task detail.')
        }
      }
    } else {
      // Multiple videos (non-Velox batch) → shared-resources batch create
      const result = await createBatchTasks(
        {
          titles,
          clientId: data.clientId ? parseInt(data.clientId) : null,
          assigneeId: data.assigneeId || null,
          managerId: data.managerId || null,
          deadline: data.deadline || null,
          jobPriceUSD: parseFloat(data.jobPriceUSD) || 0,
          exchangeRate,
          wageVND: parseFloat(data.editorFee) || 0,
          resources: packedResources || null,
          references: packedReferences || null,
          collectFilesLink: data.collectFile || null,
          notes: data.notes || null,
          notes_en: null,
          type: data.taskType || "Short form",
          fileLink: null,                        // [FIX] B-roll packed trong resources
          submissionFolder: data.submitFolder || null,  // Keep separate column
          productLink: null,                     // [FIX] Delivery field cho USER, không phải admin
          frameUsername: data.frameUsername || null,
          framePassword: data.framePassword || null,
          frameNote: data.frameNote || null,
        },
        workspaceId
      )
      if (result?.error) throw new Error(result.error)
      // [QA R1 — user decision] Attach the Multi-Hook Map to the batch's first task.
      await attachMapToFirstBatchTask(options?.hookGraphV1, (result as { taskIds?: string[] })?.taskIds)
    }

    startTransition(() => {
      router.refresh()
    })
  }

  // [Client Task Submission v2] After a Velox-seeded create succeeds, mark the
  // source request ACCEPTED (Velox already created the task(s)) and clean the URL.
  const handleSubmitWrapped = async (...args: Parameters<typeof handleSubmit>) => {
    await handleSubmit(...args)
    if (seed?.requestId) {
      try { await markRequestAccepted(seed.requestId, workspaceId) }
      catch (e) { console.error('[requests] mark accepted failed', e) }
      clearSeed()
    }
  }

  return (
    <>
      {/* [Merge] Mission Control hides the trigger entirely (hideBar → supplies its own
          topbar/⌘K); otherwise the mobile Task tab shows a floating "+" (variant='fab') and
          the desktop /admin shows the DashboardActionBar (default). */}
      {!hideBar &&
        (variant === 'fab' ? (
          // [Mobile P2 §2b] Floating "+" — thumb-zone, above the bottom tab bar + safe-area.
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            aria-label="Tạo task"
            className="fixed right-4 bottom-[calc(64px+env(safe-area-inset-bottom)+16px)] z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-primary/30 transition-transform active:scale-95"
          >
            <Plus className="h-6 w-6" strokeWidth={2.5} />
          </button>
        ) : (
          <DashboardActionBar
            workspaceId={workspaceId}
            onAddTask={() => setModalOpen(true)}
            workspaces={workspaces}
            userRole={userRole}
            canCreateWorkspace={canCreateWorkspace}
          />
        ))}
      {layout === 'mc' && !mcVelox ? (
        <McAddTaskModal
          open={modalOpen}
          onClose={closeModal}
          workspaceId={workspaceId}
          clients={clients}
          users={users}
          onSubmit={handleSubmitWrapped}
          pricingRules={pricingRules}
          exchangeRate={exchangeRate}
          portalToBody={portalToBody}
          onOpenVelox={() => setMcVelox(true)}
        />
      ) : (
        <AddTaskModal
          open={modalOpen}
          onClose={closeModal}
          workspaceId={workspaceId}
          clients={clients}
          users={users}
          onSubmit={handleSubmitWrapped}
          pricingRules={pricingRules}
          exchangeRate={exchangeRate}
          veloxInitialFolderUrl={seed?.folder}
          veloxInitialClientId={seed?.clientId}
          portalToBody={portalToBody}
        />
      )}
    </>
  )
}
