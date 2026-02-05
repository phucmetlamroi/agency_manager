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

// Cell Components
import { AssigneeCell } from "./cells/AssigneeCell"
import { StatusCell } from "./cells/StatusCell"
import { TitleCell } from "./cells/TitleCell"

export const getColumns = (
    users: any[],
    agencies: any[],
    isAdmin: boolean,
    onTaskClick: (task: TaskWithUser) => void,
    onDelete?: (id: string) => void
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
                <StatusCell task={row.original} isAdmin={isAdmin} />
            ),
        },
        {
            accessorKey: "assignee",
            header: "Assignee",
            cell: ({ row }) => (
                <AssigneeCell
                    task={row.original}
                    users={users}
                    agencies={agencies}
                    isAdmin={isAdmin}
                />
            )
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
                return <div className="text-xs font-mono">{new Date(date).toLocaleDateString("vi-VN")}</div>
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

