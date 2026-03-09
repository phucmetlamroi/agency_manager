'use client'

import { useState } from 'react'
import { ChevronDown, Clock, PlayCircle, CheckCircle2, AlertCircle, RotateCcw, Users } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

type Task = {
    id: string
    title: string
    type: string
    status: string
    clientStatus: string
    deadline: Date | null
    client: { id: number; name: string } | null
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

function statusColor(status: string) {
    if (status === 'Completed') return 'text-emerald-400'
    if (status === 'Revising') return 'text-orange-400'
    if (status === 'Action Required') return 'text-rose-400'
    if (status === 'In Progress') return 'text-amber-400'
    return 'text-zinc-500'
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
        <div className="border border-zinc-800/70 rounded-2xl overflow-hidden">
            {/* Group header / accordion trigger */}
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center gap-4 px-6 py-4 bg-zinc-900/60 hover:bg-zinc-900/90 transition-colors text-left"
            >
                <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0">
                    <Users size={16} className="text-indigo-400" />
                </div>

                <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold truncate">{group.groupName}</p>
                    <p className="text-zinc-500 text-xs">
                        {t('task_count', { count: total })} &bull;{' '}
                        <span className={allDone ? 'text-emerald-400' : 'text-zinc-400'}>
                            {done} {t('completed_label')}
                        </span>
                        {inProgress > 0 && <span className="text-amber-400"> &bull; {inProgress} {t('in_progress_label')}</span>}
                    </p>
                </div>

                {/* Progress bar */}
                <div className="hidden sm:block w-24 shrink-0">
                    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-indigo-500 rounded-full transition-all"
                            style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
                        />
                    </div>
                    <p className="text-zinc-600 text-xs mt-1 text-right">{total > 0 ? Math.round((done / total) * 100) : 0}%</p>
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
                        <div key={task.id} className="flex items-center gap-4 px-6 py-3.5 bg-zinc-950/40 hover:bg-zinc-900/30 transition-colors group">
                            <StatusIcon status={task.clientStatus} />

                            <div className="flex-1 min-w-0">
                                <Link
                                    href={`/portal/${locale}/${workspaceId}/tasks/${task.id}`}
                                    className="block truncate text-sm text-zinc-200 font-medium group-hover:text-white transition-colors"
                                >
                                    {task.title}
                                </Link>
                                <p className="text-zinc-600 text-xs">{task.type}</p>
                            </div>

                            <span className={`text-xs shrink-0 ${statusColor(task.clientStatus)}`}>
                                {task.clientStatus}
                            </span>

                            <span className="text-zinc-600 text-xs shrink-0 hidden sm:block">
                                {task.deadline ? new Date(task.deadline).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-US') : '—'}
                            </span>

                            <Link
                                href={`/portal/${locale}/${workspaceId}/tasks/${task.id}`}
                                className="text-xs text-indigo-400 hover:text-indigo-300 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                {t('details')} →
                            </Link>
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
    // Group tasks by client name; tasks with no client go under rootClientName or "Khác"
    const t = useTranslations('TaskGroup')
    const groupMap = new Map<string, Task[]>()

    for (const task of tasks) {
        const key = task.client?.name ?? rootClientName ?? t('default_group_name')
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
                    defaultOpen={groups.length === 1 || i === 0}
                />
            ))}
        </div>
    )
}
