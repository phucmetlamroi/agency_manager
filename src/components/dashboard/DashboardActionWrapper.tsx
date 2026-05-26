"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import DashboardActionBar from "./DashboardActionBar"
import AddTaskModal from "./AddTaskModal"
import { createTask } from "@/actions/admin-actions"
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
}: DashboardActionWrapperProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const router = useRouter()
  const [, startTransition] = useTransition()

  const handleSubmit = async (
    data: {
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
      /** Single rich-text Notes HTML (replaces notesVi/notesEn split per Figma redesign) */
      notes: string
    },
    options?: { veloxBatchRaw?: string[]; veloxV3Payload?: VeloxApplyPayloadV3 },
  ) => {
    const client = clients.find((c) => c.id === data.clientId)
    const clientLabel = client?.parent
      ? `${client.parent.name} / ${client.name}`
      : client?.name ?? "Untitled Task"

    // Parse video names from the multiline textarea (one per line)
    const videoNames = data.videoList
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    // Build titles: "ClientName · VideoName" for each video
    // If no video names provided, fall back to just the client label
    const titles =
      videoNames.length > 0
        ? videoNames.map((vn) => `${clientLabel} · ${vn}`)
        : [clientLabel]

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
        // D4 — maybe-append brief block to notes per task
        const notesWithBrief = maybeAppendBriefToNotes(
          data.notes,
          v3.briefingDocs,
          v3.appendBriefToNotes,
        )
        return {
          title: resolvedTitle,
          // Use form-level taskType (one global type for the batch — UI prevents
          // mixed types at apply time)
          type: data.taskType || 'Short form',
          jobPriceUSD: parseFloat(data.jobPriceUSD) || 0,
          wageVND: parseFloat(data.editorFee) || 0,
          clientId: v3.common.clientId ?? (data.clientId ? parseInt(data.clientId) : null),
          assigneeId: v3.common.assigneeId ?? data.assigneeId ?? null,
          deadline: v3.common.deadline ?? data.deadline ?? null,
          rawFootage: encodedResources,
          notes: notesWithBrief || null,
        }
      })
      const result = await createTasksFromBatch(
        { rows, exchangeRate: 25000 },
        workspaceId,
      )
      if ('error' in result) throw new Error(result.error)

      startTransition(() => {
        router.refresh()
      })
      return
    }

    // [Velox v1.0 Phase 2 redesign] When Velox applied N≥2 videos with linkFootage
    // toggle ON, options.veloxBatchRaw carries per-video URLs (1:1 with videoNames).
    // Route to createTasksFromBatch with per-row resources instead of the shared
    // createBatchTasks (which would force all tasks to use the same rawFootage).
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
          notes: data.notes || null,
        }
      })
      const result = await createTasksFromBatch(
        { rows, exchangeRate: 25000 },
        workspaceId,
      )
      if ('error' in result) throw new Error(result.error)
    } else if (titles.length === 1) {
      // Single task — use the original createTask path
      const fd = new FormData()
      fd.set("title", titles[0])
      fd.set("type", data.taskType || "Short form")
      fd.set("assigneeId", data.assigneeId || "")
      fd.set("deadline", data.deadline || "")
      fd.set("jobPriceUSD", data.jobPriceUSD || "0")
      fd.set("value", data.editorFee || "0")
      fd.set("exchangeRate", "25000")
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
    } else {
      // Multiple videos (non-Velox batch) → shared-resources batch create
      const result = await createBatchTasks(
        {
          titles,
          clientId: data.clientId ? parseInt(data.clientId) : null,
          assigneeId: data.assigneeId || null,
          deadline: data.deadline || null,
          jobPriceUSD: parseFloat(data.jobPriceUSD) || 0,
          exchangeRate: 25000,
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
    }

    startTransition(() => {
      router.refresh()
    })
  }

  return (
    <>
      <DashboardActionBar
        workspaceId={workspaceId}
        onAddTask={() => setModalOpen(true)}
        workspaces={workspaces}
        userRole={userRole}
        canCreateWorkspace={canCreateWorkspace}
      />
      <AddTaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        workspaceId={workspaceId}
        clients={clients}
        users={users}
        onSubmit={handleSubmit}
        pricingRules={pricingRules}
        exchangeRate={exchangeRate}
      />
    </>
  )
}
