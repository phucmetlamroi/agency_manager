"use client"

import { useState } from "react"
import DashboardActionBar from "./DashboardActionBar"
import AddTaskModal from "./AddTaskModal"

interface DashboardActionWrapperProps {
  workspaceId: string
  clients: Array<{
    id: string
    name: string
    parentId?: string | null
    parent?: { name: string } | null
  }>
  users: Array<{ id: string; username: string; nickname?: string | null }>
  onTaskCreated?: () => void
}

export default function DashboardActionWrapper({
  workspaceId,
  clients,
  users,
}: DashboardActionWrapperProps) {
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <>
      <DashboardActionBar
        workspaceId={workspaceId}
        onAddTask={() => setModalOpen(true)}
      />
      <AddTaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        workspaceId={workspaceId}
        clients={clients}
        users={users}
      />
    </>
  )
}
