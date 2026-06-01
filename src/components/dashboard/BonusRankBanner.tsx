"use client"

import { motion } from "framer-motion"
import { Trophy } from "lucide-react"

/**
 * Banner chúc mừng hiển thị trên dashboard của NHÂN VIÊN khi họ được xếp hạng
 * thưởng (Top 1/2/3) trong kỳ lương hiện tại. Mục đích: để người được thưởng
 * BIẾT mình đạt Top mấy + số tiền thưởng đã cộng vào lương. Thuần hiển thị.
 */

const MEDALS: Record<number, { emoji: string; ring: string; glow: string; bg: string; accent: string; circle: string }> = {
    1: {
        emoji: "🥇",
        ring: "rgba(245,165,36,0.5)",
        glow: "rgba(245,165,36,0.32)",
        bg: "linear-gradient(100deg, rgba(245,165,36,0.16), rgba(139,92,246,0.10) 60%, rgba(10,10,10,0))",
        accent: "#FFD27A",
        circle: "linear-gradient(135deg,#FFE08A,#F5A524)",
    },
    2: {
        emoji: "🥈",
        ring: "rgba(169,182,198,0.45)",
        glow: "rgba(169,182,198,0.26)",
        bg: "linear-gradient(100deg, rgba(169,182,198,0.14), rgba(139,92,246,0.10) 60%, rgba(10,10,10,0))",
        accent: "#D8E0EA",
        circle: "linear-gradient(135deg,#EEF2F7,#A9B6C6)",
    },
    3: {
        emoji: "🥉",
        ring: "rgba(194,107,63,0.45)",
        glow: "rgba(194,107,63,0.26)",
        bg: "linear-gradient(100deg, rgba(194,107,63,0.16), rgba(139,92,246,0.10) 60%, rgba(10,10,10,0))",
        accent: "#F0B584",
        circle: "linear-gradient(135deg,#F0B584,#C26B3F)",
    },
}

export default function BonusRankBanner({
    rank,
    bonusAmount,
    bonusPercent = 0,
    period,
    locale = "vi-VN",
}: {
    rank: number
    bonusAmount: number
    bonusPercent?: number
    period?: string | null
    locale?: string
}) {
    const m = MEDALS[rank]
    if (!m) return null

    return (
        <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="relative overflow-hidden rounded-[20px] px-5 py-4 flex items-center gap-4"
            style={{
                border: `1px solid ${m.ring}`,
                background: "#0A0A0A",
                boxShadow: `0 8px 30px ${m.glow}`,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
        >
            {/* lớp gradient nhuốm màu huy chương */}
            <div className="absolute inset-0 pointer-events-none" style={{ background: m.bg }} />

            {/* huy chương */}
            <motion.div
                animate={rank === 1 ? { scale: [1, 1.08, 1] } : undefined}
                transition={rank === 1 ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" } : undefined}
                className="relative flex-shrink-0 w-12 h-12 rounded-2xl grid place-items-center text-[24px]"
                style={{ background: m.circle, boxShadow: `0 4px 16px ${m.glow}` }}
            >
                {m.emoji}
            </motion.div>

            <div className="relative flex-1 min-w-0">
                <div className="text-white font-extrabold text-[15px] leading-tight">
                    Chúc mừng! Bạn đạt <span style={{ color: m.accent }}>Top {rank}</span>
                    {period ? <span className="text-zinc-400 font-semibold"> · {period}</span> : null}
                </div>
                <div className="text-[13px] mt-1" style={{ color: "#C4C4CE" }}>
                    Thưởng{" "}
                    <span className="font-extrabold" style={{ color: m.accent }}>
                        +{bonusAmount.toLocaleString(locale)} đ
                    </span>
                    {bonusPercent ? ` (${bonusPercent}%)` : ""} đã được cộng vào lương kỳ này.
                </div>
            </div>

            <Trophy className="relative w-6 h-6 flex-shrink-0" style={{ color: m.accent, opacity: 0.85 }} />
        </motion.div>
    )
}
