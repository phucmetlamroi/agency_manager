"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { TaskWithUser } from "@/types/admin"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { assignTask } from "@/actions/task-management-actions"
import { useConfirm } from "@/components/ui/ConfirmModal"
import { toast } from "sonner"
import { Search, ChevronsUpDown } from "lucide-react"

interface AssigneeCellProps {
    task: TaskWithUser
    users: { id: string; username: string; displayName?: string | null; nickname?: string | null }[]
    isAdmin: boolean
    selectedIds?: string[]
    workspaceId: string
}

/**
 * [Username Handle] Resolve best display name: displayName → username.
 * (Never falls back to email; username is now the clean ASCII handle.)
 */
function displayName(user: { username: string; displayName?: string | null; nickname?: string | null }): string {
    return user.displayName?.trim() || user.username
}

function rankFlag(entity: any): string | null {
    const r = entity?.monthlyRanks?.[0]?.rank
    return r === 'C' ? 'bg-yellow-500' : r === 'D' ? 'bg-red-500' : null
}

export function AssigneeCell({ task, users, isAdmin, selectedIds = [], workspaceId }: AssigneeCellProps) {
    const router = useRouter()
    const { confirm } = useConfirm()

    // [UI] Searchable combobox state (admin only).
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [activeIndex, setActiveIndex] = useState(0)
    // Fixed-position coords for the portaled popover (escapes overflow-hidden
    // ancestors like the queue's rounded table card).
    const [coords, setCoords] = useState<{ top: number; left: number; width: number; openUp: boolean } | null>(null)
    const wrapperRef = useRef<HTMLDivElement>(null)
    const triggerRef = useRef<HTMLButtonElement>(null)
    const popoverRef = useRef<HTMLDivElement>(null)

    // Compute the popover position from the trigger; flip up near the viewport
    // bottom so the list is never clipped off-screen.
    const reposition = useCallback(() => {
        const el = triggerRef.current
        if (!el) return
        const r = el.getBoundingClientRect()
        const width = 240
        const estHeight = 300
        const openUp = r.bottom + estHeight > window.innerHeight && r.top > estHeight
        setCoords({
            left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
            top: openUp ? r.top - 6 : r.bottom + 6,
            width,
            openUp,
        })
    }, [])

    // Keep the portal aligned while the page/table scrolls or the window resizes.
    useEffect(() => {
        if (!open) return
        reposition()
        const onMove = () => reposition()
        window.addEventListener('scroll', onMove, true)
        window.addEventListener('resize', onMove)
        return () => {
            window.removeEventListener('scroll', onMove, true)
            window.removeEventListener('resize', onMove)
        }
    }, [open, reposition])

    // Close on outside click — but NOT when clicking inside the portaled popover
    // (which lives under document.body, outside wrapperRef).
    useEffect(() => {
        if (!open) return
        const handler = (e: MouseEvent) => {
            const t = e.target as Node
            if (wrapperRef.current?.contains(t)) return
            if (popoverRef.current?.contains(t)) return
            setOpen(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [open])

    // Reset the keyboard highlight whenever the query changes or we reopen.
    useEffect(() => { setActiveIndex(0) }, [query, open])

    const handleAssign = async (val: string) => {
        if (!val) return
        setOpen(false)
        setQuery('')

        const isSelected = selectedIds.includes(task.id)
        const isBulk = isSelected && selectedIds.length > 1

        // BULK ASSIGN CONFIRMATION
        if (isBulk) {
            if (await confirm({
                title: '⚡ Giao hàng loạt',
                message: `Bạn đang chọn ${selectedIds.length} task. Bạn có muốn giao TẤT CẢ task này cho người được chọn không?`,
                type: 'info',
                confirmText: `Giao cho cả ${selectedIds.length} task`,
                cancelText: 'Chỉ giao task này'
            })) {
                const { bulkAssignTasks } = await import('@/actions/bulk-task-actions')
                const res = await bulkAssignTasks(selectedIds, val === "unassigned" ? null : val, workspaceId)
                if (res.error) toast.error(res.error)
                else { toast.success(`Đã giao ${res.count} task thành công!`); router.refresh() }
                return
            }
        }

        // Single Assign (Default)
        const assignRes = await assignTask(task.id, val === "unassigned" ? null : val, workspaceId)
        if (assignRes?.success) {
            toast.success("Đã cập nhật người làm")
            router.refresh()
        } else {
            toast.error("Giao task thất bại")
        }
    }

    // ── Non-admin: read-only ────────────────────────────────────────────────
    if (!isAdmin) {
        if (task.assignee) {
            const flagColor = rankFlag(task.assignee as any)
            return (
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Avatar className="h-6 w-6">
                            <AvatarImage src={(task.assignee as any).avatarUrl || `https://avatar.vercel.sh/${task.assignee.username}`} className="object-cover" />
                            <AvatarFallback>{displayName(task.assignee)[0]}</AvatarFallback>
                        </Avatar>
                        {flagColor && (
                            <div className={`absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full border border-zinc-900 ${flagColor} shadow-sm`} title={`Cảnh báo hạng ${(task.assignee as any).monthlyRanks?.[0]?.rank}`} />
                        )}
                    </div>
                    <span className="text-sm">{displayName(task.assignee)}</span>
                </div>
            )
        }
        return <span className="text-muted-foreground text-xs italic">Chưa giao</span>
    }

    // ── Admin: searchable combobox ──────────────────────────────────────────
    const members = users.filter((u) => {
        const role = (u as any).role
        return role !== 'CLIENT' && role !== 'LOCKED'
    })
    const q = query.trim().toLowerCase()
    const filtered = q
        ? members.filter((u) => displayName(u).toLowerCase().includes(q) || u.username.toLowerCase().includes(q))
        : members
    // Special command rows (revoke / unassign) only make sense when NOT searching
    // a person's name — hide them while filtering so ↑↓/Enter target real people.
    const showSpecial = !q

    // Keyboard nav over the filtered member list.
    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActiveIndex((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)))
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActiveIndex((i) => Math.max(i - 1, 0))
        } else if (e.key === 'Enter') {
            e.preventDefault()
            const u = filtered[activeIndex]
            if (u) handleAssign(u.id)
        } else if (e.key === 'Escape') {
            e.preventDefault()
            setOpen(false)
        }
    }

    return (
        <div ref={wrapperRef} className="w-[180px]" onClick={(e) => e.stopPropagation()}>
            {/* Trigger */}
            <button
                ref={triggerRef}
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="flex h-8 w-full items-center gap-1.5 rounded-md border border-input bg-transparent px-2 text-xs text-left transition-colors hover:bg-white/5"
            >
                {task.assignee ? (
                    <>
                        <Avatar className="h-5 w-5 shrink-0">
                            <AvatarImage src={(task.assignee as any).avatarUrl || `https://avatar.vercel.sh/${task.assignee.username}`} className="object-cover" />
                            <AvatarFallback>{displayName(task.assignee)[0]}</AvatarFallback>
                        </Avatar>
                        <span className="truncate text-zinc-200">{displayName(task.assignee)}</span>
                    </>
                ) : (
                    <span className="truncate text-zinc-500">Chọn người làm</span>
                )}
                <ChevronsUpDown className="ml-auto h-3.5 w-3.5 shrink-0 text-zinc-500" />
            </button>

            {/* Popover — portaled to <body> with fixed positioning so it is never
                clipped by an overflow-hidden ancestor (the queue table card). */}
            {open && coords && typeof document !== 'undefined' && createPortal(
                <div
                    ref={popoverRef}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        position: 'fixed',
                        top: coords.top,
                        left: coords.left,
                        width: coords.width,
                        transform: coords.openUp ? 'translateY(-100%)' : 'none',
                        zIndex: 1000,
                    }}
                    className="overflow-hidden rounded-lg border border-zinc-700 bg-[#18181b] shadow-[0_16px_48px_rgba(0,0,0,0.5)]"
                >
                    <div className="flex items-center gap-2 border-b border-zinc-800 px-2.5 py-2">
                        <Search className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                        <input
                            autoFocus
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={onKeyDown}
                            placeholder="Tìm người làm…"
                            className="w-full bg-transparent text-xs text-zinc-200 placeholder:text-zinc-600 outline-none"
                        />
                    </div>
                    <div className="max-h-[240px] overflow-y-auto py-1 custom-scrollbar">
                        {showSpecial && (
                            <>
                                <button type="button" onClick={() => handleAssign('sys:revoke')} className="flex w-full items-center px-3 py-1.5 text-left text-xs font-semibold text-red-400 transition-colors hover:bg-white/5">
                                    ⛔ Thu hồi về System
                                </button>
                                <button type="button" onClick={() => handleAssign('unassigned')} className="flex w-full items-center px-3 py-1.5 text-left text-xs text-zinc-400 transition-colors hover:bg-white/5">
                                    — Huỷ giao —
                                </button>
                                <div className="my-1 h-px bg-zinc-800" />
                            </>
                        )}
                        {filtered.length > 0 ? (
                            filtered.map((u, idx) => {
                                const flagColor = rankFlag(u as any)
                                const isCurrent = task.assignee?.id === u.id
                                const isActive = idx === activeIndex
                                return (
                                    <button
                                        key={u.id}
                                        type="button"
                                        onClick={() => handleAssign(u.id)}
                                        onMouseEnter={() => setActiveIndex(idx)}
                                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${isActive ? 'bg-white/10 text-white' : isCurrent ? 'bg-[#8B5CF6]/10 text-white' : 'text-zinc-300 hover:bg-white/5'}`}
                                    >
                                        <div className="relative">
                                            <Avatar className="h-5 w-5">
                                                <AvatarImage src={(u as any).avatarUrl || `https://avatar.vercel.sh/${u.username}`} className="object-cover" />
                                                <AvatarFallback>{displayName(u)[0]}</AvatarFallback>
                                            </Avatar>
                                            {flagColor && (
                                                <div className={`absolute -bottom-1 -right-1 h-2 w-2 rounded-full border border-[#18181b] ${flagColor} shadow-sm`} title={`Cảnh báo hạng ${(u as any).monthlyRanks?.[0]?.rank}`} />
                                            )}
                                        </div>
                                        <span className="truncate">{displayName(u)}</span>
                                    </button>
                                )
                            })
                        ) : (
                            <div className="px-3 py-3 text-xs text-zinc-600">Không có kết quả</div>
                        )}
                    </div>
                </div>,
                document.body,
            )}
        </div>
    )
}
