'use client'

// [Giải trí] Lớp vẽ phụ đề của riêng trình phát.
//
// VÌ SAO KHÔNG DÙNG ::cue CỦA TRÌNH DUYỆT:
//   1. Cỡ chữ. Phải bám theo CHIỀU CAO KHUNG HÌNH. Phim 2.39:1 xem trên màn
//      16:9 có hai dải đen rất dày — lấy chiều cao cửa sổ mà tính thì phụ đề
//      to vống lên và rơi xuống dải đen. ::cue không biết gì về khung hình.
//   2. Safari trên iOS bỏ qua gần hết khai báo ::cue, dùng cài đặt phụ đề của
//      hệ điều hành. Người xem sẽ thấy một kiểu chữ khác hẳn máy khác.
//   3. Mỗi trình duyệt tự chèn font-size nội tuyến vào cue, đè lên CSS mình
//      viết — nút chỉnh cỡ sẽ lúc ăn lúc không.
// Tự vẽ thì cả ba vấn đề biến mất, và giao diện giống nhau trên mọi máy.
//
// AN TOÀN: nội dung cue đi từ tệp .srt người dùng tải lên. KHÔNG bao giờ ghép
// chuỗi vào innerHTML. Dùng cue.getCueAsHTML() — chính trình duyệt dựng cây DOM
// theo ngữ pháp WebVTT (chỉ ra được <i> <b> <u> <ruby> <span>, không thẻ script,
// không thuộc tính sự kiện). Máy nào thiếu hàm đó thì hạ xuống textContent.

import { useCallback, useEffect, useRef, useState } from 'react'
import { SUBTITLE_FONT_STACK, SUBTITLE_LINE_HEIGHT, SUBTITLE_TEXT_SHADOW } from './subtitle-style'

/** Khoảng chừa dưới đáy khung hình, theo tỉ lệ chiều cao khung hình. */
const BOTTOM_GAP_RATIO = 0.075
/** Chiều cao thanh điều khiển; phụ đề phải nhảy lên khỏi nó khi thanh hiện ra. */
const CONTROLS_SAFE_PX = 96
/** Cửa sổ nhỏ xíu vẫn phải đọc được. */
const MIN_FONT_PX = 12

interface Box {
    /** Toạ độ KHUNG HÌNH THẬT bên trong thẻ video (object-contain ⇒ có viền đen). */
    left: number
    width: number
    height: number
    /** Khoảng từ đáy khung hình xuống đáy thẻ video — phần dải đen dưới. */
    gapBelow: number
}

export default function EntSubtitleLayer({
    videoRef,
    activeSubtitleId,
    sizePct,
    lifted,
}: {
    videoRef: React.RefObject<HTMLVideoElement | null>
    /** Đổi khi người xem chọn phụ đề khác — phải bám lại track mới. */
    activeSubtitleId: string | null
    sizePct: number
    /** Thanh điều khiển đang hiện ⇒ nâng phụ đề lên cho khỏi bị che. */
    lifted: boolean
}) {
    const boxRef = useRef<HTMLDivElement>(null)
    const [rect, setRect] = useState<Box | null>(null)

    // ── đo khung hình thật ──
    const measure = useCallback(() => {
        const v = videoRef.current
        if (!v) return
        const cw = v.clientWidth
        const ch = v.clientHeight
        if (!cw || !ch) return
        const vw = v.videoWidth
        const vh = v.videoHeight
        // Chưa có metadata ⇒ tạm coi khung hình lấp đầy thẻ. Đo lại khi có.
        if (!vw || !vh) {
            setRect({ left: 0, width: cw, height: ch, gapBelow: 0 })
            return
        }
        const scale = Math.min(cw / vw, ch / vh)
        const w = vw * scale
        const h = vh * scale
        setRect({ left: (cw - w) / 2, width: w, height: h, gapBelow: (ch - h) / 2 })
    }, [videoRef])

    useEffect(() => {
        const v = videoRef.current
        if (!v) return
        measure()
        // ResizeObserver bắt cả đổi cỡ cửa sổ lẫn vào/ra toàn màn hình, kể cả
        // khi không có sự kiện resize nào của window (bố cục flex đổi).
        const ro = new ResizeObserver(measure)
        ro.observe(v)
        v.addEventListener('loadedmetadata', measure)
        v.addEventListener('resize', measure)
        document.addEventListener('fullscreenchange', measure)
        return () => {
            ro.disconnect()
            v.removeEventListener('loadedmetadata', measure)
            v.removeEventListener('resize', measure)
            document.removeEventListener('fullscreenchange', measure)
        }
    }, [measure, videoRef])

    // ── bám track đang bật và vẽ cue ──
    const paint = useCallback((track: TextTrack | null) => {
        const box = boxRef.current
        if (!box) return
        box.replaceChildren()
        const cues = track?.activeCues
        if (!cues || cues.length === 0) return
        for (let i = 0; i < cues.length; i++) {
            const cue = cues[i] as VTTCue
            const line = document.createElement('div')
            if (typeof cue.getCueAsHTML === 'function') line.append(cue.getCueAsHTML())
            else line.textContent = cue.text
            box.append(line)
        }
    }, [])

    useEffect(() => {
        const v = videoRef.current
        if (!v) return

        let bound: TextTrack | null = null
        const onCueChange = () => paint(bound)

        // Track đang bật là track DUY NHẤT ở chế độ 'hidden' — EntPlayer đặt mọi
        // track còn lại về 'disabled'. 'hidden' vẫn nạp và chạy cue, chỉ không
        // để trình duyệt tự vẽ; đúng thứ ta cần khi tự vẽ lấy.
        const bind = () => {
            const next =
                Array.from(v.textTracks).find(
                    (t) => (t.kind === 'subtitles' || t.kind === 'captions') && t.mode === 'hidden',
                ) ?? null
            if (next === bound) return
            bound?.removeEventListener('cuechange', onCueChange)
            bound = next
            bound?.addEventListener('cuechange', onCueChange)
            paint(bound)
        }

        bind()
        // Track nạp bất đồng bộ (hls.js chèn muộn), và mode do effect khác đặt
        // nên có thể chưa kịp lúc này ⇒ dò lại vài nhịp rồi thôi.
        const probe = setInterval(bind, 250)
        const stop = setTimeout(() => clearInterval(probe), 10_000)
        // Tua xong activeCues đổi mà không phải lúc nào cũng có cuechange.
        v.addEventListener('seeked', onCueChange)
        v.textTracks.addEventListener?.('addtrack', bind)

        return () => {
            clearInterval(probe)
            clearTimeout(stop)
            bound?.removeEventListener('cuechange', onCueChange)
            v.removeEventListener('seeked', onCueChange)
            v.textTracks.removeEventListener?.('addtrack', bind)
        }
    }, [paint, videoRef, activeSubtitleId])

    // Tắt phụ đề thì dọn sạch ngay, không đợi cue kế tiếp.
    useEffect(() => {
        if (!activeSubtitleId) boxRef.current?.replaceChildren()
    }, [activeSubtitleId])

    if (!rect || !activeSubtitleId) return null

    const fontPx = Math.max(MIN_FONT_PX, rect.height * sizePct)
    const base = rect.gapBelow + rect.height * BOTTOM_GAP_RATIO
    const bottom = lifted ? Math.max(base, CONTROLS_SAFE_PX) : base

    return (
        <div
            ref={boxRef}
            aria-live="off"
            className="pointer-events-none absolute z-10 text-center"
            style={{
                left: rect.left,
                width: rect.width,
                bottom,
                transition: 'bottom 200ms ease',
                paddingInline: '5%',
                fontFamily: SUBTITLE_FONT_STACK,
                fontSize: `${fontPx}px`,
                lineHeight: SUBTITLE_LINE_HEIGHT,
                // VLC để chữ ở nét thường (freetype-bold mặc định tắt) — sức nặng
                // thị giác đến từ viền đen, không từ độ đậm.
                fontWeight: 400,
                color: '#fff',
                textShadow: SUBTITLE_TEXT_SHADOW,
                // Ép khử răng cưa THANG XÁM. Mặc định trên Windows là kiểu
                // subpixel (mượn ba ô màu con của điểm ảnh), chữ trắng mảnh nằm
                // trên nền sáng sẽ hiện viền ám đỏ/lam ở mép — nhìn thấy rõ khi
                // dựng bản thử. Đẩy lớp này thành tầng hợp thành riêng là trình
                // duyệt tự chuyển sang thang xám, và cũng đỡ phải vẽ lại cả
                // khung khi cue đổi liên tục.
                WebkitFontSmoothing: 'antialiased',
                MozOsxFontSmoothing: 'grayscale',
                transform: 'translateZ(0)',
                // freetype-background-opacity 0 ⇒ KHÔNG hộp nền.
                background: 'none',
                // Xuống dòng theo đúng chỗ tệp .srt ngắt, và không cắt chữ giữa từ.
                whiteSpace: 'pre-wrap',
                overflowWrap: 'break-word',
                textWrap: 'balance',
            }}
        />
    )
}
