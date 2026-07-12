'use client'

// [Mobile design-handoff §1/§6 (2a) / PR#4] Trang chủ = hàng đợi triage. Compose từ 3 nguồn
// (admin/page.tsx đã fetch, không thêm server action): task Quá hạn + task review-phase +
// yêu cầu khách (getClientRequests). Mỗi thẻ có bộ nút theo loại; "Để sau" đẩy cuối hàng; mỗi
// action = OPTIMISTIC bỏ thẻ + toast "Hoàn tác" 5s TRƯỚC khi commit (huỷ trong 5s = không gọi
// server). Actions dùng lại: bulkAssignTasks / updateTaskStatus / acceptClientRequest /
// rejectClientRequest.
//
// GHI CHÚ lệch spec: thẻ review-phase spec ghi "Gửi khách/Y-c sửa → ReviewFlowActions (F10)" —
// flow đó neo theo ASSET của review module, không lấy sạch từ 1 thẻ home. Ở đây thẻ review dùng
// "Đổi trạng thái" (updateTaskStatus, hợp lệ cho status video theo R10) + "Mở" (vào chi tiết để
// chạy đúng review-flow). Đã note để owner biết.

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Clock, UserPlus, ArrowLeftRight, Check, X, Inbox, ChevronRight } from 'lucide-react'
import { bulkAssignTasks } from '@/actions/bulk-task-actions'
import { updateTaskStatus } from '@/actions/task-actions'
import { acceptClientRequest, rejectClientRequest } from '@/actions/client-request-actions'
import { getStatusInfo } from '@/lib/status-colors'
import { EmptyState } from '@/components/ui/empty-state'
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
                    // the key was removed from `pending`. Do nothing: re-inserting here would desync
                    // the UI and (with the server call already made) enable a double-commit.
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

    if (items.length === 0) {
        return (
            <section>
                <h2 className="mb-2 text-title font-semibold text-foreground">Hàng đợi xử lý</h2>
                <EmptyState variant="cleared" title="Hàng đợi trống — không còn việc cần xử lý 🎉" />
            </section>
        )
    }

    return (
        <section>
            <h2 className="mb-2 flex items-center gap-2 text-title font-semibold text-foreground">
                Hàng đợi xử lý
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-caption font-bold text-primary-accent">{items.length}</span>
            </h2>
            <div className="flex flex-col gap-2.5">
                {items.map((item) =>
                    item.t === 'task' ? (
                        <TaskCard
                            key={keyOf(item)}
                            task={item.task}
                            users={users}
                            workspaceId={workspaceId}
                            onAssign={(uid, label) =>
                                runWithUndo(item, label, () => bulkAssignTasks([item.task.id], uid, workspaceId))
                            }
                            onStatus={(status) =>
                                runWithUndo(item, `Đã chuyển "${trim(item.task.title)}" → ${status}`, () =>
                                    updateTaskStatus(item.task.id, status, workspaceId),
                                )
                            }
                            onDefer={() => defer(item)}
                        />
                    ) : (
                        <RequestCard
                            key={keyOf(item)}
                            req={item.req}
                            onAccept={() =>
                                runWithUndo(item, `Đã duyệt yêu cầu "${trim(item.req.title)}"`, () =>
                                    acceptClientRequest(item.req.id, workspaceId),
                                )
                            }
                            onReject={() =>
                                runWithUndo(item, `Đã từ chối yêu cầu "${trim(item.req.title)}"`, () =>
                                    rejectClientRequest(item.req.id, workspaceId),
                                )
                            }
                            onDefer={() => defer(item)}
                        />
                    ),
                )}
            </div>
        </section>
    )
}

function trim(s: string) {
    return s.length > 28 ? `${s.slice(0, 27)}…` : s
}

function CardShell({ children }: { children: React.ReactNode }) {
    return <div className="rounded-2xl border border-white/8 bg-zinc-950/60 p-3.5 backdrop-blur-md">{children}</div>
}

function DeferBtn({ onClick }: { onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white/5 px-3 text-caption font-bold text-muted-foreground transition-colors active:bg-white/10"
        >
            <Clock className="h-3.5 w-3.5" /> Để sau
        </button>
    )
}

function TaskCard({
    task,
    users,
    workspaceId,
    onAssign,
    onStatus,
    onDefer,
}: {
    task: TriageTask
    users: TriageUser[]
    workspaceId: string
    onAssign: (uid: string, label: string) => void
    onStatus: (status: string) => void
    onDefer: () => void
}) {
    const s = getStatusInfo(task.status)
    const dl = fmtDate(task.deadline)
    const overdue = task.kind === 'overdue'
    return (
        <CardShell>
            <div className="flex items-start justify-between gap-2">
                <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-bold"
                    style={overdue ? { background: 'rgba(220,38,38,0.12)', color: '#F87171' } : { background: s.bg, color: s.color }}
                >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: overdue ? '#DC2626' : s.color }} />
                    {overdue ? 'Quá hạn' : 'Đang duyệt'}
                </span>
                {dl && <span className="shrink-0 font-mono text-caption text-muted-foreground">⏱ {dl}</span>}
            </div>
            <h3 className="mt-1.5 break-words text-body-sm font-semibold text-foreground line-clamp-2">{task.title}</h3>
            <div className="mt-0.5 flex flex-wrap gap-x-2 text-caption text-muted-foreground">
                {task.clientLabel && <span className="truncate">{task.clientLabel}</span>}
                {task.assigneeLabel && <span>· {task.assigneeLabel}</span>}
                {!task.assigneeLabel && <span>· Chưa giao</span>}
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {/* Giao lại */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary/15 px-3 text-caption font-bold text-primary-accent transition-colors active:bg-primary/25">
                            <UserPlus className="h-3.5 w-3.5" /> Giao lại
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-[50vh] overflow-y-auto">
                        <DropdownMenuLabel>Giao cho</DropdownMenuLabel>
                        {users.map((u) => (
                            <DropdownMenuItem key={u.id} onClick={() => onAssign(u.id, `Đã giao "${trim(task.title)}" cho ${userLabel(u)}`)}>
                                {userLabel(u)}
                            </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onAssign('', `Đã trả "${trim(task.title)}" về kho`)}>Trả về kho đợi</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                {/* Đổi trạng thái */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white/5 px-3 text-caption font-bold text-zinc-200 transition-colors active:bg-white/10">
                            <ArrowLeftRight className="h-3.5 w-3.5" /> Trạng thái
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                        <DropdownMenuLabel>Chuyển sang</DropdownMenuLabel>
                        {STATUS_OPTS.map((st) => (
                            <DropdownMenuItem key={st} className={st === 'Đã hủy' ? 'text-red-400 focus:text-red-400' : ''} onClick={() => onStatus(st)}>
                                {st}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
                <DeferBtn onClick={onDefer} />
                <Link
                    href={`/${workspaceId}/task/${task.id}`}
                    className="ml-auto inline-flex h-10 items-center gap-0.5 rounded-full px-2 text-caption font-bold text-muted-foreground transition-colors active:bg-white/10"
                >
                    Mở <ChevronRight className="h-4 w-4" />
                </Link>
            </div>
        </CardShell>
    )
}

function RequestCard({
    req,
    onAccept,
    onReject,
    onDefer,
}: {
    req: ClientRequestDTO
    onAccept: () => void
    onReject: () => void
    onDefer: () => void
}) {
    const dl = fmtDate(req.desiredDeadline)
    return (
        <CardShell>
            <div className="flex items-start justify-between gap-2">
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-bold" style={{ background: 'rgba(6,182,212,0.12)', color: '#22D3EE' }}>
                    <Inbox className="h-3 w-3" /> Yêu cầu khách
                </span>
                {dl && <span className="shrink-0 font-mono text-caption text-muted-foreground">⏱ {dl}</span>}
            </div>
            <h3 className="mt-1.5 break-words text-body-sm font-semibold text-foreground line-clamp-2">{req.title}</h3>
            <div className="mt-0.5 flex flex-wrap gap-x-2 text-caption text-muted-foreground">
                {req.clientName && <span className="truncate">{req.clientName}</span>}
                {req.desiredType && <span>· {req.desiredType}</span>}
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={onAccept}
                    className="inline-flex h-10 items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 text-caption font-bold text-white transition-transform active:scale-95"
                >
                    <Check className="h-4 w-4" /> Chấp nhận
                </button>
                <button
                    type="button"
                    onClick={onReject}
                    className="inline-flex h-10 items-center gap-1.5 rounded-full bg-red-500/15 px-3.5 text-caption font-bold text-red-400 transition-colors active:bg-red-500/25"
                >
                    <X className="h-4 w-4" /> Từ chối
                </button>
                <DeferBtn onClick={onDefer} />
            </div>
        </CardShell>
    )
}
