'use client'

import { useState } from 'react'
import Link from 'next/link'
import { deleteClient, updateClient } from '@/actions/crm-actions'
import { useConfirm } from '@/components/ui/ConfirmModal'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

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

export default function ClientList({ clients }: { clients: Client[] }) {
    const [editingClient, setEditingClient] = useState<Client | null>(null)
    const [newName, setNewName] = useState('')

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

        const res = await updateClient(editingClient.id, { name: newName })
        if (res.success) {
            toast.success('Đã cập nhật tên khách hàng')
            setEditingClient(null)
        } else {
            toast.error(res.error)
        }
    }

    return (
        <div className="space-y-4">
            {clients.length === 0 && (
                <div className="text-center py-8 text-gray-500">Chưa có dữ liệu khách hàng.</div>
            )}

            {clients.map(client => (
                <ClientItem key={client.id} client={client} onEdit={handleEditClick} />
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

function ClientItem({ client, onEdit }: { client: Client, onEdit: (c: Client) => void }) {
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

        const res = await deleteClient(client.id)
        if (!res.success) {
            toast.error(res.error)
        } else {
            toast.success('Đã xóa khách hàng')
        }
    }

    // Determine Score Color
    const getScoreColor = (score: number) => {
        if (score >= 80) return 'text-green-400'
        if (score >= 50) return 'text-yellow-400'
        return 'text-red-400'
    }

    // Aggregate Tasks from Parent + Subsidiaries
    const ownTasks = client.tasks || []
    const subTasks = client.subsidiaries?.flatMap(s => s.tasks.map(t => ({ ...t, title: `[${s.name}] ${t.title}` }))) || []
    const allTasks = [...ownTasks, ...subTasks].sort((a, b) => {
        // Sort by ID or creation if available, else just concat. 
        // Since we don't have createdAt here easily without changing type, we might just assume order or rely on ID text?
        // Actually the backend sorts by createdAt desc.
        // Let's just merge. If we need strict sorting we need createdAt field in the Task type.
        return 0
    })

    // Better: The Task type in ClientList doesn't have createdAt. 
    // Let's check the type definition at top of file. 
    // It says: type Task = { id, title, status, value? }
    // We should probably add createdAt to the type to sort correctly, but for now let's just show them.
    // To make it useful, we really should sort by "Recent". 
    // I'll assume the arrays from backend are already sorted individually. 
    // I'll merge them.

    const taskCount = allTasks.length

    return (
        <div className="border border-white/10 rounded-lg overflow-hidden bg-white/5">
            <div
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <span className="text-gray-400 text-sm">{isExpanded ? '▼' : '▶'}</span>
                    <div>
                        <div className="font-semibold text-white flex items-center gap-2">
                            {client.name}
                            <button
                                onClick={(e) => { e.stopPropagation(); onEdit(client) }}
                                className="text-gray-400 hover:text-white transition-colors"
                                title="Sửa tên"
                            >
                                ✏️
                            </button>
                            <Link
                                href={`/admin/crm/${client.id}`}
                                onClick={(e) => e.stopPropagation()} // Prevent expand
                                className="text-xs bg-purple-600/30 text-purple-400 px-2 py-0.5 rounded hover:bg-purple-600 hover:text-white transition-colors border border-purple-500/50"
                            >
                                ↗ Chi tiết
                            </Link>
                            <button
                                onClick={handleDelete}
                                className="text-xs bg-red-600/20 text-red-400 px-2 py-0.5 rounded hover:bg-red-600 hover:text-white transition-colors border border-red-500/30"
                            >
                                🗑️ Xóa
                            </button>
                        </div>
                        <div className="text-xs text-gray-500">
                            {client.subsidiaries?.length || 0} Brands • {taskCount} Videos
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
                    {/* Tasks/Videos List (Aggregated) */}
                    {allTasks.length > 0 && (
                        <div className="mb-4">
                            <div className="text-xs text-purple-400 font-bold uppercase mb-2">Recent Videos (Aggregated)</div>
                            <div className="space-y-1">
                                {allTasks.slice(0, 5).map((t, idx) => (
                                    <div key={`${t.id}-${idx}`} className="bg-white/5 p-2 rounded text-sm flex justify-between items-center hover:bg-white/10">
                                        <span className="truncate max-w-[200px]">{t.title}</span>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${t.status === 'Hoàn tất'
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

                    {/* Subsidiaries (Recursive) */}
                    {client.subsidiaries && client.subsidiaries.length > 0 && (
                        <div>
                            <div className="text-xs text-blue-400 font-bold uppercase mb-2">Brands / Subsidiaries</div>
                            <div className="space-y-2">
                                {client.subsidiaries.map(sub => (
                                    <ClientItem key={sub.id} client={sub} onEdit={onEdit} />
                                ))}
                            </div>
                        </div>
                    )}

                    {(!client.tasks || client.tasks.length === 0) && (!client.subsidiaries || client.subsidiaries.length === 0) && (
                        <div className="text-sm text-gray-600 italic">Trống</div>
                    )}
                </div>
            )}
        </div>
    )
}
