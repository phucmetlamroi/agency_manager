'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Clock, PlayCircle, CheckCircle2, AlertCircle, RotateCcw, Users, CalendarClock, ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { formatClientHierarchy } from '@/lib/client-hierarchy'
import PortalStatusBadge from './PortalStatusBadge'

type Task = {
    id: string
    title: string
    type: string
    status: string
    clientStatus: string
    deadline: Date | null
    client: { id: number; name: string; parent?: { name: string } | null } | null
    clientPath?: string | null
    productLink?: string | null
    notes_en?: string | null
    notes_vi?: string | null
}

type TaskGroup = {
    groupName: string
    tasks: Task[]
}

// ── Status visual config ──
const STATUS_CONFIG: Record<string, { icon: typeof Clock; color: string; accent: string; bg: string; border: string; glow: string }> = {
    'Completed': { icon: CheckCircle2, color: 'text-emerald-400', accent: 'bg-emerald-500', bg: 'bg-emerald-500/8', border: 'border-emerald-500/20', glow: 'shadow-emerald-500/10' },
    'Revising': { icon: RotateCcw, color: 'text-orange-400', accent: 'bg-orange-500', bg: 'bg-orange-500/8', border: 'border-orange-500/20', glow: 'shadow-orange-500/10' },
    'Action Required': { icon: AlertCircle, color: 'text-rose-400', accent: 'bg-rose-500', bg: 'bg-rose-500/8', border: 'border-rose-500/20', glow: 'shadow-rose-500/10' },
    'In Progress': { icon: PlayCircle, color: 'text-amber-400', accent: 'bg-amber-500', bg: 'bg-amber-500/8', border: 'border-amber-500/20', glow: 'shadow-amber-500/10' },
}
const DEFAULT_STATUS = { icon: Clock, color: 'text-zinc-500', accent: 'bg-zinc-500', bg: 'bg-zinc-500/8', border: 'border-zinc-500/20', glow: 'shadow-zinc-500/10' }

// ── Type badge config ──
const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
    'Short form': { label: 'SHORT', color: 'text-sky-400 bg-sky-500/10 border-sky-500/20' },
    'Long form': { label: 'LONG', color: 'text-violet-400 bg-violet-500/10 border-violet-500/20' },
    'Trial': { label: 'TRIAL', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
}

function deadlineInfo(deadline: Date | null): { text: string; color: string; urgent: boolean } {
    if (!deadline) return { text: '', color: 'text-zinc-600', urgent: false }
    const now = Date.now()
    const dl = new Date(deadline).getTime()
    const hoursLeft = (dl - now) / (1000 * 60 * 60)
    const daysLeft = Math.ceil(hoursLeft / 24)

    if (hoursLeft <= 0) return { text: 'Overdue', color: 'text-red-400', urgent: true }
    if (hoursLeft < 24) return { text: 'Due today', color: 'text-red-400', urgent: true }
    if (daysLeft <= 2) return { text: `${daysLeft}d left`, color: 'text-amber-400', urgent: true }
    if (daysLeft <= 7) return { text: `${daysLeft}d left`, color: 'text-zinc-400', urgent: false }
    return { text: `${daysLeft}d`, color: 'text-zinc-500', urgent: false }
}

function groupStatusSummary(tasks: Task[]) {
    const total = tasks.length
    const done = tasks.filter(t => t.clientStatus === 'Completed').length
    const inProgress = tasks.filter(t => t.clientStatus === 'In Progress' || t.clientStatus === 'Revising').length
    return { total, done, inProgress }
}

function GroupRow({ group, locale, workspaceId, defaultOpen }: { group: TaskGroup; locale: string; workspaceId: string; defaultOpen?: boolean }) {
    const [open, setOpen] = useState(defaultOpen ?? false)
    const t = useTranslations('TaskGroup')
    const { total, done, inProgress } = groupStatusSummary(group.tasks)
    const allDone = done === total
    const progressPct = total > 0 ? Math.round((done / total) * 100) : 0

    return (
        <div className="border border-white/[0.06] rounded-3xl overflow-hidden shadow-xl shadow-black/30 backdrop-blur-md">
            {/* Group header / accordion trigger */}
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center gap-4 px-6 py-4 bg-zinc-950/80 hover:bg-zinc-900/80 transition-colors text-left"
            >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/15 to-yellow-600/5 flex items-center justify-center border border-amber-500/20 shrink-0 shadow-lg shadow-amber-500/5">
                    <Users size={17} className="text-amber-400" />
                </div>

                <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold truncate">{group.groupName}</p>
                    <div className="flex items-center gap-3 mt-1">
                        <span className="text-zinc-500 text-xs">
                            {t('task_count', { count: total })}
                        </span>
                        <span className={`text-xs font-medium ${allDone ? 'text-emerald-400' : 'text-zinc-400'}`}>
                            {done} {t('completed_label')}
                        </span>
                        {inProgress > 0 && (
                            <span className="text-xs text-amber-400 font-medium">
                                {inProgress} {t('in_progress_label')}
                            </span>
                        )}
                    </div>
                </div>

                {/* Mini progress bar in header */}
                <div className="hidden sm:flex items-center gap-2.5 shrink-0">
                    <div className="w-20 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-700 ease-out ${allDone ? 'bg-emerald-500' : 'bg-amber-500'}`}
                            style={{ width: `${progressPct}%` }}
                        />
                    </div>
                    <span className="text-[10px] text-zinc-500 font-bold w-8 text-right">{progressPct}%</span>
                </div>

                <ChevronDown
                    size={18}
                    className={`text-zinc-500 transition-transform duration-300 shrink-0 ${open ? 'rotate-180' : ''}`}
                />
            </button>

            {/* Expanded task cards */}
            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                        className="overflow-hidden"
                    >
                        <div className="p-3 sm:p-4 space-y-2.5 bg-zinc-950/30">
                            {group.tasks.map((task, i) => {
                                const cfg = STATUS_CONFIG[task.clientStatus] || DEFAULT_STATUS
                                const Icon = cfg.icon
                                const dl = deadlineInfo(task.deadline)
                                const typeInfo = TYPE_CONFIG[task.type]

                                return (
                                    <motion.div
                                        key={task.id}
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.04, duration: 0.2 }}
                                    >
                                        <Link
                                            href={`/portal/${locale}/${workspaceId}/tasks/${task.id}`}
                                            className={`group/card relative flex items-center gap-4 px-4 sm:px-5 py-3.5 bg-zinc-900/40 hover:bg-zinc-900/70 border ${cfg.border} hover:border-opacity-50 rounded-2xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${cfg.glow}`}
                                        >
                                            {/* Left accent bar */}
                                            <div className={`absolute left-0 top-3 bottom-3 w-[3px] ${cfg.accent} rounded-full opacity-60 group-hover/card:opacity-100 transition-opacity`} />

                                            {/* Status icon */}
                                            <div className={`w-8 h-8 rounded-xl ${cfg.bg} flex items-center justify-center shrink-0 border ${cfg.border}`}>
                                                <Icon size={14} className={cfg.color} strokeWidth={2} />
                                            </div>

                                            {/* Content */}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm text-zinc-200 font-medium truncate group-hover/card:text-white transition-colors">
                                                    {task.title}
                                                </p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    {/* Status badge — holographic signal lamp */}
                                                    <PortalStatusBadge
                                                        status={task.clientStatus}
                                                        pulse={task.clientStatus === 'Action Required'}
                                                        size="compact"
                                                    />

                                                    {/* Type badge */}
                                                    {typeInfo && (
                                                        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${typeInfo.color}`}>
                                                            {typeInfo.label}
                                                        </span>
                                                    )}

                                                    {/* Deadline countdown */}
                                                    {dl.text && (
                                                        <span className={`flex items-center gap-1 text-[10px] font-semibold ${dl.color}`}>
                                                            <CalendarClock size={10} strokeWidth={2} />
                                                            {dl.text}
                                                            {dl.urgent && (
                                                                <span className="relative flex h-1.5 w-1.5 ml-0.5">
                                                                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${dl.color === 'text-red-400' ? 'bg-red-400' : 'bg-amber-400'}`} />
                                                                    <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${dl.color === 'text-red-400' ? 'bg-red-400' : 'bg-amber-400'}`} />
                                                                </span>
                                                            )}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Right side: arrow */}
                                            <div className="flex items-center gap-2 shrink-0">
                                                <ArrowUpRight
                                                    size={14}
                                                    className="text-zinc-600 group-hover/card:text-amber-400 transition-colors"
                                                    strokeWidth={2}
                                                />
                                            </div>
                                        </Link>
                                    </motion.div>
                                )
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

export default function TaskGroupAccordion({
    tasks,
    locale,
    workspaceId,
    rootClientName
}: {
    tasks: Task[]
    locale: string
    workspaceId: string
    rootClientName?: string
}) {
    const t = useTranslations('TaskGroup')
    const groupMap = new Map<string, Task[]>()

    for (const task of tasks) {
        const key = task.clientPath || formatClientHierarchy(task.client) || rootClientName || t('default_group_name')
        if (!groupMap.has(key)) groupMap.set(key, [])
        groupMap.get(key)!.push(task)
    }

    const groups: TaskGroup[] = Array.from(groupMap.entries()).map(([name, ts]) => ({
        groupName: name,
        tasks: ts
    }))

    if (groups.length === 0) {
        return (
            <div className="bg-zinc-950/60 backdrop-blur-xl border border-white/[0.06] rounded-3xl p-12 text-center text-zinc-500 shadow-xl shadow-black/30">
                {t('no_tasks')}
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {groups.map((group, i) => (
                <GroupRow
                    key={group.groupName}
                    group={group}
                    locale={locale}
                    workspaceId={workspaceId}
                    defaultOpen={i === 0}
                />
            ))}
        </div>
    )
}
