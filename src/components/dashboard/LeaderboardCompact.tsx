// src/components/dashboard/LeaderboardCompact.tsx
// [P3 / M2.2 · FR-C3 · FR-C5 · FR-E5] Compact leaderboard for the Today-first home.
// - Podium ~140px: flex column (NO absolute labels — FR-C3.1), #1 56px / #2·#3 44px.
// - List 4–10, row 48px; sticky self-row "Bạn · #N".
// - Names via getDisplayName → never renders a raw `g_…` handle (FR-E5).
// - No "Làm mới dữ liệu" button; freshness shown as "Cập nhật N phút trước" (FR-C5.2).
// Server-renderable.

import Link from 'next/link'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getDisplayName } from '@/lib/display-name'

export type LeaderboardEntry = {
    id: string
    username: string
    taskCount: number
    avatarUrl?: string | null
}

function safeName(e: LeaderboardEntry, rank: number): string {
    return getDisplayName({ username: e.username }, { index: rank })
}

export default function LeaderboardCompact({
    entries,
    currentUserId,
    updatedLabel,
    detailHref,
}: {
    entries: LeaderboardEntry[]
    currentUserId: string
    updatedLabel?: string
    detailHref: string
}) {
    if (entries.length === 0) {
        return (
            <div className="glass-1 rounded-xl p-6 text-center">
                <p className="text-body-sm text-muted-foreground">Chưa có đủ dữ liệu xếp hạng.</p>
            </div>
        )
    }

    const top3 = entries.slice(0, 3)
    const rest = entries.slice(3)
    // Podium display order: 2nd (left), 1st (center), 3rd (right).
    const podium = [
        { e: top3[1], rank: 2, size: 'h-11 w-11', ring: 'ring-2 ring-[#4C1D95]/60' },
        { e: top3[0], rank: 1, size: 'h-14 w-14', ring: 'ring-2 ring-primary-accent' },
        { e: top3[2], rank: 3, size: 'h-11 w-11', ring: 'ring-2 ring-[#4C1D95]/60' },
    ].filter((p) => p.e)

    const selfIndex = entries.findIndex((e) => e.id === currentUserId)
    const self = selfIndex >= 0 ? entries[selfIndex] : null

    return (
        <div className="relative">
            <div className="mb-3 flex items-center justify-between">
                <h3 className="text-title font-semibold text-foreground">Xếp hạng tuần này</h3>
                {/* inline-flex + min-h-6: as a bare inline link this measured 93.5x22 on the mobile
                    dashboard — under the WCAG 2.2 SC 2.5.8 24px floor. The standard's "inline"
                    exception does not apply: this is a standalone action in a header row, not a
                    link inside a sentence. */}
                <Link href={detailHref} className="inline-flex min-h-6 items-center text-body-sm text-primary-accent">
                    Xem chi tiết →
                </Link>
            </div>

            {/* Podium — flex column, no absolute label (FR-C3.1) */}
            <div className="flex items-end justify-center gap-4">
                {podium.map(({ e, rank, size, ring }) => (
                    <div key={e!.id} className="flex min-w-0 flex-1 flex-col items-center">
                        <div className="relative mb-2">
                            <Avatar className={`${size} ${ring} border-2 border-surface-0`}>
                                <AvatarImage
                                    src={e!.avatarUrl || `https://avatar.vercel.sh/${e!.username}`}
                                    className="object-cover"
                                />
                                <AvatarFallback className="bg-gradient-to-br from-primary-accent to-primary text-body-sm font-bold text-white">
                                    {safeName(e!, rank)[0]}
                                </AvatarFallback>
                            </Avatar>
                            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-primary px-1.5 text-caption font-bold text-white">
                                {rank}
                            </span>
                        </div>
                        <span className="max-w-[120px] truncate text-body-sm font-semibold text-foreground">
                            {safeName(e!, rank)}
                        </span>
                        <span className="text-caption tabular-nums text-muted-foreground">{e!.taskCount} task</span>
                    </div>
                ))}
            </div>

            {/* List 4–10 */}
            {rest.length > 0 && (
                <div className="mt-4 space-y-1">
                    {rest.map((e, i) => {
                        const rank = i + 4
                        const isSelf = e.id === currentUserId
                        return (
                            <div
                                key={e.id}
                                className={`flex h-12 items-center gap-3 rounded-lg px-2 ${
                                    isSelf ? 'bg-primary/10' : ''
                                }`}
                            >
                                <span className="w-6 text-caption tabular-nums text-muted-foreground">{rank}</span>
                                <Avatar className="h-8 w-8 shrink-0">
                                    <AvatarImage
                                        src={e.avatarUrl || `https://avatar.vercel.sh/${e.username}`}
                                        className="object-cover"
                                    />
                                    <AvatarFallback className="bg-primary/20 text-caption text-primary-accent">
                                        {safeName(e, rank)[0]}
                                    </AvatarFallback>
                                </Avatar>
                                <span className="min-w-0 flex-1 truncate text-body-sm text-foreground">
                                    {safeName(e, rank)}
                                </span>
                                <span className="shrink-0 text-body-sm tabular-nums text-muted-foreground">
                                    {e.taskCount} task
                                </span>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Sticky self-row — only when the current user is in the ranked set */}
            {self && (
                <div className="sticky bottom-0 z-sticky mt-2 flex items-center gap-3 rounded-lg glass-2 px-3 py-2">
                    <span className="text-body-sm font-semibold text-primary-accent">
                        Bạn · #{selfIndex + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-body-sm text-foreground">{safeName(self, selfIndex + 1)}</span>
                    <span className="shrink-0 text-body-sm tabular-nums text-muted-foreground">{self.taskCount} task</span>
                </div>
            )}

            {updatedLabel && (
                <p className="mt-2 text-caption text-muted-foreground">{updatedLabel}</p>
            )}
        </div>
    )
}
