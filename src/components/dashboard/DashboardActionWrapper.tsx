"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import DashboardActionBar from "./DashboardActionBar"
import AddTaskModal from "./AddTaskModal"
import { createTask } from "@/actions/admin-actions"
import { createBatchTasks } from "@/actions/bulk-task-actions"

interface DashboardActionWrapperProps {
  workspaceId: string
  clients: Array<{
    id: string
    name: string
    parentId?: string | null
    parent?: { name: string } | null
  }>
  users: Array<{ id: string; username: string; nickname?: string | null }>
  workspaces: Array<{ id: string; name: string; description: string | null }>
  userRole: string
  onTaskCreated?: () => void
}

export default function DashboardActionWrapper({
  workspaceId,
  clients,
  users,
  workspaces,
  userRole,
}: DashboardActionWrapperProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const router = useRouter()
  const [, startTransition] = useTransition()

  const handleSubmit = async (data: {
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
  }) => {
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

    if (titles.length === 1) {
      // Single task — use the original createTask path
      const fd = new FormData()
      fd.set("title", titles[0])
      fd.set("type", data.taskType || "Short form")
      fd.set("assigneeId", data.assigneeId || "")
      fd.set("deadline", data.deadline || "")
      fd.set("jobPriceUSD", data.jobPriceUSD || "0")
      fd.set("value", data.editorFee || "0")
      fd.set("exchangeRate", "25000")
      fd.set("references", data.references || "")
      fd.set("resources", data.rawFootage || "")
      fd.set("fileLink", data.bRoll || "")
      fd.set("collectFilesLink", data.collectFile || "")
      fd.set("submissionFolder", data.submitFolder || "")
      fd.set("productLink", data.script || "")
      fd.set("frameUsername", data.frameUsername || "")
      fd.set("framePassword", data.framePassword || "")
      fd.set("frameNote", data.frameNote || "")
      fd.set("notes", data.notesVi || "")
      fd.set("notes_en", data.notesEn || "")
      fd.set("clientId", data.clientId || "")

      const result = await createTask(fd, workspaceId)
      if (result?.error) throw new Error(result.error)
    } else {
      // Multiple videos → batch create
      const result = await createBatchTasks(
        {
          titles,
          clientId: data.clientId ? parseInt(data.clientId) : null,
          assigneeId: data.assigneeId || null,
          deadline: data.deadline || null,
          jobPriceUSD: parseFloat(data.jobPriceUSD) || 0,
          exchangeRate: 25000,
          wageVND: parseFloat(data.editorFee) || 0,
          resources: data.rawFootage || null,
          references: data.references || null,
          collectFilesLink: data.collectFile || null,
          notes: data.notesVi || null,
          notes_en: data.notesEn || null,
          type: data.taskType || "Short form",
          fileLink: data.bRoll || null,
          submissionFolder: data.submitFolder || null,
          productLink: data.script || null,
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
      />
      <AddTaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        workspaceId={workspaceId}
        clients={clients}
        users={users}
        onSubmit={handleSubmit}
      />
    </>
  )
}
