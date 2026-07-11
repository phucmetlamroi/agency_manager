'use client'

// [Mobile P4.3 / M9 — FR-E7] Một dòng nhật ký hoạt động (mobile). Câu đã humanize hoá:
//  • Chủ ngữ = actor bôi đậm qua getDisplayName (KHÔNG bao giờ handle `g_…` thô).
//  • Vị ngữ = humanizeLogEvent(log).sentence (không nhúng actor).
//  • Thời gian tương đối ("2 giờ trước"; >48h → dd-MM HH:mm).
//  • Nút "Chi tiết" bung khối mono chứa event-key + entity id + payload — nơi DUY NHẤT
//    lộ UUID/chuỗi kỹ thuật thô (FR-E7.1), chọn/copy được, KHÔNG điều hướng.
//  • Chạm vào CÂU (nếu log trỏ 1 task) → link `/{ws}/task/{id}`; nút "Chi tiết" thì không.
import { useState } from 'react'
import Link from 'next/link'
import { User } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getDisplayName } from '@/lib/display-name'
import {
    humanizeLogEvent,
    actorFallbackLabel,
} from '@/lib/activity-log'
import type { AuditLogEntry } from '@/actions/audit-actions'

/* ─── thời gian tương đối (Asia/Ho_Chi_Minh cho mốc tuyệt đối) ─── */

function vnAbsolute(iso: string): string {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Ho_Chi_Minh',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(new Date(iso))
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
    return `${get('day')}-${get('month')} ${get('hour')}:${get('minute')}`
}

function relativeTime(iso: string): string {
    const then = new Date(iso).getTime()
    const diffMs = Date.now() - then
    if (!Number.isFinite(diffMs)) return vnAbsolute(iso)
    const sec = Math.floor(diffMs / 1000)
    if (sec < 45) return 'Vừa xong'
    const min = Math.floor(sec / 60)
    if (min < 60) return `${min} phút trước`
    const hrs = Math.floor(min / 60)
    if (hrs < 48) return `${hrs} giờ trước`
    return vnAbsolute(iso) // >48h → mốc tuyệt đối dd-MM HH:mm
}

/* ─── khối "Chi tiết": nơi duy nhất chứa key thô + UUID + payload ─── */

function DetailBlock({ log }: { log: AuditLogEntry }) {
    const lines: string[] = []
    lines.push(`event: ${log.action}`)
    lines.push(`target: ${log.targetType}${log.targetId ? ` · ${log.targetId}` : ''}`)
    if (log.beforeData != null) lines.push(`before: ${JSON.stringify(log.beforeData)}`)
    if (log.afterData != null) lines.push(`after: ${JSON.stringify(log.afterData)}`)
    if (log.ipAddress) lines.push(`ip: ${log.ipAddress}`)
    if (log.userAgent) lines.push(`ua: ${log.userAgent}`)

    return (
        <div className="mt-2 rounded-lg bg-black/40 p-2 font-mono text-caption text-zinc-400 break-all whitespace-pre-wrap">
            {lines.join('\n')}
        </div>
    )
}

/* ─── component ─── */

export default function LogRow({
    log,
    workspaceId,
}: {
    log: AuditLogEntry
    workspaceId: string
}) {
    const [showDetail, setShowDetail] = useState(false)

    const { sentence, entityHref } = humanizeLogEvent(log, workspaceId)

    // Chủ ngữ: actor thật (getDisplayName lọc handle g_…) hoặc nhãn fallback theo loại event.
    const actorName = getDisplayName(log.actor, {
        fallback: log.actor ? undefined : actorFallbackLabel(log.action),
    })
    const initial = actorName.charAt(0).toUpperCase()

    // Câu = actor bôi đậm + vị ngữ zinc-400. Bọc Link khi log trỏ 1 task giải được.
    const sentenceInner = (
        <>
            <span className="font-medium text-foreground">{actorName}</span>{' '}
            <span className="text-zinc-400">{sentence}</span>
        </>
    )

    return (
        <div className="flex gap-3 px-3 py-3 min-h-14">
            <Avatar className="h-8 w-8 shrink-0">
                <AvatarImage src={log.actor?.avatarUrl ?? undefined} alt="" />
                <AvatarFallback className="bg-zinc-700 text-caption text-zinc-300">
                    {log.actor ? initial : <User className="h-4 w-4 text-zinc-400" aria-hidden />}
                </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
                {entityHref ? (
                    <Link
                        href={entityHref}
                        className="block text-body-sm leading-relaxed break-words hover:underline focus-visible:underline"
                    >
                        {sentenceInner}
                    </Link>
                ) : (
                    <p className="text-body-sm leading-relaxed break-words">{sentenceInner}</p>
                )}

                {/* meta: thời gian tương đối + "Chi tiết" (tap target ≥44px) */}
                <div className="mt-0.5 flex items-center gap-2">
                    <time
                        dateTime={log.createdAt}
                        suppressHydrationWarning
                        className="text-caption text-muted-foreground"
                    >
                        {relativeTime(log.createdAt)}
                    </time>
                    <span aria-hidden className="text-caption text-muted-foreground">
                        ·
                    </span>
                    <button
                        type="button"
                        onClick={() => setShowDetail((v) => !v)}
                        aria-expanded={showDetail}
                        className="-my-2 inline-flex min-h-[44px] items-center px-1 text-caption text-primary-accent transition-opacity active:opacity-70"
                    >
                        {showDetail ? 'Ẩn chi tiết' : 'Chi tiết'}
                    </button>
                </div>

                {showDetail && <DetailBlock log={log} />}
            </div>
        </div>
    )
}
