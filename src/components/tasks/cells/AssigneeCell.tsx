"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { TaskWithUser } from "@/types/admin"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { assignTask } from "@/actions/task-management-actions"

import { useConfirm } from "@/components/ui/ConfirmModal"
import { toast } from "sonner"
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

interface AssigneeCellProps {
    task: TaskWithUser
    users: { id: string; username: string }[]
    isAdmin: boolean
    selectedIds?: string[]
    workspaceId: string
}

export function AssigneeCell({ task, users, isAdmin, selectedIds = [], workspaceId }: AssigneeCellProps) {
    const router = useRouter()
    const { confirm } = useConfirm()

    // Current Value Logic
    const currentValue = task.assignee?.id || "unassigned"

    const handleAssign = async (val: string) => {
        if (!val) return

        // CHECK BULK MODE
        const isSelected = selectedIds.includes(task.id)
        const isBulk = isSelected && selectedIds.length > 1



        // BULK ASSIGN CONFIRMATION
        if (isBulk) {
            if (await confirm({
                title: '⚡ Bulk Assignment',
                message: `Bạn đang chọn ${selectedIds.length} tasks. Bạn có muốn giao TẤT CẢ tasks này cho người được chọn không?`,
                type: 'info',
                confirmText: `Giao cho cả ${selectedIds.length} tasks`,
                cancelText: 'Chỉ giao task này'
            })) {
                // Perform Bulk Assign
                const { bulkAssignTasks } = await import('@/actions/bulk-task-actions')
                const res = await bulkAssignTasks(selectedIds, val === "unassigned" ? null : val, workspaceId)

                if (res.error) toast.error(res.error)
                else {
                    toast.success(`Đã giao ${res.count} tasks thành công!`)
                    router.refresh()
                }
                return
            }
        }

        // Single Assign (Default)
        const assignRes = await assignTask(task.id, val === "unassigned" ? null : val, workspaceId)
        if (assignRes?.success) {
            toast.success("Assignment updated")
            // In a real app we might want to optimistically update or revalidate
            router.refresh()
        } else {
            toast.error("Failed to assign task")
        }
    }

    if (!isAdmin) {
        // Read-only view for non-admins
        if (task.assignee) {
            const latestRank = (task.assignee as any).monthlyRanks?.[0]?.rank
            const flagColor = latestRank === 'C' ? 'bg-yellow-500' : latestRank === 'D' ? 'bg-red-500' : null

            return (
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Avatar className="h-6 w-6">
                            <AvatarImage src={(task.assignee as any).avatarUrl || `https://avatar.vercel.sh/${task.assignee.username}`} className="object-cover" />
                            <AvatarFallback>{task.assignee.username[0]}</AvatarFallback>
                        </Avatar>
                        {flagColor && (
                            <div className={`absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full border border-zinc-900 ${flagColor} shadow-sm`} title={`Rank ${latestRank} Warning`} />
                        )}
                    </div>
                    <span className="text-sm">{task.assignee.username}</span>
                </div>
            )
        }
        return <span className="text-muted-foreground text-xs italic">Unassigned</span>
    }

    // Admin View - Dropdown
    return (
        <Select value={currentValue} onValueChange={handleAssign}>
            <SelectTrigger className="w-[180px] h-8 text-xs bg-transparent border-input">
                <SelectValue placeholder="Select assignee" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="sys:revoke" className="text-red-500 font-bold">⛔ Thu hồi về System</SelectItem>
                <SelectItem value="unassigned">-- Hủy giao (Unassign User) --</SelectItem>

                <SelectGroup>
                    <SelectLabel>Team Members</SelectLabel>
                    {users
                        .filter(u => {
                            const role = (u as any).role
                            return role !== 'CLIENT' && role !== 'LOCKED'
                        })
                        .map(u => {
                            const latestRank = (u as any).monthlyRanks?.[0]?.rank
                            const flagColor = latestRank === 'C' ? 'bg-yellow-500' : latestRank === 'D' ? 'bg-red-500' : null

                            return (
                                <SelectItem key={u.id} value={u.id}>
                                    <div className="flex items-center gap-2">
                                        <div className="relative">
                                            <Avatar className="h-5 w-5">
                                                <AvatarImage src={(u as any).avatarUrl || `https://avatar.vercel.sh/${u.username}`} className="object-cover" />
                                                <AvatarFallback>{u.username[0]}</AvatarFallback>
                                            </Avatar>
                                            {flagColor && (
                                                <div className={`absolute -bottom-1 -right-1 w-2 h-2 rounded-full border border-white ${flagColor} shadow-sm`} title={`Rank ${latestRank} Warning`} />
                                            )}
                                        </div>
                                        <span>{u.username}</span>
                                    </div>
                                </SelectItem>
                            )
                        })}
                </SelectGroup>
            </SelectContent>
        </Select>
    )
}
