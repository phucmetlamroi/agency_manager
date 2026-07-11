// src/components/dashboard/AgendaList.tsx
// [P3 / M2.2 · FR-C4] Deadline agenda grouped by day — replaces the useless month grid
// on mobile (f_0111, f_0117). Days with no deadline are NOT rendered (FR-C4.1). Each
// group carries an `id="agenda-<key>"` anchor so WeekStrip taps scroll here.
// Rows link to the full-screen task route (deep-link safe). Server-renderable.

import Link from 'next/link'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

export type AgendaItem = {
    id: string
    title: string
    /** Pre-formatted time, e.g. "18:00". */
    time: string
    /** Status dot color (hex from getStatusInfo). */
    statusColor: string
    /** Admin (team) agenda only: assignee for the 20px avatar. */
    assigneeName?: string
    assigneeAvatarUrl?: string | null
}

export type AgendaGroup = {
    /** Stable day key matching WeekStrip (e.g. "2026-07-12"). */
    key: string
    /** Group header label: "Hôm nay" / "Ngày mai" / "T4 09-07". */
    label: string
    items: AgendaItem[]
}

export default function AgendaList({
    groups,
    workspaceId,
}: {
    groups: AgendaGroup[]
    workspaceId: string
}) {
    return (
        <div>
            {groups.map((g) => (
                <div key={g.key} id={`agenda-${g.key}`} className="scroll-mt-20">
                    <p className="mt-4 mb-2 text-body-sm font-medium text-muted-foreground">{g.label}</p>
                    <div className="space-y-2">
                        {g.items.map((it) => (
                            <Link
                                key={it.id}
                                href={`/${workspaceId}/task/${it.id}`}
                                className="flex min-h-14 items-center gap-3 rounded-xl glass-1 px-3 active:scale-[0.99] transition-transform"
                            >
                                <span className="w-12 shrink-0 text-caption tabular-nums text-muted-foreground">
                                    {it.time}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-body-sm text-foreground">{it.title}</span>
                                {it.assigneeName && (
                                    <Avatar className="h-5 w-5 shrink-0">
                                        <AvatarImage
                                            src={it.assigneeAvatarUrl || `https://avatar.vercel.sh/${it.assigneeName}`}
                                            className="object-cover"
                                        />
                                        <AvatarFallback className="bg-primary/20 text-[9px] text-primary-accent">
                                            {it.assigneeName[0]}
                                        </AvatarFallback>
                                    </Avatar>
                                )}
                                <span
                                    className="h-2 w-2 shrink-0 rounded-full"
                                    style={{ backgroundColor: it.statusColor }}
                                />
                            </Link>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    )
}
