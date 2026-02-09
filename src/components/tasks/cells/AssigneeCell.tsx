"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { TaskWithUser } from "@/types/admin"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { assignTask } from "@/actions/task-management-actions"
import { checkUserAvailability } from "@/actions/schedule-actions"
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
    users: { id: string; username: string; reputation?: number }[]
    agencies: { id: string; name: string; code: string }[]
    isAdmin: boolean
}

export function AssigneeCell({ task, users, agencies, isAdmin }: AssigneeCellProps) {
    const router = useRouter()
    const { confirm } = useConfirm()

    // Current Value Logic
    const currentValue = task.assignee?.id || (task.assignedAgencyId ? `agency:${task.assignedAgencyId}` : "unassigned")

    const handleAssign = async (val: string) => {
        if (!val || val === "unassigned") return

        // Check availability
        const res = await checkUserAvailability(val, new Date())
        if (!res.available) {
            if (!await confirm({
                title: '⚠️ CẢNH BÁO LỊCH TRÌNH',
                message: `Nhân sự này đang có lịch BẬN (Busy) trong khoảng thời gian này. Bạn có chắc chắn muốn giao việc không?`,
                type: 'danger',
                confirmText: 'Vẫn giao',
                cancelText: 'Chọn người khác'
            })) {
                return // Cancel assignment
            }
        }

        const assignRes = await assignTask(task.id, val === "unassigned" ? null : val)
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
            return (
                <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                        <AvatarImage src={`https://avatar.vercel.sh/${task.assignee.username}`} />
                        <AvatarFallback>{task.assignee.username[0]}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{task.assignee.username}</span>
                </div>
            )
        }
        if (task.assignedAgencyId) {
            const agency = agencies.find(a => a.id === task.assignedAgencyId)
            return (
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-purple-400 border-purple-400">
                        AGENCY {agency ? `- ${agency.code}` : ''}
                    </Badge>
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

                {agencies && agencies.length > 0 && (
                    <SelectGroup>
                        <SelectLabel>Agencies</SelectLabel>
                        {agencies.map(a => (
                            <SelectItem key={a.id} value={`agency:${a.id}`} className="text-purple-600 font-bold">
                                🏢 {a.code} - {a.name}
                            </SelectItem>
                        ))}
                    </SelectGroup>
                )}

                <SelectGroup>
                    <SelectLabel>Team Members</SelectLabel>
                    {users
                        .filter(u => !((u as any).ownedAgency && (u as any).ownedAgency.length > 0))
                        .map(u => (
                            <SelectItem key={u.id} value={u.id}>
                                <div className="flex items-center gap-2">
                                    <Avatar className="h-5 w-5">
                                        <AvatarImage src={`https://avatar.vercel.sh/${u.username}`} />
                                        <AvatarFallback>{u.username[0]}</AvatarFallback>
                                    </Avatar>
                                    <span>{u.username}</span>
                                    <span className="text-xs text-muted-foreground">({u.reputation ?? 100}đ)</span>
                                </div>
                            </SelectItem>
                        ))}
                </SelectGroup>
            </SelectContent>
        </Select>
    )
}
