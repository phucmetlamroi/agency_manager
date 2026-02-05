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

// We can import actions here if we want to call them directly, 
// but usually we pass handlers or use a cell renderer component.

export const columns: ColumnDef<TaskWithUser>[] = [
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
                    Task Name
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            )
        },
        cell: ({ row }) => {
            const task = row.original
            return (
                <div className="flex flex-col max-w-[300px]">
                    <span className="font-semibold truncate">{task.title}</span>
                    <span className="text-xs text-muted-foreground">{task.client?.name}</span>
                </div>
            )
        }
    },
    {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
            const status = row.getValue("status") as string
            let variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info" = "outline"

            switch (status) {
                case 'DONE': variant = 'success'; break;
                case 'IN_PROGRESS': variant = 'info'; break;
                case 'REVIEW': variant = 'warning'; break;
                case 'REVISION': variant = 'destructive'; break;
                default: variant = 'secondary'; break;
            }

            return <Badge variant={variant}>{status}</Badge>
        },
    },
    {
        accessorKey: "assignee",
        header: "Assignee",
        cell: ({ row }) => {
            const assignee = row.original.assignee
            const agencyId = row.original.assignedAgencyId

            if (assignee) {
                return (
                    <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                            <AvatarImage src={`https://avatar.vercel.sh/${assignee.username}`} />
                            <AvatarFallback>{assignee.username[0]}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{assignee.username}</span>
                    </div>
                )
            }
            if (agencyId) {
                return (
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-purple-400 border-purple-400">AGENCY</Badge>
                        {/* We might need agency name here if available in data, usually it is not directly if not included deeply */}
                    </div>
                )
            }
            return <span className="text-muted-foreground text-xs italic">Unassigned</span>
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
            if (!date) return "-"
            return <div className="text-sm">{new Date(date).toLocaleDateString("vi-VN")}</div>
        },
    },
    {
        accessorKey: "price",
        header: "Amount",
        cell: ({ row }) => {
            const amount = parseFloat(row.getValue("price") || "0")
            const formatted = new Intl.NumberFormat("vi-VN", {
                style: "currency",
                currency: "VND",
            }).format(amount)

            return <div className="font-medium">{formatted}</div>
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
                        <DropdownMenuItem>
                            <Pen className="mr-2 h-4 w-4" /> Edit Task
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-red-500 focus:text-red-500">
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )
        },
    },
]
