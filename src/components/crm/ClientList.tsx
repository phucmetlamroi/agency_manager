'use client'

import { useState } from 'react'
import Link from 'next/link'
import { deleteClient, updateClient, mergeClientIntoParent, unmergeClient } from '@/actions/crm-actions'
import { useConfirm } from '@/components/ui/ConfirmModal'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Link2Off } from 'lucide-react'

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
    parentId?: number | null
    subsidiaries?: Client[]
    projects: Project[]
    tasks: Task[]
}

export default function ClientList({ clients, workspaceId }: { clients: Client[], workspaceId: string }) {
    const [editingClient, setEditingClient] = useState<Client | null>(null)
    const [newName, setNewName] = useState('')
    const [draggingId, setDraggingId] = useState<number | null>(null)
    const [dragOverId, setDragOverId] = useState<number | null>(null)

    const handleEditClick = (client: Client) => {
        setEditingClient(client)
        setNewName(client.name)
    }

    const handleUpdate = async () => {
        if (!editingClient) return
        if (!newName.trim()) {
            toast.error('Tên không được để trống')
            return
        }
        const res = await updateClient(editingClient.id, { name: newName }, workspaceId)
        if (res.success) {
            toast.success('Đã cập nhật tên khách hàng')
            setEditingClient(null)
        } else {
            toast.error(res.error)
        }
    }

    const handleDrop = async (targetId: number) => {
        if (!draggingId || draggingId === targetId) return
        toast.loading('Đang gộp khách hàng...')
        const res = await mergeClientIntoParent(draggingId, targetId, workspaceId)
        toast.dismiss()
        if (res.success) {
            toast.success('✅ Đã gộp khách hàng thành công!')
        } else {
            toast.error(res.error)
        }
        setDraggingId(null)
        setDragOverId(null)
    }

    return (
        <div className="space-y-3">
            {draggingId !== null && (
                <div className="text-xs text-center text-purple-400 py-2 px-4 bg-purple-900/20 rounded-lg border border-purple-500/30 animate-pulse">
                    🔗 Kéo và thả vào một <strong>khách hàng chính khác</strong> để gộp thành khách hàng trực thuộc
                </div>
            )}

            {clients.length === 0 && (
                <div className="text-center py-8 text-gray-500">Chưa có dữ liệu khách hàng.</div>
            )}

            {clients.map(client => (
                <ClientItem
                    key={client.id}
                    client={client}
                    onEdit={handleEditClick}
                    workspaceId={workspaceId}
                    draggingId={draggingId}
                    dragOverId={dragOverId}
                    onDragStart={(id) => setDraggingId(id)}
                    onDragEnd={() => { setDraggingId(null); setDragOverId(null) }}
                    onDragOver={(id) => setDragOverId(id)}
                    onDrop={handleDrop}
                />
            ))}

            <Dialog open={!!editingClient} onOpenChange={(open) => !open && setEditingClient(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Đổi tên khách hàng</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Tên mới</Label>
                            <Input
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="Nhập tên khách hàng..."
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingClient(null)}>Hủy</Button>
                        <Button onClick={handleUpdate}>Lưu thay đổi</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

type ClientItemProps = {
    client: Client
    onEdit: (c: Client) => void
    workspaceId: string
    draggingId: number | null
    dragOverId: number | null
    onDragStart: (id: number) => void
    onDragEnd: () => void
    onDragOver: (id: number) => void
    onDrop: (targetId: number) => void
    isSubsidiary?: boolean
}

function ClientItem({
    client, onEdit, workspaceId,
    draggingId, dragOverId,
    onDragStart, onDragEnd, onDragOver, onDrop,
    isSubsidiary = false
}: ClientItemProps) {
    const { confirm } = useConfirm()
    const [isExpanded, setIsExpanded] = useState(false)

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation()
        if (!(await confirm({
            title: 'Xóa Khách hàng?',
            message: `Bạn có chắc muốn xóa khách hàng "${client.name}"?\nHành động này không thể hoàn tác!`,
            type: 'danger',
            confirmText: 'Xóa luôn',
            cancelText: 'Hủy'
        }))) return

        const res = await deleteClient(client.id, workspaceId)
        if (!res.success) toast.error(res.error)
        else toast.success('Đã xóa khách hàng')
    }

    const handleUnmerge = async (e: React.MouseEvent) => {
        e.stopPropagation()
        if (!(await confirm({
            title: 'Tách khỏi khách hàng chính?',
            message: `Bạn có chắc muốn tách "${client.name}" ra thành khách hàng độc lập?\nDữ liệu Task giữ nguyên, chỉ thay đổi cơ cấu phân cấp.`,
            type: 'warning',
            confirmText: 'Tách ra',
            cancelText: 'Hủy'
        }))) return

        const res = await unmergeClient(client.id, workspaceId)
        if (!res.success) toast.error(res.error)
        else toast.success('Đã tách khách hàng thành công')
    }

    const getScoreColor = (score: number) => {
        if (score >= 80) return 'text-green-400'
        if (score >= 50) return 'text-yellow-400'
        return 'text-red-400'
    }

    const ownTasks = client.tasks || []
    const subTasks = (client.subsidiaries || []).flatMap(s =>
        s.tasks.map(t => ({ ...t, title: `[${s.name}] ${t.title}` }))
    )
    const allTasks = [...ownTasks, ...subTasks]
    const taskCount = allTasks.length

    const isDragTarget = dragOverId === client.id && draggingId !== null && draggingId !== client.id && !isSubsidiary
    const isDragging = draggingId === client.id

    return (
        <div
            // The entire card is draggable for root clients — HTML5 DnD requires
            // draggable on the element that fires onDragStart
            draggable={!isSubsidiary}
            onDragStart={(e) => {
                if (isSubsidiary) return
                // CRITICAL: setData is required by HTML5 DnD API for drag to actually work
                e.dataTransfer.setData('application/client-id', String(client.id))
                e.dataTransfer.effectAllowed = 'move'
                // Defer state update so ghost image renders first
                setTimeout(() => onDragStart(client.id), 0)
            }}
            onDragEnd={(e) => {
                e.preventDefault()
                onDragEnd()
            }}
            onDragOver={(e) => {
                // Must preventDefault to allow drop
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (!isSubsidiary && draggingId !== null && draggingId !== client.id) {
                    onDragOver(client.id)
                }
            }}
            onDragLeave={(e) => {
                // Only clear if leaving the card itself (not a child element)
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    onDragOver(-1)
                }
            }}
            onDrop={(e) => {
                e.preventDefault()
                if (!isSubsidiary) onDrop(client.id)
            }}
            className={`border rounded-lg overflow-hidden transition-all duration-200 select-none ${
                isDragTarget
                    ? 'border-purple-400 bg-purple-900/30 shadow-lg shadow-purple-500/20 scale-[1.01]'
                    : 'border-white/10 bg-white/5'
            } ${isDragging ? 'opacity-40 ring-2 ring-purple-500/60' : ''} ${
                !isSubsidiary ? 'cursor-grab active:cursor-grabbing' : ''
            }`}
        >
            <div
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-4 flex items-center justify-between"
            >
                <div className="flex items-center gap-3">
                    {/* Grip icon — visual indicator that the card is draggable */}
                    {!isSubsidiary && (
                        <div
                            className="text-gray-500 hover:text-purple-400 transition-colors select-none px-0.5"
                            title="Kéo để gộp vào khách hàng khác"
                        >
                            ⠿
                        </div>
                    )}
                    <span className="text-gray-400 text-sm">{isExpanded ? '▼' : '▶'}</span>
                    <div>
                        <div className="font-semibold text-white flex items-center gap-2 flex-wrap">
                            {client.name}
                            <button
                                onClick={(e) => { e.stopPropagation(); onEdit(client) }}
                                className="text-gray-400 hover:text-white transition-colors"
                                title="Sửa tên"
                            >
                                ✏️
                            </button>
                            <Link
                                href={`/${workspaceId}/admin/crm/${client.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-xs bg-purple-600/30 text-purple-400 px-2 py-0.5 rounded hover:bg-purple-600 hover:text-white transition-colors border border-purple-500/50"
                            >
                                ↗ Chi tiết
                            </Link>
                            {isSubsidiary && (
                                <button
                                    onClick={handleUnmerge}
                                    className="text-xs bg-orange-600/20 text-orange-400 px-2 py-0.5 rounded hover:bg-orange-600 hover:text-white transition-colors border border-orange-500/30 flex items-center gap-1"
                                    title="Tách khỏi khách hàng chính"
                                >
                                    <Link2Off className="w-3 h-3" />
                                    Tách ra
                                </button>
                            )}
                            <button
                                onClick={handleDelete}
                                className="text-xs bg-red-600/20 text-red-400 px-2 py-0.5 rounded hover:bg-red-600 hover:text-white transition-colors border border-red-500/30"
                            >
                                🗑️ Xóa
                            </button>
                        </div>
                        <div className="text-xs text-gray-500">
                            {(client.subsidiaries || []).length} Brands • {taskCount} Videos
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <div className="text-xs text-gray-500 uppercase">AI Score</div>
                        <div className={`font-mono font-bold ${getScoreColor(client.aiScore)}`}>
                            {client.aiScore.toFixed(1)}
                        </div>
                    </div>
                </div>
            </div>

            {isExpanded && (
                <div className="bg-black/20 p-4 pl-12 border-t border-white/10 space-y-3">
                    {allTasks.length > 0 && (
                        <div className="mb-4">
                            <div className="text-xs text-purple-400 font-bold uppercase mb-2">Recent Videos (Aggregated)</div>
                            <div className="space-y-1">
                                {allTasks.slice(0, 5).map((t, idx) => (
                                    <div key={`${t.id}-${idx}`} className="bg-white/5 p-2 rounded text-sm flex justify-between items-center hover:bg-white/10">
                                        <span className="truncate max-w-[200px]">{t.title}</span>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                                            t.status === 'Hoàn tất'
                                                ? 'border-green-500 text-green-400 bg-green-900/20'
                                                : 'border-yellow-500 text-yellow-500 bg-yellow-900/20'
                                        }`}>
                                            {t.status}
                                        </span>
                                    </div>
                                ))}
                                {allTasks.length > 5 && (
                                    <div className="text-xs text-center text-gray-500 pt-1">
                                        ...còn {allTasks.length - 5} video nữa
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {(client.subsidiaries || []).length > 0 && (
                        <div>
                            <div className="text-xs text-blue-400 font-bold uppercase mb-2">Brands / Subsidiaries</div>
                            <div className="space-y-2">
                                {(client.subsidiaries || []).map(sub => (
                                    <ClientItem
                                        key={sub.id}
                                        client={sub}
                                        onEdit={onEdit}
                                        workspaceId={workspaceId}
                                        draggingId={draggingId}
                                        dragOverId={dragOverId}
                                        onDragStart={onDragStart}
                                        onDragEnd={onDragEnd}
                                        onDragOver={onDragOver}
                                        onDrop={onDrop}
                                        isSubsidiary={true}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {ownTasks.length === 0 && (client.subsidiaries || []).length === 0 && (
                        <div className="text-sm text-gray-600 italic">Trống</div>
                    )}
                </div>
            )}
        </div>
    )
}
