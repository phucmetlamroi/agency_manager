'use client'

// [Web Sunset] Banner thông báo ngưng dịch vụ + chặn app sau ngày cutover.
// CHỈ hiển thị trong workspace layout (admin + editor). KHÔNG xuất hiện ở landing page
// hay portal khách (các route đó không nằm dưới [workspaceId]/layout).
// Presentational only. Gated bởi src/lib/sunset.ts (SUNSET_ENABLED / SUNSET_DATE).
import { useEffect, useRef, useState } from 'react'
import { sunsetPhase, SUNSET_DATE_VN } from '@/lib/sunset'

export default function SunsetBanner() {
    // Tính theo client để tránh lệch giờ SSR; mặc định 'off' tới khi mount.
    const [phase, setPhase] = useState<'off' | 'banner' | 'blocked'>('off')
    const [barHeight, setBarHeight] = useState(0)
    const barRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        setPhase(sunsetPhase())
    }, [])

    // Đo chiều cao banner để chừa đúng khoảng trống (spacer) — banner fixed nên
    // bị "nhấc" khỏi luồng; spacer giữ nội dung không bị che.
    useEffect(() => {
        if (phase !== 'banner') return
        const el = barRef.current
        if (!el) return
        const update = () => setBarHeight(el.offsetHeight)
        update()
        const ro = new ResizeObserver(update)
        ro.observe(el)
        return () => ro.disconnect()
    }, [phase])

    if (phase === 'off') return null

    if (phase === 'blocked') {
        return (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-zinc-950/95 p-6 backdrop-blur-xl">
                <div className="max-w-xl rounded-3xl border border-red-500/25 bg-zinc-900/70 p-8 text-center shadow-2xl shadow-red-900/30">
                    <h2 className="text-2xl font-semibold tracking-tight text-zinc-50">HustlyTasker đã ngừng hoạt động</h2>
                    <p className="mt-4 text-[15px] leading-relaxed text-zinc-300">
                        Do không đủ kinh phí để tiếp tục duy trì, hệ thống đã chính thức dừng hoạt động kể từ ngày{' '}
                        <span className="font-semibold text-zinc-100">{SUNSET_DATE_VN}</span>. Xin chân thành cảm ơn các bạn đã
                        tin tưởng và sử dụng dịch vụ trong suốt thời gian qua.
                    </p>
                </div>
            </div>
        )
    }

    // phase === 'banner' — dải thông báo CỐ ĐỊNH trên cùng viewport (không cuộn theo trang).
    return (
        <>
            <style>{`
                @keyframes htlSunsetGlow {
                    0%, 100% { box-shadow: inset 0 -1px 0 0 rgba(248,113,113,.35), 0 0 0 0 rgba(239,68,68,0); }
                    50%      { box-shadow: inset 0 -1px 0 0 rgba(248,113,113,.55), 0 6px 28px -4px rgba(239,68,68,.6); }
                }
                @keyframes htlSunsetDot {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50%      { opacity: .2; transform: scale(.6); }
                }
                @keyframes htlSunsetSheen {
                    0%   { background-position: -150% 0; }
                    100% { background-position: 250% 0; }
                }
            `}</style>

            {/* Banner CỐ ĐỊNH — ghim đỉnh viewport, đứng yên khi cuộn trang */}
            <div
                ref={barRef}
                role="alert"
                className="fixed inset-x-0 top-0 z-[60] w-full overflow-hidden border-b border-red-400/30 bg-gradient-to-r from-red-700/95 via-amber-700/90 to-red-700/95 backdrop-blur-md"
                style={{ animation: 'htlSunsetGlow 2.4s ease-in-out infinite' }}
            >
                {/* lớp ánh sáng quét ngang tạo cảm giác động */}
                <div
                    className="pointer-events-none absolute inset-0 opacity-60"
                    style={{
                        background: 'linear-gradient(100deg, transparent 30%, rgba(255,255,255,.16) 50%, transparent 70%)',
                        backgroundSize: '250% 100%',
                        animation: 'htlSunsetSheen 4.5s linear infinite',
                    }}
                />
                <div className="relative mx-auto flex max-w-7xl items-center justify-center gap-3 px-4 py-2.5 text-center">
                    <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-red-300 shadow-[0_0_10px_2px_rgba(248,113,113,.8)]"
                        style={{ animation: 'htlSunsetDot 1s ease-in-out infinite' }}
                    />
                    <p className="text-[13.5px] font-medium leading-snug tracking-tight text-amber-50">
                        <span className="font-semibold text-white">Thông báo quan trọng — </span>
                        HustlyTasker sẽ ngừng hoạt động kể từ ngày{' '}
                        <span className="font-semibold text-white">{SUNSET_DATE_VN}</span> do không đủ kinh phí để tiếp tục duy
                        trì hệ thống. Xin chân thành cảm ơn các bạn đã tin tưởng và đồng hành cùng chúng tôi trong suốt thời gian qua.
                    </p>
                </div>
            </div>

            {/* Spacer giữ chỗ trong luồng = chiều cao banner, để nội dung không bị che */}
            <div aria-hidden style={{ height: barHeight }} className="shrink-0" />
        </>
    )
}
