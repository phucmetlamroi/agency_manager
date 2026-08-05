'use client'

// [Giải trí] Chỉnh phụ đề khớp video — dịch tới/lui theo giây.
//
// VÌ SAO CẦN: tệp .srt tải từ mạng rất hay được canh cho MỘT bản phim cụ thể
// (bản có đoạn giới thiệu hãng, bản chiếu rạp, bản 25fps vs 23,976fps…). Đưa
// đúng tệp đó vào một bản phim khác là lời thoại lệch vài giây — xem không nổi.
// Không có cách chỉnh thì người dùng phải bỏ tệp đi tìm tệp khác.
//
// Cách làm: sửa THẲNG mốc thời gian của cue trong bộ nhớ trình duyệt, không đụng
// tệp VTT trên máy chủ. Nhờ vậy:
//   • chỉnh tới đâu thấy ngay tới đó, không phải tải lại phim
//   • mỗi người xem có mức lệch riêng (bản phim của họ có thể khác)
//   • lưu trong localStorage nên lần sau mở lại vẫn đúng
//
// Mốc gốc được chụp lại lần đầu nhìn thấy cue, rồi mọi lần chỉnh đều tính TỪ
// MỐC GỐC — cộng dồn delta sẽ trôi dần sau vài chục lần bấm.

import { useCallback, useEffect, useRef, useState } from 'react'

const KEY = (videoId: string) => `ent:suboffset:${videoId}`
/** Bấm một nhát dịch nửa giây — đủ nhỏ để canh chính xác, đủ lớn để không phải bấm mãi. */
export const SUB_OFFSET_STEP_SEC = 0.5
const MAX_OFFSET_SEC = 120

export interface SubtitleSync {
    /** Độ lệch đang áp dụng, tính bằng giây. Dương = phụ đề hiện MUỘN hơn. */
    offsetSec: number
    nudge: (deltaSec: number) => void
    reset: () => void
}

export function useSubtitleSync(opts: {
    videoRef: React.RefObject<HTMLVideoElement | null>
    videoId: string
    /** Đổi khi người xem chọn phụ đề khác — phải chụp lại mốc gốc. */
    activeSubtitleId: string | null
}): SubtitleSync {
    const { videoRef, videoId, activeSubtitleId } = opts
    const [offsetSec, setOffsetSec] = useState(0)
    // Mốc gốc của từng cue, theo từng track. Khoá là chỉ số cue trong track.
    const baselineRef = useRef<Map<TextTrack, Array<[number, number]>>>(new Map())

    // Nạp mức lệch đã lưu cho phim này.
    useEffect(() => {
        try {
            const saved = Number(localStorage.getItem(KEY(videoId)) ?? '')
            if (Number.isFinite(saved) && saved !== 0) setOffsetSec(saved)
        } catch {
            /* localStorage bị chặn */
        }
    }, [videoId])

    const apply = useCallback(
        (sec: number) => {
            const v = videoRef.current
            if (!v) return
            for (const track of Array.from(v.textTracks)) {
                if (track.kind !== 'subtitles' && track.kind !== 'captions') continue
                const cues = track.cues
                // cues chỉ có sau khi trình duyệt tải xong tệp VTT (mode ≠ 'disabled').
                if (!cues || cues.length === 0) continue

                let base = baselineRef.current.get(track)
                if (!base || base.length !== cues.length) {
                    base = Array.from({ length: cues.length }, (_v, i) => {
                        const c = cues[i] as VTTCue
                        return [c.startTime, c.endTime] as [number, number]
                    })
                    baselineRef.current.set(track, base)
                }
                for (let i = 0; i < cues.length; i++) {
                    const c = cues[i] as VTTCue
                    const [s, e] = base[i]
                    // Không để mốc âm — trình duyệt bỏ qua cue có startTime < 0.
                    c.startTime = Math.max(0, s + sec)
                    c.endTime = Math.max(0.001, e + sec)
                }
            }
        },
        [videoRef],
    )

    // Áp lại mỗi khi mức lệch đổi, hoặc khi người xem đổi sang phụ đề khác.
    // Cue tải bất đồng bộ nên thử lại vài nhịp cho tới khi thấy cue.
    useEffect(() => {
        baselineRef.current = new Map()
        let tries = 0
        const id = setInterval(() => {
            apply(offsetSec)
            tries++
            const v = videoRef.current
            const ready = v && Array.from(v.textTracks).some((t) => (t.cues?.length ?? 0) > 0)
            if (ready || tries > 40) clearInterval(id)
        }, 250)
        apply(offsetSec)
        return () => clearInterval(id)
    }, [apply, offsetSec, activeSubtitleId, videoRef])

    const persist = useCallback(
        (sec: number) => {
            try {
                if (sec === 0) localStorage.removeItem(KEY(videoId))
                else localStorage.setItem(KEY(videoId), String(sec))
            } catch {
                /* bỏ qua */
            }
        },
        [videoId],
    )

    const nudge = useCallback(
        (delta: number) => {
            setOffsetSec((prev) => {
                const next = Math.round(Math.min(MAX_OFFSET_SEC, Math.max(-MAX_OFFSET_SEC, prev + delta)) * 100) / 100
                persist(next)
                return next
            })
        },
        [persist],
    )

    const reset = useCallback(() => {
        setOffsetSec(0)
        persist(0)
    }, [persist])

    return { offsetSec, nudge, reset }
}
