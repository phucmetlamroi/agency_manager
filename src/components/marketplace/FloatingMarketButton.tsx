'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Store } from 'lucide-react'

interface FloatingMarketButtonProps {
    onClick: () => void
    taskCount?: number
}

export function FloatingMarketButton({ onClick, taskCount = 0 }: FloatingMarketButtonProps) {
    const [position, setPosition] = useState({ x: 0, y: 0 })

    useEffect(() => {
        const saved = localStorage.getItem('market-fab-pos')
        if (saved) {
            try {
                const pos = JSON.parse(saved)
                setPosition(pos)
            } catch { /* ignore */ }
        }
    }, [])

    const savePosition = (x: number, y: number) => {
        setPosition({ x, y })
        localStorage.setItem('market-fab-pos', JSON.stringify({ x, y }))
    }

    return (
        <motion.button
            drag
            dragMomentum={false}
            dragElastic={0.15}
            onDragEnd={(_, info) => {
                savePosition(position.x + info.offset.x, position.y + info.offset.y)
            }}
            whileHover={{
                scale: 1.08,
            }}
            whileTap={{ scale: 0.95 }}
            onClick={onClick}
            style={{ x: position.x, y: position.y }}
            className="fixed bottom-6 right-6 w-[56px] h-[56px] rounded-2xl bg-gradient-to-br from-amber-500 via-orange-500 to-orange-600 border border-amber-400/30 flex items-center justify-center cursor-grab active:cursor-grabbing z-40 select-none
                shadow-[0_4px_24px_rgba(245,158,11,0.35),0_0_0_1px_rgba(245,158,11,0.1)]
                hover:shadow-[0_4px_32px_rgba(245,158,11,0.5),0_0_0_1px_rgba(245,158,11,0.2)]
                transition-shadow duration-300"
            title="Phiên chợ Task"
        >
            <Store className="w-[22px] h-[22px] text-white drop-shadow-sm" strokeWidth={1.8} />

            {/* Task count badge */}
            {taskCount > 0 && (
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center px-1.5 shadow-lg shadow-red-500/40 border-2 border-zinc-950"
                >
                    {taskCount > 99 ? '99+' : taskCount}
                </motion.div>
            )}

            {/* Pulse ring when tasks available */}
            {taskCount > 0 && (
                <motion.div
                    animate={{ scale: [1, 1.6], opacity: [0.4, 0] }}
                    transition={{ repeat: Infinity, duration: 2, ease: 'easeOut' }}
                    className="absolute inset-0 rounded-2xl border-2 border-amber-400/50 pointer-events-none"
                />
            )}
        </motion.button>
    )
}
