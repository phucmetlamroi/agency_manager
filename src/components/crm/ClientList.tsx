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
import {
    Link2Off, Pencil, Trash2, ExternalLink, GripVertical,
    ChevronRight, Search
} from 'lucide-react'

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
    jobPriceUSD?: number
}

type Client = {
    id: number
    name: string
    parentId?: number | null
    subsidiaries?: Client[]
    projects: Project[]
    tasks: Task[]
}

/* ── Helper: get initials from name ── */
function getInitials(name: string): string {
    return name
        .split(/\s+/)
        .map(w => w[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase()
}

/* ── Helper: deterministic gradient for avatar ── */
function getAvatarGradient(id: number): string {
    const gradients = [
        'linear-gradient(135deg, #6366f1, #8b5cf6)',
        'linear-gradient(135deg, #3b82f6, #6366f1)',
        'linear-gradient(135deg, #8b5cf6, #ec4899)',
        'linear-gradient(135deg, #06b6d4, #3b82f6)',
        'linear-gradient(135deg, #10b981, #06b6d4)',
        'linear-gradient(135deg, #f59e0b, #ef4444)',
        'linear-gradient(135deg, #ec4899, #f43f5e)',
        'linear-gradient(135deg, #14b8a6, #22d3ee)',
    ]
    return gradients[id % gradients.length]
}

/* ── Helper: compute revenue from tasks ── */
function computeRevenue(tasks: Task[]): number {
    return tasks.reduce((sum, t) => sum + (t.jobPriceUSD || 0), 0)
}

/* ── Helper: compute friction % (ratio of non-completed tasks) ── */
function computeFriction(tasks: Task[]): number {
    if (tasks.length === 0) return 0
    const incomplete = tasks.filter(t => t.status !== 'Hoàn tất').length
    return Math.round((incomplete / tasks.length) * 100)
}

/* ── Helper: determine status ── */
function getClientStatus(tasks: Task[]): 'ACTIVE' | 'PENDING' | 'INACTIVE' {
    if (tasks.length === 0) return 'INACTIVE'
    const hasRecent = tasks.some(t => t.status !== 'Hoàn tất')
    return hasRecent ? 'ACTIVE' : 'PENDING'
}

/* ── Grid template for columns ── */
const GRID_TEMPLATE = '2.2fr 0.8fr 0.6fr 0.7fr 0.8fr 60px'

export default function ClientList({ clients, workspaceId }: { clients: Client[], workspaceId: string }) {
    const [editingClient, setEditingClient] = useState<Client | null>(null)
    const [newName, setNewName] = useState('')
    const [draggingId, setDraggingId] = useState<number | null>(null)
    const [dragOverId, setDragOverId] = useState<number | null>(null)
    const [searchQuery, setSearchQuery] = useState('')

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
            toast.success('Đã gộp khách hàng thành công!')
        } else {
            toast.error(res.error)
        }
        setDraggingId(null)
        setDragOverId(null)
    }

    /* Filter clients by search */
    const filteredClients = searchQuery.trim()
        ? clients.filter(c =>
            c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (c.subsidiaries || []).some(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
        )
        : clients

    return (
        <div>
            {/* ── Search bar ── */}
            <div style={{ padding: '12px 20px' }}>
                <div
                    style={{
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                    }}
                >
                    <Search
                        style={{
                            position: 'absolute',
                            left: 14,
                            width: 15,
                            height: 15,
                            color: '#52525b',
                            pointerEvents: 'none',
                        }}
                    />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Tìm khách hàng..."
                        style={{
                            width: '100%',
                            padding: '10px 14px 10px 40px',
                            borderRadius: 12,
                            background: 'rgba(39,39,42,0.60)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            color: '#ffffff',
                            fontSize: 13,
                            outline: 'none',
                            transition: 'border-color 0.15s',
                        }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)' }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)' }}
                    />
                </div>
            </div>

            {/* ── Drag merge banner ── */}
            {draggingId !== null && (
                <div
                    style={{
                        margin: '0 20px 8px',
                        padding: '8px 16px',
                        borderRadius: 10,
                        background: 'rgba(99,102,241,0.10)',
                        border: '1px solid rgba(99,102,241,0.25)',
                        fontSize: 11,
                        color: '#a5b4fc',
                        textAlign: 'center',
                    }}
                    className="animate-pulse"
                >
                    Keo va tha vao mot <strong>khach hang chinh khac</strong> de gop thanh khach hang truc thuoc
                </div>
            )}

            {/* ── Column headers ── */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: GRID_TEMPLATE,
                    padding: '10px 20px',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                }}
            >
                {['Client', 'Revenue', 'Tasks', 'Friction', 'Status', 'Actions'].map(col => (
                    <span
                        key={col}
                        style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: '#52525b',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                        }}
                    >
                        {col}
                    </span>
                ))}
            </div>

            {/* ── Empty state ── */}
            {filteredClients.length === 0 && (
                <div
                    style={{
                        textAlign: 'center',
                        padding: '48px 20px',
                        color: '#52525b',
                        fontSize: 13,
                    }}
                >
                    {searchQuery ? 'Khong tim thay ket qua.' : 'Chua co du lieu khach hang.'}
                </div>
            )}

            {/* ── Client rows ── */}
            {filteredClients.map(client => (
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

            {/* ── Edit Dialog (preserved exactly) ── */}
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

/* ── Types ── */
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

/* ── Status pill component ── */
function StatusPill({ status }: { status: 'ACTIVE' | 'PENDING' | 'INACTIVE' }) {
    const config = {
        ACTIVE: { bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.25)', color: '#34d399', dot: '#34d399' },
        PENDING: { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.25)', color: '#fbbf24', dot: '#fbbf24' },
        INACTIVE: { bg: 'rgba(113,113,122,0.10)', border: 'rgba(113,113,122,0.25)', color: '#71717a', dot: '#71717a' },
    }
    const c = config[status]
    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 10px',
                borderRadius: 9999,
                background: c.bg,
                border: `1px solid ${c.border}`,
                fontSize: 10,
                fontWeight: 600,
                color: c.color,
            }}
        >
            <span
                style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: c.dot,
                    flexShrink: 0,
                }}
            />
            {status}
        </span>
    )
}

/* ── Friction display ── */
function FrictionCell({ value }: { value: number }) {
    let color = '#34d399' // emerald
    if (value > 30) color = '#f87171' // red
    else if (value > 15) color = '#fbbf24' // amber
    return (
        <span
            style={{
                fontSize: 12,
                fontWeight: 600,
                fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                color,
            }}
        >
            {value}%
        </span>
    )
}

/* ── Client row item ── */
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

    /* ── Task aggregation (same logic as original) ── */
    const ownTasks = client.tasks || []
    const subTasks = (client.subsidiaries || []).flatMap(s =>
        s.tasks.map(t => ({ ...t, title: `[${s.name}] ${t.title}` }))
    )
    const allTasks = [...ownTasks, ...subTasks]
    const taskCount = allTasks.length
    const revenue = computeRevenue(allTasks)
    const friction = computeFriction(allTasks)
    const status = getClientStatus(allTasks)
    const subCount = (client.subsidiaries || []).length

    /* ── Drag state ── */
    const isDragTarget = dragOverId === client.id && draggingId !== null && draggingId !== client.id && !isSubsidiary
    const isDragging = draggingId === client.id

    /* ── Avatar size ── */
    const avatarSize = isSubsidiary ? 28 : 34

    return (
        <div>
            {/* ── Main row ── */}
            <div
                draggable={!isSubsidiary}
                onDragStart={(e) => {
                    if (isSubsidiary) return
                    e.dataTransfer.setData('application/client-id', String(client.id))
                    e.dataTransfer.effectAllowed = 'move'
                    setTimeout(() => onDragStart(client.id), 0)
                }}
                onDragEnd={(e) => {
                    e.preventDefault()
                    onDragEnd()
                }}
                onDragOver={(e) => {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    if (!isSubsidiary && draggingId !== null && draggingId !== client.id) {
                        onDragOver(client.id)
                    }
                }}
                onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        onDragOver(-1)
                    }
                }}
                onDrop={(e) => {
                    e.preventDefault()
                    if (!isSubsidiary) onDrop(client.id)
                }}
                style={{
                    display: 'grid',
                    gridTemplateColumns: GRID_TEMPLATE,
                    alignItems: 'center',
                    padding: isSubsidiary ? '10px 20px 10px 68px' : '10px 20px',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    cursor: !isSubsidiary ? 'grab' : 'default',
                    userSelect: 'none',
                    transition: 'background 0.15s, opacity 0.2s, box-shadow 0.2s',
                    background: isDragTarget
                        ? 'rgba(99,102,241,0.12)'
                        : isSubsidiary
                            ? 'rgba(99,102,241,0.03)'
                            : 'transparent',
                    opacity: isDragging ? 0.4 : 1,
                    boxShadow: isDragTarget
                        ? 'inset 0 0 0 1px rgba(99,102,241,0.40)'
                        : isDragging
                            ? 'inset 0 0 0 2px rgba(139,92,246,0.50)'
                            : 'none',
                }}
                onMouseEnter={(e) => {
                    if (!isDragTarget && !isDragging) {
                        e.currentTarget.style.background = isSubsidiary
                            ? 'rgba(99,102,241,0.06)'
                            : 'rgba(255,255,255,0.02)'
                    }
                }}
                onMouseLeave={(e) => {
                    if (!isDragTarget && !isDragging) {
                        e.currentTarget.style.background = isSubsidiary
                            ? 'rgba(99,102,241,0.03)'
                            : 'transparent'
                    }
                }}
            >
                {/* ── Client cell ── */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    {/* Drag handle / expand toggle */}
                    {!isSubsidiary && (
                        <div
                            style={{
                                color: '#52525b',
                                display: 'flex',
                                alignItems: 'center',
                                flexShrink: 0,
                            }}
                            title="Kéo để gộp"
                        >
                            <GripVertical style={{ width: 14, height: 14 }} />
                        </div>
                    )}

                    {/* Expand button */}
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        style={{
                            width: 22,
                            height: 22,
                            borderRadius: 6,
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            flexShrink: 0,
                            transition: 'background 0.15s',
                            color: '#71717a',
                            padding: 0,
                        }}
                    >
                        <ChevronRight
                            style={{
                                width: 13,
                                height: 13,
                                transition: 'transform 0.2s',
                                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                            }}
                        />
                    </button>

                    {/* Connector line for children */}
                    {isSubsidiary && (
                        <div
                            style={{
                                width: 16,
                                height: 1,
                                background: 'rgba(99,102,241,0.20)',
                                flexShrink: 0,
                            }}
                        />
                    )}

                    {/* Avatar */}
                    <div
                        style={{
                            width: avatarSize,
                            height: avatarSize,
                            borderRadius: '50%',
                            background: getAvatarGradient(client.id),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: isSubsidiary ? 10 : 12,
                            fontWeight: 700,
                            color: '#ffffff',
                            flexShrink: 0,
                            letterSpacing: '0.02em',
                        }}
                    >
                        {getInitials(client.name)}
                    </div>

                    {/* Name + sub-brand count */}
                    <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span
                                style={{
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: '#ffffff',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    cursor: 'pointer',
                                    transition: 'color 0.15s',
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.color = '#a5b4fc' }}
                                onMouseLeave={(e) => { e.currentTarget.style.color = '#ffffff' }}
                                onClick={(e) => { e.stopPropagation(); onEdit(client) }}
                                title="Click to edit name"
                            >
                                {client.name}
                            </span>
                            <button
                                onClick={(e) => { e.stopPropagation(); onEdit(client) }}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    padding: 0,
                                    cursor: 'pointer',
                                    color: '#52525b',
                                    display: 'flex',
                                    alignItems: 'center',
                                    transition: 'color 0.15s',
                                    flexShrink: 0,
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.color = '#a5b4fc' }}
                                onMouseLeave={(e) => { e.currentTarget.style.color = '#52525b' }}
                                title="Sửa tên"
                            >
                                <Pencil style={{ width: 11, height: 11 }} />
                            </button>
                        </div>
                        {!isSubsidiary && subCount > 0 && (
                            <div style={{ fontSize: 10, color: '#52525b', marginTop: 1 }}>
                                {subCount} sub-brand{subCount > 1 ? 's' : ''}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Revenue cell ── */}
                <div>
                    <span
                        style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: '#ffffff',
                            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                        }}
                    >
                        ${revenue.toLocaleString()}
                    </span>
                </div>

                {/* ── Tasks cell ── */}
                <div>
                    <span style={{ fontSize: 12, color: '#a1a1aa' }}>
                        {taskCount}
                    </span>
                </div>

                {/* ── Friction cell ── */}
                <div>
                    <FrictionCell value={friction} />
                </div>

                {/* ── Status cell ── */}
                <div>
                    <StatusPill status={status} />
                </div>

                {/* ── Actions cell ── */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {/* Detail link */}
                    <Link
                        href={`/${workspaceId}/admin/crm/${client.id}`}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            background: 'rgba(99,102,241,0.10)',
                            border: '1px solid rgba(99,102,241,0.20)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#a5b4fc',
                            textDecoration: 'none',
                            transition: 'background 0.15s, border-color 0.15s',
                            flexShrink: 0,
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(99,102,241,0.20)'
                            e.currentTarget.style.borderColor = 'rgba(99,102,241,0.40)'
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(99,102,241,0.10)'
                            e.currentTarget.style.borderColor = 'rgba(99,102,241,0.20)'
                        }}
                        title="Chi tiết"
                    >
                        <ExternalLink style={{ width: 14, height: 14 }} />
                    </Link>

                    {/* Unmerge button (only for subsidiaries) */}
                    {isSubsidiary && (
                        <button
                            onClick={handleUnmerge}
                            style={{
                                width: 28,
                                height: 28,
                                borderRadius: 6,
                                background: 'rgba(245,158,11,0.10)',
                                border: '1px solid rgba(245,158,11,0.20)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#fbbf24',
                                cursor: 'pointer',
                                transition: 'background 0.15s',
                                flexShrink: 0,
                                padding: 0,
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(245,158,11,0.20)' }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(245,158,11,0.10)' }}
                            title="Tách ra"
                        >
                            <Link2Off style={{ width: 13, height: 13 }} />
                        </button>
                    )}

                    {/* Delete button */}
                    <button
                        onClick={handleDelete}
                        style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            background: 'rgba(239,68,68,0.08)',
                            border: '1px solid rgba(239,68,68,0.15)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#f87171',
                            cursor: 'pointer',
                            transition: 'background 0.15s',
                            flexShrink: 0,
                            padding: 0,
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.18)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)' }}
                        title="Xóa"
                    >
                        <Trash2 style={{ width: 13, height: 13 }} />
                    </button>
                </div>
            </div>

            {/* ── Expanded content: task list + child rows ── */}
            {isExpanded && (
                <div
                    style={{
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }}
                >
                    {/* Task preview */}
                    {allTasks.length > 0 && (
                        <div style={{ padding: '12px 20px 12px 80px' }}>
                            <div
                                style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    color: '#6366f1',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    marginBottom: 6,
                                }}
                            >
                                Recent Videos (Aggregated)
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                {allTasks.slice(0, 5).map((t, idx) => (
                                    <div
                                        key={`${t.id}-${idx}`}
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            padding: '6px 10px',
                                            borderRadius: 8,
                                            background: 'rgba(255,255,255,0.03)',
                                            border: '1px solid rgba(255,255,255,0.04)',
                                            fontSize: 12,
                                            transition: 'background 0.15s',
                                        }}
                                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                                    >
                                        <span
                                            style={{
                                                color: '#d4d4d8',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                                maxWidth: 280,
                                            }}
                                        >
                                            {t.title}
                                        </span>
                                        <span
                                            style={{
                                                fontSize: 9,
                                                fontWeight: 600,
                                                padding: '2px 8px',
                                                borderRadius: 6,
                                                flexShrink: 0,
                                                ...(t.status === 'Hoàn tất'
                                                    ? {
                                                        color: '#34d399',
                                                        background: 'rgba(16,185,129,0.10)',
                                                        border: '1px solid rgba(16,185,129,0.20)',
                                                    }
                                                    : {
                                                        color: '#fbbf24',
                                                        background: 'rgba(245,158,11,0.10)',
                                                        border: '1px solid rgba(245,158,11,0.20)',
                                                    }),
                                            }}
                                        >
                                            {t.status}
                                        </span>
                                    </div>
                                ))}
                                {allTasks.length > 5 && (
                                    <div style={{ fontSize: 10, color: '#52525b', textAlign: 'center', paddingTop: 4 }}>
                                        ...con {allTasks.length - 5} video nua
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Child / subsidiary rows */}
                    {(client.subsidiaries || []).length > 0 && (
                        <div>
                            <div
                                style={{
                                    padding: '8px 20px 4px 80px',
                                    fontSize: 10,
                                    fontWeight: 700,
                                    color: '#3b82f6',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                }}
                            >
                                Brands / Subsidiaries
                            </div>
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
                    )}

                    {/* Empty expanded state */}
                    {ownTasks.length === 0 && (client.subsidiaries || []).length === 0 && (
                        <div
                            style={{
                                padding: '16px 20px 16px 80px',
                                fontSize: 12,
                                color: '#52525b',
                                fontStyle: 'italic',
                            }}
                        >
                            Trống
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
