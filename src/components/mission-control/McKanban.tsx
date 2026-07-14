'use client'
// [Giao diện 2 · Mission Control · Kéo-thả kanban] Owner's 2026-07-14 review [05:07-06:53]:
// cards must drag freely between the 6 columns, and dropping into a column auto-sets the task
// to that column's ENTRY status (his exact rules):
//   • "Đã giao task"  → 'Nhận task'            (NOT 'Đang đợi giao' — that would move it to Kho chờ)
//   • "Đang làm"      → 'Đang thực hiện'
//   • "Duyệt nội bộ"  → 'Đã nộp video (nội bộ)'
//   • "Khách duyệt"   → 'Đã gửi video (khách)' (first status of the client-review phase)
//   • "Hoàn tất"      → 'Hoàn tất'             (NOT 'Quá hạn'/'Đã hủy')
//   • "Quá hạn"       → NOT droppable (overdue is derived from deadline by the system)
// These defaults apply ONLY to manual drags; automatic transitions keep their own logic.
//
// MONEY-SAFE: the drop calls the SAME vetted `updateTaskStatus` server action the admin status
// dropdown uses (canonical-status guard, workspace-ADMIN RBAC, deadline/pool/archive invariants,
// audit log, notifications). No status logic is re-implemented here — this is just a new trigger.
// Optimistic UI: card moves instantly; on server error it snaps back with a toast.
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
    DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
    useDraggable, useDroppable, type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core'
import type { McColumn, McTask } from './MissionControlBoard'
import { updateTaskStatus } from '@/actions/task-actions'
import { loadMcTaskDrawer } from '@/actions/mc-task-drawer-actions'
import McTaskDrawer, { type McTaskDetail } from './McTaskDrawer'
import { RevealGroup, RevealItem, HoverCard } from './motion-kit'

const card = 'rgba(24,24,27,0.60)'
const cardBorder = '1px solid rgba(255,255,255,0.06)'

function lighten(hex: string, amt: number): string {
    const h = hex.replace('#', '')
    if (h.length !== 6) return hex
    const mix = (c: number) => Math.round(c + (255 - c) * amt)
    const to2 = (n: number) => n.toString(16).padStart(2, '0')
    return `#${to2(mix(parseInt(h.slice(0, 2), 16)))}${to2(mix(parseInt(h.slice(2, 4), 16)))}${to2(mix(parseInt(h.slice(4, 6), 16)))}`
}

/* Card visual — identical markup to the previous server-rendered TaskCard. */
function CardBody({ t, dragging }: { t: McTask; dragging?: boolean }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, borderRadius: 12, background: card, backdropFilter: 'blur(12px)', border: t.danger ? '1px solid rgba(220,38,38,0.35)' : cardBorder, boxShadow: dragging ? '0 16px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(99,102,241,0.45)' : t.danger ? '0 0 20px rgba(220,38,38,0.12)' : undefined, padding: 10, cursor: 'grab' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#F4F4F5', lineHeight: 1.35 }}>{t.title}</span>
            <span style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: `${t.dot}1a`, color: lighten(t.dot, 0.4), border: `1px solid ${t.dot}4d`, whiteSpace: 'nowrap' }}>
                <span style={{ width: 5, height: 5, borderRadius: 999, background: t.dot }} />{t.statusLabel}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 20, height: 20, borderRadius: 999, background: t.avatar, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: '#fff', flexShrink: 0 }}>{t.initials}</span>
                <span style={{ fontSize: 11, color: '#D4D4D8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.assignee}</span>
                {t.rank && <span style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 9, fontWeight: 800, color: t.rankColor, border: `1px solid ${t.rankColor}66`, borderRadius: 4, padding: '0 4px', flexShrink: 0 }}>{t.rank}</span>}
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 10, fontWeight: t.meta.startsWith('Trễ') ? 700 : 400, color: t.meta.startsWith('Trễ') ? '#F87171' : '#A1A1AA', whiteSpace: 'nowrap' }}>{t.meta}</span>
            </div>
        </div>
    )
}

function DraggableCard({ t, colIdx, activeId, justDraggedRef, onOpen }: {
    t: McTask; colIdx: number; activeId: string | null
    justDraggedRef: React.MutableRefObject<boolean>
    onOpen: (taskId: string) => void
}) {
    const { attributes, listeners, setNodeRef } = useDraggable({ id: t.id, data: { task: t, from: colIdx } })
    const isActive = activeId === t.id
    return (
        <div
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            onClick={() => {
                // Plain click (no drag) → the task drawer OVERLAYS the real board (no navigation).
                if (justDraggedRef.current) return
                onOpen(t.id)
            }}
            style={{ opacity: isActive ? 0.3 : 1, touchAction: 'none', outline: 'none' }}
        >
            {/* HoverCard = same y:-4 hover lift the old server-rendered TaskCard had. */}
            <HoverCard><CardBody t={t} /></HoverCard>
        </div>
    )
}

function DroppableColumn({ col, idx, workspaceId, children }: {
    col: McColumn; idx: number; workspaceId: string; children: React.ReactNode
}) {
    const droppable = col.entryStatus != null
    // NOTE: the droppable stays ENABLED even for "Quá hạn" — otherwise dnd-kit reports over=null
    // on drop and the explanatory toast in onDragEnd could never fire. Visual highlight + the
    // actual status change are still gated on entryStatus != null.
    const { setNodeRef, isOver } = useDroppable({ id: `col-${idx}`, data: { idx } })
    const bg = col.accent === 'danger' ? 'rgba(220,38,38,0.03)' : col.accent === 'success' ? 'rgba(16,185,129,0.02)' : 'rgba(255,255,255,0.02)'
    const border = isOver && droppable
        ? `1px solid ${col.hue}99`
        : col.accent === 'danger' ? '1px solid rgba(220,38,38,0.18)' : col.accent === 'success' ? '1px solid rgba(16,185,129,0.15)' : '1px solid rgba(255,255,255,0.05)'
    return (
        <RevealItem style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, background: isOver && droppable ? `${col.hue}0d` : bg, border, borderRadius: 16, padding: 10, minWidth: 0, position: 'relative', overflow: 'hidden', transition: 'background 0.15s ease, border-color 0.15s ease' }}>
            <div ref={setNodeRef} style={{ position: 'absolute', inset: 0 }} />
            <div style={{ position: 'absolute', top: -40, right: -40, width: 120, height: 120, borderRadius: 999, background: `${col.hue}12`, filter: 'blur(28px)', pointerEvents: 'none' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, position: 'relative' }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: col.hue, boxShadow: `0 0 8px ${col.hue}99` }} />
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: col.accent === 'danger' ? '#FCA5A5' : '#D4D4D8', whiteSpace: 'nowrap' }}>{col.label}</span>
                <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 8px', borderRadius: 999, background: `${col.hue}1f`, color: lighten(col.hue, 0.35), border: `1px solid ${col.hue}4d` }}>{col.count}</span>
            </div>
            {children}
            {col.moreText && (
                <Link href={`/${workspaceId}/mc/board`} title="Mở bảng vận hành đầy đủ" style={{ position: 'relative', textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#818CF8', padding: 4, textDecoration: 'none' }}>
                    {col.moreText} →
                </Link>
            )}
        </RevealItem>
    )
}

export default function McKanban({ columns, workspaceId }: { columns: McColumn[]; workspaceId: string }) {
    const router = useRouter()
    const [cols, setCols] = useState<McColumn[]>(columns)
    const [activeTask, setActiveTask] = useState<McTask | null>(null)
    const justDraggedRef = useRef(false)
    // Re-sync from the server after router.refresh() delivers fresh columns.
    useEffect(() => { setCols(columns) }, [columns])

    // [Review 2026-07-14] In-place task drawer — floats over the REAL board (dimmed behind)
    // instead of navigating away; opens instantly with a shell + spinner while the action loads.
    const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null)
    const [drawerDetail, setDrawerDetail] = useState<McTaskDetail | null>(null)
    // Latest-request token: stale responses (rapid A→B clicks, or a close while loading)
    // are ignored instead of overwriting the drawer with the wrong task.
    const drawerReqRef = useRef<string | null>(null)
    const openDrawer = async (taskId: string) => {
        drawerReqRef.current = taskId
        setDrawerTaskId(taskId)
        setDrawerDetail(null)
        const res = await loadMcTaskDrawer(workspaceId, taskId)
        if (drawerReqRef.current !== taskId) return // closed or retargeted meanwhile
        if ('error' in res) {
            toast.error(res.error === 'FORBIDDEN' ? 'Không có quyền xem task này.' : res.error)
            drawerReqRef.current = null
            setDrawerTaskId(null)
            // Fallback to the deep-link route for transient errors only — FORBIDDEN would just
            // bounce off that page's redirect and yank the user away for nothing.
            if (res.error !== 'FORBIDDEN') router.push(`/${workspaceId}/mc/task/${taskId}`)
            return
        }
        setDrawerDetail(res.detail)
    }
    const closeDrawer = () => { drawerReqRef.current = null; setDrawerTaskId(null); setDrawerDetail(null) }
    // After a mutation inside the drawer (status change), silently re-fetch its data.
    const refetchDrawer = async () => {
        const taskId = drawerReqRef.current
        if (!taskId) return
        const res = await loadMcTaskDrawer(workspaceId, taskId)
        if (drawerReqRef.current !== taskId) return
        if (!('error' in res)) setDrawerDetail(res.detail)
    }
    // Esc while the LOADING shell is up (the mounted drawer handles Esc itself, menu-aware).
    useEffect(() => {
        if (!drawerTaskId || drawerDetail) return
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeDrawer() }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drawerTaskId, drawerDetail])

    // 8px movement threshold → plain clicks still open the task drawer.
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

    function onDragStart(e: DragStartEvent) {
        const t = (e.active.data.current as any)?.task as McTask | undefined
        setActiveTask(t ?? null)
        justDraggedRef.current = true
    }

    function endDrag() {
        setActiveTask(null)
        // Swallow the synthetic click that fires right after pointer-up ends a drag.
        setTimeout(() => { justDraggedRef.current = false }, 120)
    }

    async function onDragEnd(e: DragEndEvent) {
        const t = (e.active.data.current as any)?.task as McTask | undefined
        const from = (e.active.data.current as any)?.from as number | undefined
        const toIdx = (e.over?.data.current as any)?.idx as number | undefined
        endDrag()
        if (!t || from == null || toIdx == null || toIdx === from) return

        const target = cols[toIdx]
        const entryStatus = target?.entryStatus
        if (!entryStatus) {
            toast.info('"Quá hạn" do hệ thống tự đánh theo deadline — không kéo tay vào được.')
            return
        }
        if (t.status === entryStatus) return

        // Optimistic move: card leaves `from`, appears in `toIdx` restyled to the entry status.
        const prev = cols
        const movedCard: McTask = { ...t, status: entryStatus, statusLabel: entryStatus, dot: target.hue, danger: false }
        setCols(prev.map((c, i) => {
            if (i === from) return { ...c, count: Math.max(0, c.count - 1), tasks: c.tasks.filter((x) => x.id !== t.id) }
            if (i === toIdx) return { ...c, count: c.count + 1, tasks: [movedCard, ...c.tasks] }
            return c
        }))

        try {
            const result = await updateTaskStatus(t.id, entryStatus, workspaceId)
            if (result && 'error' in result && result.error) {
                setCols(prev)
                toast.error(`Không chuyển được: ${result.error}`)
                router.refresh() // re-sync — the snapshot may be staler than the server by now
                return
            }
            toast.success(`"${t.title}" → ${entryStatus}`)
            router.refresh()
        } catch {
            setCols(prev)
            toast.error('Không chuyển được trạng thái — thử lại.')
            router.refresh()
        }
    }

    return (
        <>
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={endDrag}>
            <RevealGroup style={{ flex: 1, display: 'flex', gap: 10, padding: '16px 24px 8px', minHeight: 0 }}>
                {cols.map((col, idx) => (
                    <DroppableColumn key={col.label} col={col} idx={idx} workspaceId={workspaceId}>
                        {col.tasks.length === 0 && <div style={{ position: 'relative', textAlign: 'center', fontSize: 11, color: '#52525B', padding: '10px 4px' }}>Trống</div>}
                        {col.tasks.map((t) => (
                            <div key={t.id} style={{ position: 'relative' }}>
                                <DraggableCard t={t} colIdx={idx} activeId={activeTask?.id ?? null} justDraggedRef={justDraggedRef} onOpen={openDrawer} />
                            </div>
                        ))}
                    </DroppableColumn>
                ))}
            </RevealGroup>
            <DragOverlay dropAnimation={{ duration: 180 }}>
                {activeTask ? <div style={{ width: 220 }}><CardBody t={activeTask} dragging /></div> : null}
            </DragOverlay>
        </DndContext>

        {/* In-place task drawer — the real board stays visible (dimmed) behind it. */}
        {drawerTaskId && (
            drawerDetail ? (
                <McTaskDrawer
                    detail={drawerDetail}
                    workspaceId={workspaceId}
                    fullEditHref={`/${workspaceId}/task/${drawerTaskId}`}
                    overlay
                    onClose={closeDrawer}
                    onChanged={refetchDrawer}
                />
            ) : (
                /* Instant open: dim + drawer shell + spinner while the server action loads. */
                <div style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
                    <button type="button" onClick={closeDrawer} aria-label="Đóng" style={{ position: 'absolute', inset: 0, border: 'none', cursor: 'pointer', padding: 0, background: 'rgba(3,3,4,0.66)', backdropFilter: 'blur(4px)' }} />
                    <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 780, maxWidth: '100%', background: 'rgba(10,10,10,0.94)', backdropFilter: 'blur(24px)', borderLeft: '1px solid rgba(255,255,255,0.10)', display: 'flex', flexDirection: 'column', gap: 16, padding: 24 }}>
                        <div style={{ height: 14, width: 140, borderRadius: 7, background: 'rgba(255,255,255,0.07)' }} />
                        <div style={{ height: 26, width: '70%', borderRadius: 8, background: 'rgba(255,255,255,0.09)' }} />
                        <div style={{ height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.04)' }} />
                        <div style={{ display: 'flex', gap: 16 }}>
                            <div style={{ flex: 1.35, aspectRatio: '16/9', borderRadius: 14, background: 'rgba(255,255,255,0.05)' }} />
                            <div style={{ flex: 1, height: 200, borderRadius: 14, background: 'rgba(255,255,255,0.04)' }} />
                        </div>
                        <span style={{ fontSize: 12, color: '#71717A' }}>Đang tải chi tiết task…</span>
                    </div>
                </div>
            )
        )}
        </>
    )
}
