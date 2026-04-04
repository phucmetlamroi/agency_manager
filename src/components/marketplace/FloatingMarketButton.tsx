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
        // Load saved position from localStorage
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
                savePosition(info.point.x - window.innerWidth + 80, info.point.y - window.innerHeight + 80)
            }}
            whileHover={{
                scale: 1.1,
                boxShadow: '0 0 24px rgba(245, 158, 11, 0.45)',
            }}
            whileTap={{ scale: 0.95 }}
            onClick={onClick}
            style={{ x: position.x, y: position.y }}
            className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 border border-white/20 shadow-xl shadow-black/40 flex items-center justify-center cursor-grab active:cursor-grabbing z-40 select-none"
            title="Phiên chợ Task"
        >
            <Store className="w-6 h-6 text-white" strokeWidth={1.8} />

            {/* Task count badge */}
            {taskCount > 0 && (
                <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 2.5 }}
                    className="absolute -top-1 -right-1 min-w-[20px] h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 shadow-lg shadow-red-500/40"
                >
                    {taskCount > 99 ? '99+' : taskCount}
                </motion.div>
            )}
        </motion.button>
    )
}
