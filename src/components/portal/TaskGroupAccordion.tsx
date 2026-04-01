'use client'

import { useState } from 'react'
import { ChevronDown, Clock, PlayCircle, CheckCircle2, AlertCircle, RotateCcw, Users } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { formatClientHierarchy } from '@/lib/client-hierarchy'

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

function StatusIcon({ status }: { status: string }) {
    if (status === 'Completed') return <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
    if (status === 'Revising') return <RotateCcw size={15} className="text-orange-400 shrink-0" />
    if (status === 'Action Required') return <AlertCircle size={15} className="text-rose-400 shrink-0" />
    if (status === 'In Progress') return <PlayCircle size={15} className="text-amber-400 shrink-0" />
    return <Clock size={15} className="text-zinc-500 shrink-0" />
}

function statusColorBadge(status: string) {
    if (status === 'Completed') return 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-md'
    if (status === 'Revising') return 'bg-amber-500/10 border border-amber-500/20 text-amber-500 px-2 py-0.5 rounded-md'
    if (status === 'Action Required') return 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 px-2 py-0.5 rounded-md'
    if (status === 'In Progress') return 'bg-zinc-500/10 border border-zinc-500/20 text-zinc-300 px-2 py-0.5 rounded-md'
    return 'bg-zinc-800/50 border border-zinc-700/50 text-zinc-400 px-2 py-0.5 rounded-md'
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

    return (
        <div className="border border-yellow-500/10 rounded-3xl overflow-hidden shadow-lg shadow-black/20 backdrop-blur-md">
            {/* Group header / accordion trigger */}
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center gap-4 px-6 py-4 bg-zinc-950/80 hover:bg-zinc-900 transition-colors text-left"
            >
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-yellow-500/10 to-amber-500/5 flex items-center justify-center border border-yellow-500/20 shrink-0">
                    <Users size={16} className="text-yellow-500" />
                </div>

                <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate">{group.groupName}</p>
                    <p className="text-zinc-500 text-xs">
                        {t('task_count', { count: total })} &bull;{' '}
                        <span className={allDone ? 'text-yellow-500' : 'text-zinc-400'}>
                            {done} {t('completed_label')}
                        </span>
                        {inProgress > 0 && <span className="text-amber-500"> &bull; {inProgress} {t('in_progress_label')}</span>}
                    </p>
                </div>

                <ChevronDown
                    size={18}
                    className={`text-zinc-500 transition-transform duration-300 shrink-0 ${open ? 'rotate-180' : ''}`}
                />
            </button>

            {/* Expanded task list */}
            {open && (
                <div className="divide-y divide-zinc-800/50">
                    {group.tasks.map(task => (
                        <div key={task.id} className="flex flex-col px-6 py-4 bg-zinc-950/40 hover:bg-zinc-900/60 transition-colors group">
                            <div className="flex items-center gap-4">
                                <StatusIcon status={task.clientStatus} />

                                <div className="flex-1 min-w-0">
                                    <Link
                                        href={`/portal/${locale}/${workspaceId}/tasks/${task.id}`}
                                        className="block truncate text-sm text-zinc-300 font-medium group-hover:text-yellow-500 transition-colors"
                                    >
                                        {task.title}
                                    </Link>
                                </div>

                                <div className="flex items-center gap-4">
                                    <span className={`text-[10px] font-bold uppercase tracking-tight shrink-0 ${statusColorBadge(task.clientStatus)}`}>
                                        {task.clientStatus}
                                    </span>

                                    <span className="hidden">
                                        {task.deadline ? new Date(task.deadline).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-US') : '—'}
                                    </span>

                                    <Link
                                        href={`/portal/${locale}/${workspaceId}/tasks/${task.id}`}
                                        className="text-[10px] font-bold uppercase text-yellow-600 hover:text-yellow-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        {t('details')} →
                                    </Link>
                                </div>
                            </div>

                        </div>
                    ))}
                </div>
            )}
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
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-12 text-center text-zinc-500">
                {t('no_tasks')}
            </div>
        )
    }

    return (
        <div className="space-y-3">
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
