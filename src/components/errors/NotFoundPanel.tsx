'use client'

/**
 * [kiểm toán 2026-07 · S2-3] Thân trang 404 dùng chung.
 *
 * Trước đây repo KHÔNG có src/app/not-found.tsx, nên Next dựng trang mặc định của nó:
 * chữ Anh ("This page could not be found"), nền trắng, không một lối ra nào. Người dùng
 * gõ nhầm địa chỉ là rơi thẳng ra khỏi ứng dụng.
 *
 * Câu chữ theo §11 của đặc tả: KHÔNG tiết lộ tài nguyên có tồn tại hay không. "Không tìm
 * thấy" và "không có quyền xem" phải nói chung một câu — nếu tách ra, chính trang 404 trở
 * thành công cụ dò xem ID nào có thật.
 *
 * Cố tình KHÔNG có nút "Tìm kiếm" mà đặc tả §5.2 gợi ý: hệ thống không có route tìm kiếm
 * toàn cục (⌘K chỉ sống bên trong vỏ ứng dụng đã đăng nhập). Thêm nút dẫn tới chỗ không
 * tồn tại chỉ là đẻ thêm một ngõ cụt nữa.
 */
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Home } from 'lucide-react'

export function NotFoundPanel({
    homeHref,
    homeLabel,
    /** true khi trang này nằm TRONG vỏ ứng dụng (đã có sidebar) → bỏ nền toàn màn hình. */
    inShell = false,
}: {
    homeHref: string
    homeLabel: string
    inShell?: boolean
}) {
    const router = useRouter()

    const card = (
        <div
            className="w-full max-w-md rounded-3xl p-7"
            style={{
                background: 'rgba(10,10,10,0.6)',
                backdropFilter: 'blur(24px)',
                border: '1px solid rgba(139,92,246,0.20)',
            }}
        >
            <div
                className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center text-[22px] font-extrabold text-white"
                style={{
                    background: 'rgba(139,92,246,0.14)',
                    border: '1px solid rgba(139,92,246,0.30)',
                }}
            >
                404
            </div>

            <h1 className="text-[18px] font-extrabold text-white text-center mb-2">
                Không tìm thấy trang này
            </h1>
            <p className="text-[13px] text-center leading-relaxed mb-5" style={{ color: '#A1A1AA' }}>
                Đường dẫn có thể đã thay đổi, hoặc bạn không có quyền xem nội dung này.
            </p>

            <div className="flex flex-col gap-2.5">
                <button
                    type="button"
                    onClick={() => router.back()}
                    className="flex w-full items-center justify-center gap-2 rounded-full py-3 text-[14px] font-bold text-white"
                    style={{
                        background: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)',
                        boxShadow: '0 8px 24px rgba(139,92,246,0.45)',
                    }}
                >
                    <ArrowLeft className="h-4 w-4" />
                    Quay lại
                </button>
                <Link
                    href={homeHref}
                    className="flex w-full items-center justify-center gap-2 rounded-full py-3 text-[13px] font-semibold"
                    style={{
                        color: '#A1A1AA',
                        background: 'transparent',
                        border: '1px solid rgba(255,255,255,0.10)',
                    }}
                >
                    <Home className="h-4 w-4" />
                    {homeLabel}
                </Link>
            </div>
        </div>
    )

    // Trong vỏ ứng dụng thì layout đã lo nền + sidebar; chỉ cần canh giữa vùng nội dung.
    if (inShell) {
        return <div className="flex min-h-[60vh] items-center justify-center px-4 py-6">{card}</div>
    }

    return (
        <div className="min-h-dvh flex items-center justify-center px-4 py-6 bg-gradient-to-br from-[#1a0e3d] via-[#0a0014] to-black">
            {card}
        </div>
    )
}
