'use client'

import { refreshLeaderboardAction } from "@/actions/leaderboard-actions"
import { RefreshCw } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

export default function RefreshLeaderboardButton({ isAdmin }: { isAdmin: boolean }) {
    const [isPending, startTransition] = useTransition()
    const [cooldown, setCooldown] = useState(false)

    if (!isAdmin) return null

    const handleRefresh = () => {
        if (cooldown) return toast.info("Vui lòng đợi 30 giây giữa mỗi lần làm mới.")
        
        startTransition(async () => {
            const res = await refreshLeaderboardAction()
            if (res.success) {
                toast.success("Đã cập nhật bảng xếp hạng!")
                setCooldown(true)
                setTimeout(() => setCooldown(false), 30000) // 30s cooldown
            } else {
                toast.error("Lỗi khi làm mới dữ liệu.")
            }
        })
    }

    return (
        <button
            onClick={handleRefresh}
            disabled={isPending || cooldown}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-bold transition-all
                ${cooldown 
                    ? 'bg-zinc-800 border-zinc-700 text-zinc-500 cursor-not-allowed' 
                    : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/20 active:scale-95'
                }`}
            title="Làm mới bảng xếp hạng"
        >
            <RefreshCw className={`w-3 h-3 ${isPending ? 'animate-spin' : ''}`} />
            {isPending ? 'Đang cập nhật...' : (cooldown ? 'Đã làm mới' : 'Làm mới dữ liệu')}
        </button>
    )
}
