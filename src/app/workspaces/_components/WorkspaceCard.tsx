'use client'

import { Card, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { MoreHorizontal } from "lucide-react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { vi } from "date-fns/locale"
import { useState } from "react"
import { renameWorkspaceAction, deleteWorkspaceAction } from "@/actions/workspace-actions"
import { toast } from "sonner"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Loader2, Trash2, Edit2 } from "lucide-react"

interface WorkspaceCardProps {
    workspace: {
        id: string
        name: string
        description: string | null
        updatedAt: Date
    }
    role: string
    userGlobalRole: string
}

export function WorkspaceCard({ workspace, role, userGlobalRole }: WorkspaceCardProps) {
    const [isRenaming, setIsRenaming] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [newName, setNewName] = useState(workspace.name)
    const [isLoading, setIsLoading] = useState(false)

    const handleRename = async (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsRenaming(true)
    }

    const handleDelete = async (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDeleting(true)
    }

    const confirmRename = async () => {
        if (!newName.trim()) return
        setIsLoading(true)
        const res = await renameWorkspaceAction(workspace.id, newName)
        setIsLoading(false)
        if (res.success) {
            toast.success("Đã đổi tên Workspace thành công")
            setIsRenaming(false)
        } else {
            toast.error(res.error || "Có lỗi xảy ra")
        }
    }

    const confirmDelete = async () => {
        setIsLoading(true)
        const res = await deleteWorkspaceAction(workspace.id)
        setIsLoading(false)
        if (res.success) {
            toast.success("Đã xóa Workspace thành công")
            setIsDeleting(false)
        } else {
            toast.error(res.error || "Có lỗi xảy ra")
        }
    }

    const targetPath = userGlobalRole === 'ADMIN' ? `/${workspace.id}/admin` : `/${workspace.id}/dashboard`

    return (
        <>
            <Link href={targetPath} className="block group">
                <Card className="relative overflow-hidden bg-slate-900 border-slate-800 transition-all duration-300 group-hover:border-indigo-500/50 group-hover:shadow-[0_0_30px_-5px_rgba(99,102,241,0.3)] cursor-pointer h-64 flex flex-col justify-end p-5 rounded-xl">

                    {/* Simulated Image Background */}
                    <div className="absolute inset-0 z-0 bg-gradient-to-br from-indigo-900/40 to-slate-900">
                        {/* Pattern Overlay */}
                        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0)', backgroundSize: '24px 24px' }} />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/60 to-transparent" />
                    </div>

                    <div className="relative z-10 flex flex-col h-full justify-between">
                        <div className="flex justify-end items-start">
                            <Badge variant={role === 'OWNER' ? 'default' : 'secondary'} className={role === 'OWNER' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-slate-800 text-slate-300'}>
                                {role}
                            </Badge>
                        </div>

                        <div>
                            <CardTitle className="text-2xl text-white font-semibold tracking-tight mb-2">
                                {workspace.name}
                            </CardTitle>
                            <CardDescription className="text-slate-400 line-clamp-2 min-h-[2.5rem]">
                                {workspace.description || 'Không gian làm việc'}
                            </CardDescription>

                            <div className="mt-4 flex items-center justify-between text-xs text-slate-500 border-t border-slate-800/50 pt-4">
                                <span className="flex-1">
                                    Cập nhật {formatDistanceToNow(new Date(workspace.updatedAt), { addSuffix: true, locale: vi })}
                                </span>

                                {userGlobalRole === 'ADMIN' && (
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <div
                                                className="p-1.5 rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
                                                onClick={(e) => {
                                                    e.preventDefault()
                                                    e.stopPropagation()
                                                }}
                                            >
                                                <MoreHorizontal className="w-4 h-4 text-slate-400" />
                                            </div>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="bg-slate-900 border-slate-800 text-slate-200">
                                            <DropdownMenuItem onClick={handleRename} className="hover:bg-slate-800 focus:bg-slate-800 cursor-pointer">
                                                <Edit2 className="w-4 h-4 mr-2" /> Đổi tên
                                            </DropdownMenuItem>
                                            {role === 'OWNER' && (
                                                <DropdownMenuItem onClick={handleDelete} className="text-red-400 hover:bg-red-500/10 focus:bg-red-500/10 cursor-pointer">
                                                    <Trash2 className="w-4 h-4 mr-2" /> Xóa Workspace
                                                </DropdownMenuItem>
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                )}
                            </div>
                        </div>
                    </div>
                </Card>
            </Link>

            {/* Rename Dialog */}
            <Dialog open={isRenaming} onOpenChange={setIsRenaming}>
                <DialogContent className="bg-slate-900 border-slate-800 text-white">
                    <DialogHeader>
                        <DialogTitle>Đổi tên Workspace</DialogTitle>
                        <DialogDescription className="text-slate-400">
                            Nhập tên mới cho không gian làm việc của bạn.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            className="bg-slate-950 border-slate-800 text-white focus:ring-indigo-500"
                            placeholder="Tên workspace..."
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsRenaming(false)} className="text-slate-400 hover:bg-slate-800">Hủy</Button>
                        <Button onClick={confirmRename} disabled={isLoading || !newName.trim()} className="bg-indigo-600 hover:bg-indigo-700">
                            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Lưu thay đổi
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Dialog */}
            <Dialog open={isDeleting} onOpenChange={setIsDeleting}>
                <DialogContent className="bg-slate-900 border-slate-800 text-white">
                    <DialogHeader>
                        <DialogTitle className="text-red-400">Xác nhận xóa Workspace</DialogTitle>
                        <DialogDescription className="text-slate-400">
                            Hành động này không thể hoàn tác. Mọi dữ liệu (task, invoice, payroll...) trong workspace <strong>{workspace.name}</strong> sẽ bị xóa vĩnh viễn.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsDeleting(false)} className="text-slate-400 hover:bg-slate-800">Hủy</Button>
                        <Button
                            variant="destructive"
                            onClick={confirmDelete}
                            disabled={isLoading}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Xác nhận xóa
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
