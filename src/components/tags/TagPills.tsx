'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

type Tag = { id: string; name: string }

interface TagPillsProps {
    tags: Tag[]
    onRemove?: (tagId: string) => void
    readonly?: boolean
}

export function TagPills({ tags, onRemove, readonly = false }: TagPillsProps) {
    if (tags.length === 0) return null

    return (
        <motion.div className="flex flex-wrap gap-2 mt-3">
            <AnimatePresence mode="popLayout">
                {tags.map((tag, i) => (
                    <motion.div
                        key={tag.id}
                        initial={{ opacity: 0, scale: 0.8, y: -8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8, y: -8 }}
                        transition={{
                            type: 'spring',
                            stiffness: 200,
                            damping: 20,
                            delay: i * 0.04
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/15 border border-indigo-500/30 rounded-full text-indigo-200 text-[11px] font-semibold tracking-wide hover:bg-indigo-500/25 transition-colors hover:border-indigo-500/50"
                    >
                        {tag.name}
                        {!readonly && onRemove && (
                            <motion.button
                                whileHover={{ scale: 1.2 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => onRemove(tag.id)}
                                className="ml-0.5 text-indigo-300 hover:text-indigo-100 transition-colors"
                            >
                                <X className="w-3 h-3" />
                            </motion.button>
                        )}
                    </motion.div>
                ))}
            </AnimatePresence>
        </motion.div>
    )
}
