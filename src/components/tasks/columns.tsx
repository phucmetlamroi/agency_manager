"use client"

import { ColumnDef } from "@tanstack/react-table"
import { TaskWithUser } from "@/types/admin"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { ArrowUpDown, MoreHorizontal, Pen, Trash2 } from "lucide-react"
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

// Cell Components
import { AssigneeCell } from "./cells/AssigneeCell"
import { StatusCell } from "./cells/StatusCell"
import { TitleCell } from "./cells/TitleCell"

export const getColumns = (
    users: any[],
    isAdmin: boolean,
    onTaskClick: (task: TaskWithUser) => void,
    workspaceId: string,
    onDelete?: (id: string) => void,
    selectedIds: string[] = []
): ColumnDef<TaskWithUser>[] => [
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
                <Checkbox
                    checked={row.getIsSelected()}
                    onCheckedChange={(value) => row.toggleSelected(!!value)}
                    aria-label="Select row"
                />
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
            cell: ({ row }) => (
                <TitleCell
                    task={row.original}
                    isAdmin={isAdmin}
                    onClick={() => onTaskClick(row.original)}
                />
            )
        },
        {
            accessorKey: "status",
            header: "Status",
            cell: ({ row }) => (
                <StatusCell task={row.original} isAdmin={isAdmin} workspaceId={workspaceId} />
            ),
        },
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

                let colorClass = "text-muted-foreground"
                if (row.original.status !== 'Hoàn t?t') {
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
                // Ensure we handle both string and number inputs correctly
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
    ]

