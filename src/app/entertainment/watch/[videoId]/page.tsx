// [Giải trí] Trang xem một phim — full-bleed, không có vỏ nào khác.
//
// Ba trạng thái: READY → trình phát; PROCESSING → màn chờ tự làm mới;
// FAILED → báo lỗi. KHÔNG ký token khi phim chưa READY (Mux sẽ 403 và người xem
// chỉ thấy một trình phát hỏng không rõ lý do).

import { cookies } from 'next/headers'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ReviewPipelineStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import { signMuxToken } from '@/lib/review/mux-jwt'
import { resolveEntSession } from '@/lib/ent/auth'
import EntCodeGate from '@/components/ent/EntCodeGate'
import EntPlayer from '@/components/ent/player/EntPlayer'
import EntProcessingScreen from '@/components/ent/EntProcessingScreen'

export const dynamic = 'force-dynamic'

export default async function WatchPage({ params }: { params: Promise<{ videoId: string }> }) {
    const session = await resolveEntSession(await cookies())
    if (!session) return <EntCodeGate />

    const { videoId } = await params
    const video = await prisma.entVideo.findUnique({
        where: { id: videoId },
        select: {
            id: true,
            title: true,
            pipelineStatus: true,
            errorMessage: true,
            muxPlaybackId: true,
            posterTime: true,
            subtitles: { select: { id: true, label: true, lang: true }, orderBy: { createdAt: 'asc' } },
        },
    })
    if (!video) notFound()

    if (video.pipelineStatus !== ReviewPipelineStatus.READY || !video.muxPlaybackId) {
        return (
            <EntProcessingScreen
                title={video.title}
                failed={video.pipelineStatus === ReviewPipelineStatus.FAILED}
                message={video.errorMessage}
            />
        )
    }

    const exp = Math.floor(Date.now() / 1000) + 6 * 60 * 60
    const time = video.posterTime != null ? `time=${video.posterTime}&` : ''
    const posterUrl = `https://image.mux.com/${video.muxPlaybackId}/thumbnail.webp?${time}width=1280&token=${signMuxToken(
        video.muxPlaybackId,
        't',
        exp,
    )}`

    return (
        <EntPlayer
            videoId={video.id}
            title={video.title}
            posterUrl={posterUrl}
            subtitles={video.subtitles.map((s) => ({ id: s.id, label: s.label, lang: s.lang }))}
        />
    )
}
