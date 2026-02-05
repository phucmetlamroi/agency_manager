"use client"

import { useState } from 'react'
import Link from 'next/link'
import { deleteClient } from '@/actions/crm-actions'
import { useConfirm } from '@/components/ui/ConfirmModal'
import { toast } from 'sonner'
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MoreHorizontal } from "lucide-react"

type Project = {
    id: number
    name: string
    code: string | null
}

type Task = {
    id: string | number
    title: string
    status: string
    value?: number
}

type Client = {
    id: number
    name: string
    aiScore: number
    subsidiaries?: Client[]
    projects: Project[]
    tasks: Task[]
}

export default function CRMClientList({ clients }: { clients: Client[] }) {
    if (clients.length === 0) {
        return <div className="text-center py-8 text-muted-foreground w-full">Chưa có dữ liệu khách hàng.</div>
    }

    return (
        <Accordion type="single" collapsible className="w-full space-y-4">
            {clients.map((client) => (
                <ClientAccordionItem key={client.id} client={client} />
            ))}
        </Accordion>
    )
}

function ClientAccordionItem({ client }: { client: Client }) {
    const { confirm } = useConfirm()

    const handleDelete = async (e?: React.MouseEvent) => {
        e?.stopPropagation()
        if (!(await confirm({
            title: 'Xóa Khách hàng?',
            message: `Bạn có chắc muốn xóa khách hàng "${client.name}"?\nHành động này không thể hoàn tác!`,
            type: 'danger',
            confirmText: 'Xóa luôn',
            cancelText: 'Hủy'
        }))) return

        const res = await deleteClient(client.id)
        if (!res.success) {
            toast.error(res.error)
        } else {
            toast.success('Đã xóa khách hàng')
        }
    }

    const getScoreColor = (score: number) => {
        if (score >= 80) return 'text-green-400'
        if (score >= 50) return 'text-yellow-400'
        return 'text-red-400'
    }

    const taskCount = client.tasks?.length || 0

    return (
        <AccordionItem value={`item-${client.id}`} className="border border-white/10 rounded-lg bg-white/5 overflow-hidden px-2">
            <AccordionTrigger className="hover:no-underline px-2">
                <div className="flex items-center justify-between w-full pr-4">
                    <div className="flex items-center gap-4 text-left">
                        <div className="flex flex-col">
                            <span className="font-bold text-lg text-white">{client.name}</span>
                            <span className="text-xs text-muted-foreground">{client.subsidiaries?.length || 0} Brands • {taskCount} Videos</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="text-right hidden md:block">
                            <span className="text-[10px] text-muted-foreground uppercase block">AI Score</span>
                            <span className={`font-mono font-bold ${getScoreColor(client.aiScore)}`}>
                                {client.aiScore.toFixed(1)}
                            </span>
                        </div>
                    </div>
                </div>
            </AccordionTrigger>
            <AccordionContent className="px-2 pb-4">
                <div className="flex justify-end gap-2 mb-4">
                    <Link href={`/admin/crm/${client.id}`}>
                        <Button variant="outline" size="sm" className="h-8">Xem chi tiết (Detail)</Button>
                    </Link>
                    <Button variant="destructive" size="sm" className="h-8" onClick={(e) => handleDelete(e)}>Xóa (Delete)</Button>
                </div>

                <div className="space-y-4 pl-4 border-l-2 border-white/10 ml-2">
                    {/* SUBSIDIARIES */}
                    {client.subsidiaries && client.subsidiaries.length > 0 && (
                        <div>
                            <h4 className="text-xs font-bold text-blue-400 uppercase mb-2">Brands / Subsidiaries</h4>
                            <div className="grid gap-2">
                                {client.subsidiaries.map(sub => (
                                    <div key={sub.id} className="bg-white/5 p-3 rounded flex justify-between items-center border border-white/5">
                                        <span className="font-semibold text-sm">{sub.name}</span>
                                        <span className="text-xs text-muted-foreground">{sub.tasks?.length || 0} tasks</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* RECENT TASKS */}
                    {client.tasks && client.tasks.length > 0 && (
                        <div>
                            <h4 className="text-xs font-bold text-purple-400 uppercase mb-2">Recent Tasks</h4>
                            <div className="grid gap-1">
                                {client.tasks.slice(0, 5).map(task => (
                                    <div key={task.id} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0 hover:bg-white/5 px-2 rounded">
                                        <span className="text-sm truncate max-w-[200px] md:max-w-md text-zinc-300">{task.title}</span>
                                        <Badge variant="outline" className="text-[10px] h-5">{task.status}</Badge>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {!client.tasks?.length && !client.subsidiaries?.length && (
                        <p className="text-sm text-muted-foreground italic">No brands or tasks.</p>
                    )}
                </div>
            </AccordionContent>
        </AccordionItem>
    )
}
