'use client'

// [BILLING P6] Màn khoá LOCKED (D1/D6) — bọc children của admin/dashboard layout.
//
// VÌ SAO LÀ OVERLAY CLIENT chứ không phải redirect server:
//   • Trang Gói cước nằm DƯỚI chính layout admin — redirect trong layout là vòng lặp vô hạn
//     (billing → layout redirect → billing → …). Layout server cũng không biết pathname
//     hiện tại để chừa lối; usePathname ở client thì biết.
//   • Editor không có quyền vào trang billing (gate profileAdmin) — redirect họ vào đó sẽ
//     bật sang dashboard rồi lại bị đá, thành ping-pong. Overlay đứng yên và GIẢI THÍCH.
// Đây là lớp TRẢI NGHIỆM; lớp CƯỠNG CHẾ thật nằm ở server (assertWriteAllowed/requireFeature
// trong action + route) — tắt JS không mở được gì ngoài cái nhìn.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Lock } from 'lucide-react'

export default function BillingLockGate({ locked, workspaceId, canManageBilling, children }: {
    locked: boolean
    workspaceId: string
    /** profileAdmin — người bấm được nút "Chọn gói". Editor chỉ nhận lời giải thích. */
    canManageBilling: boolean
    children: React.ReactNode
}) {
    const pathname = usePathname()
    const billingHref = `/${workspaceId}/admin/billing`
    // Trang Gói cước (và mọi trang con của nó) là lối thoát duy nhất — không được khoá chính nó.
    if (!locked || pathname.startsWith(billingHref)) return <>{children}</>

    return (
        <div className="flex min-h-[70vh] items-center justify-center px-4">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950/60 p-8 text-center shadow-xl backdrop-blur-xl">
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-zinc-700/60 bg-zinc-800/40 text-zinc-400">
                    <Lock size={26} />
                </span>
                <h2 className="mt-5 text-lg font-bold text-white">Tổ chức chưa có gói sử dụng</h2>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                    {canManageBilling
                        ? 'Chọn một gói trả phí hoặc nhập code dùng thử để tiếp tục. Dữ liệu của bạn vẫn được giữ nguyên.'
                        : 'Quản trị viên của tổ chức cần kích hoạt gói sử dụng. Dữ liệu vẫn được giữ nguyên — hãy liên hệ quản trị viên.'}
                </p>
                {canManageBilling && (
                    <Link
                        href={billingHref}
                        className="mt-6 inline-flex items-center justify-center rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-500"
                    >
                        Chọn gói / nhập code
                    </Link>
                )}
            </div>
        </div>
    )
}
