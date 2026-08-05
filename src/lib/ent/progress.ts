// [Giải trí] Diễn giải "phim đang ở đâu trong đường ống" thành câu người đọc hiểu.
//
// Lý do có tệp này: giao diện trước đây chỉ có MỘT vòng xoay và chữ "Đang chuyển
// mã" cho toàn bộ quãng từ lúc bấm xong tới lúc xem được. Người dùng không có
// cách nào phân biệt "đang chạy bình thường" với "kẹt cứng từ nãy" — mà hai thứ
// đó đòi hai hành động khác hẳn nhau.
//
// Đường ống thật có HAI chặng rất khác nhau, và gộp chúng lại là chỗ mất thông tin:
//   1. XẾP HÀNG — máy chủ đã nhận tệp, đang chờ tiến trình nền giao việc cho Mux.
//      Bình thường vài GIÂY. Quá vài phút nghĩa là việc không tới tay ai.
//   2. CHUYỂN MÃ — Mux đang kéo tệp về và encode. Phim dài thì hàng chục phút là
//      chuyện thường, nên ở chặng này KHÔNG được doạ người dùng quá sớm.
// Phân biệt hai chặng chỉ cần một câu hỏi: đã có muxAssetId chưa.
//
// Thuần tuý tính toán, không import Prisma — dùng được ở client component.

export type EntStage = 'uploading' | 'queued' | 'encoding' | 'ready' | 'failed'

/** Quá mốc này mà việc chưa tới tay Mux thì gần như chắc chắn là kẹt, không phải chậm. */
const QUEUE_STUCK_MS = 5 * 60_000
/** Mux kéo về + encode một phim dài có thể lâu; chỉ báo động khi đã quá xa mức hợp lý. */
const ENCODE_STUCK_MS = 2 * 60 * 60_000

export interface EntProgress {
    stage: EntStage
    /** Nhãn ngắn thay cho chữ "Đang chuyển mã" dùng chung trước đây. */
    label: string
    /** "3 phút" — luôn có khi phim còn đang chạy, để người dùng thấy nó NHÍCH. */
    elapsed: string | null
    /** Vượt ngưỡng hợp lý của chặng hiện tại. */
    stuck: boolean
    /** Câu giải thích + việc nên làm, chỉ có khi stuck. */
    hint: string | null
}

export function formatElapsed(ms: number): string {
    const m = Math.floor(Math.max(0, ms) / 60_000)
    if (m < 1) return 'vài giây'
    if (m < 60) return `${m} phút`
    const h = Math.floor(m / 60)
    return `${h} giờ ${m % 60} phút`
}

export function entProgress(v: {
    status: 'UPLOADING' | 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED'
    hasMuxAsset: boolean
    updatedAt: string
    errorMessage?: string | null
}): EntProgress {
    if (v.status === 'READY') return { stage: 'ready', label: 'Sẵn sàng', elapsed: null, stuck: false, hint: null }
    if (v.status === 'FAILED') {
        return {
            stage: 'failed',
            label: 'Lỗi',
            elapsed: null,
            stuck: true,
            hint: v.errorMessage ?? 'Xử lý thất bại. Bấm "Thử lại" để chạy lại từ tệp gốc.',
        }
    }
    // Đồng hồ máy người dùng có thể lệch máy chủ; kẹp về 0 chứ không hiện số âm.
    const ms = Math.max(0, Date.now() - new Date(v.updatedAt).getTime())
    const elapsed = formatElapsed(ms)

    if (v.status === 'UPLOADING') {
        return { stage: 'uploading', label: 'Đang tải lên', elapsed, stuck: false, hint: null }
    }
    // UPLOADED và PROCESSING-chưa-có-asset đều là "việc chưa tới tay Mux".
    if (!v.hasMuxAsset) {
        const stuck = ms > QUEUE_STUCK_MS
        return {
            stage: 'queued',
            label: 'Đang xếp hàng',
            elapsed,
            stuck,
            hint: stuck
                ? 'Đã quá lâu mà việc chưa tới được Mux — tiến trình nền nhiều khả năng không nhận được lệnh. Bấm "Thử lại".'
                : null,
        }
    }
    const stuck = ms > ENCODE_STUCK_MS
    return {
        stage: 'encoding',
        label: 'Mux đang chuyển mã',
        elapsed,
        stuck,
        hint: stuck ? 'Mux nhận việc đã quá 2 giờ mà chưa xong — nhiều khả năng đã kẹt.' : null,
    }
}
