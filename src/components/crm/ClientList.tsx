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
import { Link2Off, Pencil, Trash2, ExternalLink, GripVertical, ChevronDown, ChevronRight } from 'lucide-react'

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

    const getScoreConfig = (score: number) => {
        if (score >= 30) return { color: '#34d399', glow: 'rgba(52,211,153,0.4)', label: 'HIGH', gradient: ['#10b981', '#34d399'] }
        if (score >= 15) return { color: '#818cf8', glow: 'rgba(129,140,248,0.4)', label: 'MED', gradient: ['#6366f1', '#818cf8'] }
        return { color: '#fb7185', glow: 'rgba(251,113,133,0.3)', label: 'LOW', gradient: ['#f43f5e', '#fb7185'] }
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
            className={`rounded-xl overflow-hidden transition-all duration-300 select-none border ${
                isDragTarget
                    ? 'border-purple-400 bg-purple-900/20 shadow-xl shadow-purple-500/20 scale-[1.01]'
                    : isSubsidiary
                    ? 'border-white/5 bg-zinc-900/40'
                    : 'border-white/10 bg-zinc-950/60 backdrop-blur-sm hover:border-white/20 hover:bg-zinc-900/60 shadow-lg shadow-black/30'
            } ${isDragging ? 'opacity-40 ring-2 ring-purple-500/60' : ''} ${
                !isSubsidiary ? 'cursor-grab active:cursor-grabbing' : ''
            }`}
        >
            <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    {/* Drag handle */}
                    {!isSubsidiary && (
                        <div className="text-zinc-600 hover:text-purple-400 transition-colors select-none" title="Kéo để gộp">
                            <GripVertical className="w-4 h-4" />
                        </div>
                    )}
                    <div className="text-zinc-500 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </div>
                    <div>
                        <div className="font-semibold text-zinc-100 flex items-center gap-2 flex-wrap">
                            {client.name}
                            <button onClick={(e) => { e.stopPropagation(); onEdit(client) }}
                                className="text-zinc-600 hover:text-zinc-200 transition-colors" title="Sửa tên">
                                <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <Link href={`/${workspaceId}/admin/crm/${client.id}`} onClick={(e) => e.stopPropagation()}
                                className="text-[11px] bg-indigo-600/20 text-indigo-400 px-2 py-0.5 rounded-lg hover:bg-indigo-600 hover:text-white transition-all border border-indigo-500/40 flex items-center gap-1">
                                <ExternalLink className="w-3 h-3" /> Chi tiết
                            </Link>
                            {isSubsidiary && (
                                <button onClick={handleUnmerge}
                                    className="text-[11px] bg-amber-600/20 text-amber-400 px-2 py-0.5 rounded-lg hover:bg-amber-600 hover:text-white transition-all border border-amber-500/30 flex items-center gap-1">
                                    <Link2Off className="w-3 h-3" /> Tách ra
                                </button>
                            )}
                            <button onClick={handleDelete}
                                className="text-[11px] bg-red-600/15 text-red-400 px-2 py-0.5 rounded-lg hover:bg-red-600 hover:text-white transition-all border border-red-500/25 flex items-center gap-1">
                                <Trash2 className="w-3 h-3" />
                            </button>
                        </div>
                        <div className="text-xs text-zinc-600 mt-0.5">
                            {(client.subsidiaries || []).length} Brands • {taskCount} Videos
                        </div>
                    </div>
                </div>

                {/* AI Score — Circular Ring */}
                <div className="flex-shrink-0 flex items-center gap-3">
                    {(() => {
                        const cfg = getScoreConfig(client.aiScore)
                        const radius = 22
                        const circ = 2 * Math.PI * radius
                        const maxScore = 100
                        const pct = Math.min(client.aiScore / maxScore, 1)
                        const dash = pct * circ
                        const id = `grad-${client.id}`
                        return (
                            <div className="relative" title={`AI Score: ${client.aiScore.toFixed(1)}`}>
                                <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90">
                                    <defs>
                                        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="0%">
                                            <stop offset="0%" stopColor={cfg.gradient[0]} />
                                            <stop offset="100%" stopColor={cfg.gradient[1]} />
                                        </linearGradient>
                                    </defs>
                                    {/* Track */}
                                    <circle cx="28" cy="28" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
                                    {/* Progress */}
                                    <circle cx="28" cy="28" r={radius} fill="none"
                                        stroke={`url(#${id})`} strokeWidth="4"
                                        strokeLinecap="round"
                                        strokeDasharray={`${dash} ${circ}`}
                                        style={{ filter: `drop-shadow(0 0 4px ${cfg.glow})`, transition: 'stroke-dasharray 0.6s ease' }}
                                    />
                                </svg>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="text-[11px] font-black" style={{ color: cfg.color }}>{client.aiScore.toFixed(0)}</span>
                                    <span className="text-[8px] font-bold" style={{ color: cfg.color, opacity: 0.7 }}>{cfg.label}</span>
                                </div>
                            </div>
                        )
                    })()}
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
