'use client'

// [Mobile design-handoff §1/§6 (2a) / PR#4 · visual-parity redo] Trang chủ = hàng đợi triage.
// VISUAL: thẻ CHỒNG (deck) đúng prototype — 1 thẻ trước lớn + 2 thẻ ma xoay sau; "vòng X/Y";
// nút trên thẻ; "← để sau" dưới; pill đếm theo loại. LOGIC giữ nguyên: compose 3 nguồn
// (admin/page.tsx, không thêm server action) + OPTIMISTIC bỏ thẻ + toast "Hoàn tác" 5s trước
// khi commit. Actions dùng lại: bulkAssignTasks / updateTaskStatus / acceptClientRequest /
// rejectClientRequest. Styling qua lớp `.mroot .m-*` (globals.css, scoped mobile — desktop
// KHÔNG đổi). Dropdown content portaled ra ngoài .mroot nên giữ style repo.

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Clock, UserPlus, ArrowLeftRight, Check, X, Inbox, ChevronRight } from 'lucide-react'
import { bulkAssignTasks } from '@/actions/bulk-task-actions'
import { updateTaskStatus } from '@/actions/task-actions'
import { acceptClientRequest, rejectClientRequest } from '@/actions/client-request-actions'
import type { ClientRequestDTO } from '@/actions/client-request-actions'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export type TriageTask = {
    id: string
    title: string
    status: string
    clientLabel: string | null
    assigneeLabel: string | null
    deadline: string | null
    kind: 'overdue' | 'review'
}
type TriageUser = { id: string; username: string; nickname?: string | null; displayName?: string | null }

type Item = { t: 'task'; task: TriageTask } | { t: 'req'; req: ClientRequestDTO }
const keyOf = (i: Item) => (i.t === 'task' ? `task:${i.task.id}` : `req:${i.req.id}`)

// FSM-meaningful bulk-ish targets for a triage "Đổi trạng thái" (mirror the board drop targets).
const STATUS_OPTS = ['Đang thực hiện', 'Đã nộp video (nội bộ)', 'Hoàn tất', 'Đang đợi giao', 'Đã hủy']

function userLabel(u: TriageUser) {
    return u.displayName?.trim() || u.nickname?.trim() || `@${u.username}`
}
function fmtDate(iso: string | null) {
    if (!iso) return null
    const d = new Date(iso)
    return isNaN(d.getTime()) ? null : d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
}
function daysLate(iso: string | null): number | null {
    if (!iso) return null
    const d = new Date(iso)
    if (isNaN(d.getTime())) return null
    const ms = Date.now() - d.getTime()
    return ms > 0 ? Math.floor(ms / 86400000) : null
}
function trim(s: string) {
    return s.length > 28 ? `${s.slice(0, 27)}…` : s
}
function initials(label: string | null): string {
    if (!label) return '?'
    const clean = label.replace(/^@/, '').trim()
    const parts = clean.split(/\s+/)
    return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}

export default function AdminTriageQueue({
    tasks,
    requests,
    users,
    workspaceId,
}: {
    tasks: TriageTask[]
    requests: ClientRequestDTO[]
    users: TriageUser[]
    workspaceId: string
}) {
    const router = useRouter()
    const [, startTransition] = useTransition()

    const [items, setItems] = useState<Item[]>(() => [
        ...requests.map((req) => ({ t: 'req' as const, req })),
        ...tasks.map((task) => ({ t: 'task' as const, task })),
    ])
    const [total] = useState(() => tasks.length + requests.length)
    // itemKey → pending 5s timer (undo window). Not yet committed to the server.
    const pending = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

    /** Optimistically remove the item, toast a 5s "Hoàn tác", commit after 5s (undo cancels it). */
    const runWithUndo = (item: Item, label: string, commit: () => Promise<any>) => {
        const k = keyOf(item)
        if (pending.current.has(k)) return
        setItems((prev) => prev.filter((i) => keyOf(i) !== k))
        const timer = setTimeout(async () => {
            pending.current.delete(k)
            try {
                const res = await commit()
                if (res && (res.error || res.success === false)) {
                    toast.error(res.error || 'Thao tác thất bại. Đã hoàn thẻ về hàng đợi.')
                    setItems((prev) => (prev.some((i) => keyOf(i) === k) ? prev : [item, ...prev]))
                } else {
                    startTransition(() => router.refresh())
                }
            } catch {
                toast.error('Thao tác thất bại. Đã hoàn thẻ về hàng đợi.')
                setItems((prev) => (prev.some((i) => keyOf(i) === k) ? prev : [item, ...prev]))
            }
        }, 5000)
        pending.current.set(k, timer)
        toast(label, {
            duration: 5000,
            action: {
                label: 'Hoàn tác',
                onClick: () => {
                    // [review-fix] If the 5s timer already fired, the commit is in flight / done —
                    // do nothing: re-inserting would desync + enable a double-commit.
                    const tt = pending.current.get(k)
                    if (!tt) return
                    clearTimeout(tt)
                    pending.current.delete(k)
                    setItems((prev) => (prev.some((i) => keyOf(i) === k) ? prev : [item, ...prev]))
                },
            },
        })
    }

    const defer = (item: Item) => {
        const k = keyOf(item)
        setItems((prev) => {
            const rest = prev.filter((i) => keyOf(i) !== k)
            return [...rest, item]
        })
    }

    // Segment counts (remaining, by triage type).
    const nOverdue = items.filter((i) => i.t === 'task' && i.task.kind === 'overdue').length
    const nReview = items.filter((i) => i.t === 'task' && i.task.kind === 'review').length
    const nReq = items.filter((i) => i.t === 'req').length

    if (items.length === 0) {
        return (
            <section className="mroot">
                <div className="m-card m-scr flex flex-col items-center gap-2 px-4 py-10 text-center" style={{ background: 'var(--m-bg-2)' }}>
                    <div className="grid h-12 w-12 place-items-center rounded-full" style={{ background: 'rgba(16,185,129,.12)', color: 'var(--m-success-fg)' }}>
                        <Check className="h-6 w-6" />
                    </div>
                    <p className="text-[15px] font-bold" style={{ color: 'var(--m-fg-1)' }}>Hàng đợi trống 🎉</p>
                    <p className="text-[12.5px]" style={{ color: 'var(--m-fg-4)' }}>Không còn việc cần xử lý ngay.</p>
                </div>
            </section>
        )
    }

    const front = items[0]
    const ghosts = items.slice(1, 3)
    const doneSoFar = total - items.length

    return (
        <section className="mroot flex flex-col gap-2.5">
            {/* deck header */}
            <div className="m-row" style={{ fontSize: 12, color: 'var(--m-fg-4)' }}>
                <span className="m-eb">Hàng đợi xử lý</span>
                <span style={{ flex: 1 }} />
                <span className="m-pill ind m-mono">vòng {Math.min(doneSoFar + 1, total)}/{total}</span>
            </div>

            {/* card DECK — front card + rotated ghosts behind */}
            <div style={{ position: 'relative', minHeight: 340 }}>
                {ghosts[1] && (
                    <div className="m-card" style={{ position: 'absolute', inset: '20px -6px auto 14px', height: '86%', transform: 'rotate(2deg)', opacity: 0.45 }} />
                )}
                {ghosts[0] && (
                    <div className="m-card" style={{ position: 'absolute', inset: '11px 2px auto 4px', height: '90%', transform: 'rotate(-1.2deg)', opacity: 0.7 }} />
                )}
                <FrontCard
                    key={keyOf(front)}
                    item={front}
                    users={users}
                    workspaceId={workspaceId}
                    onAssign={(uid, label) => runWithUndo(front, label, () => bulkAssignTasks([(front as any).task.id], uid, workspaceId))}
                    onStatus={(status) =>
                        runWithUndo(front, `Đã chuyển "${trim((front as any).task.title)}" → ${status}`, () =>
                            updateTaskStatus((front as any).task.id, status, workspaceId),
                        )
                    }
                    onAccept={() => runWithUndo(front, `Đã duyệt yêu cầu "${trim((front as any).req.title)}"`, () => acceptClientRequest((front as any).req.id, workspaceId))}
                    onReject={() => runWithUndo(front, `Đã từ chối yêu cầu "${trim((front as any).req.title)}"`, () => rejectClientRequest((front as any).req.id, workspaceId))}
                />
            </div>

            {/* defer + hint */}
            <div className="m-row" style={{ justifyContent: 'space-between', fontSize: 11, color: 'var(--m-fg-4)', padding: '0 2px' }}>
                <button type="button" onClick={() => defer(front)} className="m-press" style={{ padding: '6px 8px', background: 'transparent', border: 0, color: 'var(--m-fg-4)', font: 'inherit' }}>
                    ← để sau
                </button>
                <span style={{ color: 'var(--m-primary-fg)' }}>xử lý bằng nút trên thẻ</span>
            </div>

            {/* segment counts */}
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                <span className="m-pill dan">Quá hạn {nOverdue}</span>
                <span className="m-pill ind">Duyệt {nReview}</span>
                <span className="m-pill info">Yêu cầu {nReq}</span>
            </div>
        </section>
    )
}

function FrontCard({
    item,
    users,
    workspaceId,
    onAssign,
    onStatus,
    onAccept,
    onReject,
}: {
    item: Item
    users: TriageUser[]
    workspaceId: string
    onAssign: (uid: string, label: string) => void
    onStatus: (status: string) => void
    onAccept: () => void
    onReject: () => void
}) {
    const isTask = item.t === 'task'
    const overdue = isTask && item.task.kind === 'overdue'
    const title = isTask ? item.task.title : item.req.title
    const dl = fmtDate(isTask ? item.task.deadline : item.req.desiredDeadline)
    const client = isTask ? item.task.clientLabel : item.req.clientName
    const assignee = isTask ? item.task.assigneeLabel : null
    const late = isTask ? daysLate(item.task.deadline) : null
    const orbColor = overdue ? 'rgba(220,38,38,.12)' : item.t === 'req' ? 'rgba(6,182,212,.12)' : 'rgba(99,102,241,.12)'

    return (
        <div className="m-card m-scr" style={{ position: 'relative', display: 'flex', flexDirection: 'column', padding: 14, gap: 9, background: 'var(--m-bg-2)', overflow: 'hidden', minHeight: 300 }}>
            <div className="m-orb" style={{ background: orbColor, top: -40, right: -40 }} />

            {/* type pill */}
            {overdue ? (
                <span className="m-pill dan">Quá hạn{late ? ` · trễ ${late} ngày` : ''}</span>
            ) : item.t === 'req' ? (
                <span className="m-pill info"><Inbox className="h-3 w-3" /> Yêu cầu khách</span>
            ) : (
                <span className="m-pill ind">Đang duyệt · {item.task.status}</span>
            )}

            <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.2 }}>{title}</div>

            {/* meta row */}
            <div className="m-row" style={{ fontSize: 12.5, color: 'var(--m-fg-3)', flexWrap: 'wrap' }}>
                {isTask && assignee && (
                    <>
                        <span className="m-av" style={{ width: 20, height: 20, fontSize: 9 }}>{initials(assignee)}</span>
                        <span>{assignee}</span>
                    </>
                )}
                {isTask && !assignee && <span>Chưa giao</span>}
                {client && <span>· {client}</span>}
                {dl && <span>· deadline {dl}</span>}
            </div>

            {/* note box */}
            {overdue && (
                <div className="m-note"><Clock className="h-3.5 w-3.5" style={{ flex: 'none' }} />Chưa có bản nộp — deadline đã qua{late ? ` ${late} ngày` : ''}</div>
            )}
            {item.t === 'req' && item.req.desiredType && (
                <div className="m-note"><Inbox className="h-3.5 w-3.5" style={{ flex: 'none' }} />Loại: {item.req.desiredType}</div>
            )}

            <div style={{ flex: 1 }} />

            {/* actions */}
            {isTask ? (
                <div style={{ display: 'flex', gap: 7 }}>
                    <Link href={`/${workspaceId}/task/${item.task.id}`} className="m-btnG" style={{ flex: 1, textDecoration: 'none' }}>
                        Mở task
                    </Link>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className="m-btnG" style={{ flex: 1 }}>
                                <UserPlus className="h-3.5 w-3.5" /> Giao lại
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="max-h-[50vh] overflow-y-auto">
                            <DropdownMenuLabel>Giao cho</DropdownMenuLabel>
                            {users.map((u) => (
                                <DropdownMenuItem key={u.id} onClick={() => onAssign(u.id, `Đã giao "${trim(item.task.title)}" cho ${userLabel(u)}`)}>
                                    {userLabel(u)}
                                </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => onAssign('', `Đã trả "${trim(item.task.title)}" về kho`)}>Trả về kho đợi</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className="m-btnP" style={{ flex: 1.1 }}>
                                <ArrowLeftRight className="h-3.5 w-3.5" /> Trạng thái
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Chuyển sang</DropdownMenuLabel>
                            {STATUS_OPTS.map((st) => (
                                <DropdownMenuItem key={st} className={st === 'Đã hủy' ? 'text-red-400 focus:text-red-400' : ''} onClick={() => onStatus(st)}>
                                    {st}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            ) : (
                <div style={{ display: 'flex', gap: 7 }}>
                    <button type="button" onClick={onReject} className="m-btnD" style={{ flex: 1 }}>
                        <X className="h-4 w-4" /> Từ chối
                    </button>
                    <button type="button" onClick={onAccept} className="m-btnS" style={{ flex: 1.3 }}>
                        <Check className="h-4 w-4" /> Chấp nhận
                    </button>
                </div>
            )}
        </div>
    )
}
