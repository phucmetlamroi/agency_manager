'use client'

import { useState, useTransition } from 'react'
import { motion } from 'framer-motion'
import { ShoppingBag, Lock, Unlock } from 'lucide-react'
import { toggleMarketplace } from '@/actions/claim-actions'
import { toast } from 'sonner'

interface MarketplaceToggleProps {
    workspaceId: string
    initialOpen: boolean
}

export function MarketplaceToggle({ workspaceId, initialOpen }: MarketplaceToggleProps) {
    const [isOpen, setIsOpen] = useState(initialOpen)
    const [isPending, startTransition] = useTransition()

    const handleToggle = () => {
        const newState = !isOpen
        // Optimistic
        setIsOpen(newState)

        startTransition(async () => {
            const res = await toggleMarketplace(workspaceId)
            if (res.error) {
                setIsOpen(!newState) // revert
                toast.error(res.error)
                return
            }
            toast.success(newState ? 'Phiên chợ đã mở' : 'Phiên chợ đã đóng')
        })
    }

    return (
        <motion.button
            onClick={handleToggle}
            disabled={isPending}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className={`
                group relative flex items-center gap-3 px-5 py-3 rounded-2xl border
                transition-all duration-300 disabled:opacity-60
                ${isOpen
                    ? 'bg-emerald-500/10 border-emerald-500/25 hover:border-emerald-500/40'
                    : 'bg-red-500/10 border-red-500/25 hover:border-red-500/40'
                }
            `}
        >
            {/* Glow */}
            <div className={`absolute inset-0 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${
                isOpen ? 'bg-emerald-500/10' : 'bg-red-500/10'
            }`} />

            {/* Icon */}
            <div className={`relative w-9 h-9 rounded-xl flex items-center justify-center border ${
                isOpen
                    ? 'bg-emerald-500/15 border-emerald-500/30'
                    : 'bg-red-500/15 border-red-500/30'
            }`}>
                {isOpen ? (
                    <Unlock className="w-4 h-4 text-emerald-400" strokeWidth={2} />
                ) : (
                    <Lock className="w-4 h-4 text-red-400" strokeWidth={2} />
                )}
            </div>

            {/* Label */}
            <div className="relative text-left">
                <div className="flex items-center gap-2">
                    <ShoppingBag className={`w-3.5 h-3.5 ${isOpen ? 'text-emerald-400' : 'text-red-400'}`} strokeWidth={2} />
                    <span className={`text-sm font-bold ${isOpen ? 'text-emerald-300' : 'text-red-300'}`}>
                        Phiên Chợ
                    </span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                    {isPending ? 'Đang xử lý...' : isOpen ? 'Đang mở — nhân viên có thể nhận task' : 'Đã đóng — nhân viên không thể nhận task'}
                </p>
            </div>

            {/* Status dot */}
            <div className="relative ml-auto">
                <motion.div
                    animate={isOpen ? { scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] } : {}}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className={`w-2.5 h-2.5 rounded-full ${
                        isOpen ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-red-400'
                    }`}
                />
            </div>
        </motion.button>
    )
}
