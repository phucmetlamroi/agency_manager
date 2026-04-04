"use client"

import { ColumnDef } from "@tanstack/react-table"
import { TaskWithUser } from "@/types/admin"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { ArrowUpDown, MoreHorizontal, Pen, Trash2, GripVertical, Undo2, Timer } from "lucide-react"
import { returnTask } from "@/actions/claim-actions"
import { toast } from "sonner"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { parseDuration, formatDuration } from "@/lib/duration-parser"

// Cell Components
import { AssigneeCell } from "./cells/AssigneeCell"
import { StatusCell } from "./cells/StatusCell"
import { TitleCell } from "./cells/TitleCell"

// Status dot colors - using Unicode escapes to avoid encoding issues
const STATUS_DOT: Record<string, string> = {
    "Nh\u1eadn task": "bg-blue-500",
    "\u0110ang \u0111\u1ee3i giao": "bg-purple-500",
    "\u0110ang th\u1ef1c hi\u1ec7n": "bg-yellow-500",
    "Revision": "bg-red-500",
    "Ho\u00e0n t\u1ea5t": "bg-emerald-500",
    "T\u1ea1m ng\u01b0ng": "bg-gray-500",
    "S\u1eeda frame": "bg-pink-500",
    "Review": "bg-orange-500",
}

export const getColumns = (
    users: any[],
    isAdmin: boolean,
    onTaskClick: (task: TaskWithUser) => void,
    workspaceId: string,
    onDelete?: (id: string) => void,
    selectedIds: string[] = [],
    currentUserId?: string
): ColumnDef<TaskWithUser>[] => {
    const cols: ColumnDef<TaskWithUser>[] = [
        {
            id: "select",
            header: ({ table }) => (
                <Checkbox
                    checked={
                        table.getIsAllPageRowsSelected() ||
                        (table.getIsSomePageRowsSelected() && "indeterminate")
                    }
                    onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                    aria-label="Select all"
                />
            ),
            cell: ({ row }) => (
                <div className="flex items-center gap-1">
                    {isAdmin && <GripVertical className="w-3 h-3 text-zinc-600" />}
                    <Checkbox
                        checked={row.getIsSelected()}
                        onCheckedChange={(value) => row.toggleSelected(!!value)}
                        aria-label="Select row"
                    />
                </div>
            ),
            enableSorting: false,
            enableHiding: false,
        },
        {
            accessorKey: "title",
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                    >
                        Task
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                )
            },
            cell: ({ row }) => {
                const claimSource = (row.original as any).claimSource
                const glowClass = claimSource === 'MARKET'
                    ? 'shadow-[0_0_12px_rgba(245,158,11,0.2)] border-l-2 border-l-amber-500/40 pl-2'
                    : claimSource === 'ADMIN' && row.original.assigneeId
                        ? 'shadow-[0_0_12px_rgba(59,130,246,0.2)] border-l-2 border-l-blue-500/40 pl-2'
                        : ''

                const taskTags = (row.original as any).taskTags as { tagCategory: { id: string; name: string } }[] | undefined
                const duration = (row.original as any).duration as string | null | undefined

                return (
                    <div className={cn("flex flex-col gap-1.5 rounded-lg transition-all py-1", glowClass)}>
                        <div className="flex items-center gap-2">
                            <div className={cn("w-2 h-2 rounded-full shrink-0", STATUS_DOT[row.original.status] || "bg-gray-500")} title={row.original.status} />
                            <TitleCell
                                task={row.original}
                                isAdmin={isAdmin}
                                onClick={() => onTaskClick(row.original)}
                            />
                        </div>
                        {/* Tags & Duration inline */}
                        {(taskTags?.length || duration) && (
                            <div className="flex items-center gap-1.5 ml-4 flex-wrap">
                                {taskTags?.map(tt => (
                                    <span
                                        key={tt.tagCategory.id}
                                        className="inline-flex items-center px-2 py-0.5 bg-indigo-500/15 border border-indigo-500/25 rounded-full text-indigo-300 text-[9px] font-semibold tracking-wide"
                                    >
                                        {tt.tagCategory.name}
                                    </span>
                                ))}
                                {duration && (() => {
                                    const parsed = parseDuration(duration)
                                    return (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-300 text-[9px] font-semibold font-mono">
                                            <Timer className="w-2.5 h-2.5" />
                                            {parsed.valid ? formatDuration(parsed.totalSeconds) : duration}
                                        </span>
                                    )
                                })()}
                            </div>
                        )}
                    </div>
                )
            }
        },
    ]

    // Only show Status column for non-admin users
    if (!isAdmin) {
        cols.push({
            accessorKey: "status",
            header: "Status",
            cell: ({ row }) => (
                <StatusCell task={row.original} isAdmin={isAdmin} workspaceId={workspaceId} />
            ),
        })
    }

    cols.push(
        {
            accessorKey: "assignee",
            header: "Assignee",
            cell: ({ row }) => (
                <AssigneeCell
                    task={row.original}
                    users={users}
                    isAdmin={isAdmin}
                    selectedIds={selectedIds}
                    workspaceId={workspaceId}
                />
            )
        },
        {
            accessorKey: "type",
            header: "Type",
            cell: ({ row }) => {
                const type = row.original.type
                let variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info" = "outline"

                if (type === 'Short form') variant = "info"
                else if (type === 'Long form') variant = "secondary"
                else if (type === 'Trial') variant = "warning"

                return (
                     <Badge variant={variant} className="text-[10px] uppercase font-black px-1.5 py-0">
                        {type === 'Short form' ? 'SHORT' : type === 'Long form' ? 'LONG' : type || 'TASK'}
                     </Badge>
                )
            }
        },
        {
            accessorKey: "deadline",
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                    >
                        Deadline
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                )
            },
            cell: ({ row }) => {
                const date = row.getValue("deadline") as Date
                if (!date) return <span className="text-muted-foreground">-</span>

                const deadlineDate = new Date(date)
                const now = new Date()
                const diffHours = (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60)

                // Unicode escape for "Ho\u00e0n t\u1ea5t"
                let colorClass = "text-muted-foreground"
                if (row.original.status !== 'Ho\u00e0n t\u1ea5t') {
                    if (diffHours <= 0) colorClass = "text-red-500 font-bold animate-pulse"
                    else if (diffHours < 24) colorClass = "text-red-500 font-bold"
                    else if (diffHours < 48) colorClass = "text-amber-500 font-semibold"
                    else colorClass = "text-emerald-400"
                }

                return (
                    <div className={cn("text-[10px] font-mono flex flex-col leading-tight", colorClass)}>
                        <span>{deadlineDate.toLocaleDateString("vi-VN")}</span>
                        <span className="opacity-80">{deadlineDate.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                )
            },
        },
        {
            accessorKey: "price",
            header: "Amount",
            cell: ({ row }) => {
                const val = row.getValue("price") ?? row.original.value ?? 0
                const amount = Number(val)

                const formatted = new Intl.NumberFormat("vi-VN", {
                    style: "currency",
                    currency: "VND",
                }).format(amount)

                return <div className="font-mono text-green-500 font-bold text-xs">{formatted}</div>
            },
        },
        {
            id: "actions",
            cell: ({ row }) => {
                const task = row.original

                return (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem
                                onClick={() => navigator.clipboard.writeText(task.id)}
                            >
                                Copy Task ID
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => onTaskClick(task)}>
                                <Pen className="mr-2 h-4 w-4" /> Edit Details
                            </DropdownMenuItem>
                            {/* Hoàn task — only for MARKET-claimed tasks within 10 minutes */}
                            {(() => {
                                const cs = (task as any).claimSource
                                const ca = (task as any).claimedAt
                                const isOwner = currentUserId && task.assigneeId === currentUserId
                                if (cs !== 'MARKET' || !ca || !isOwner) return null
                                const caDate = new Date(ca)
                                if (isNaN(caDate.getTime())) return null
                                const minutesSince = (Date.now() - caDate.getTime()) / (1000 * 60)
                                if (minutesSince > 10) return null
                                return (
                                    <DropdownMenuItem
                                        className="text-amber-500 focus:text-amber-500"
                                        onClick={async () => {
                                            const res = await returnTask(task.id, workspaceId)
                                            if (res.error) toast.error(res.error)
                                            else {
                                                toast.success('Task đã được hoàn trả')
                                                window.location.reload()
                                            }
                                        }}
                                    >
                                        <Undo2 className="mr-2 h-4 w-4" /> Hoàn task
                                    </DropdownMenuItem>
                                )
                            })()}
                            {isAdmin && onDelete && (
                                <DropdownMenuItem
                                    className="text-red-500 focus:text-red-500"
                                    onClick={() => onDelete(task.id)}
                                >
                                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )
            },
        },
    )

    return cols
}
