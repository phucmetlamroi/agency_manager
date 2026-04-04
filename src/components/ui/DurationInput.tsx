'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Pencil, Timer } from 'lucide-react'
import { parseDuration, formatDuration, type ParsedDuration } from '@/lib/duration-parser'

interface DurationInputProps {
    value: string | null | undefined
    onChange: (rawValue: string) => void
    disabled?: boolean
}

export function DurationInput({ value, onChange, disabled = false }: DurationInputProps) {
    const [isEditing, setIsEditing] = useState(!value)
    const [rawInput, setRawInput] = useState(value || '')
    const [parsed, setParsed] = useState<ParsedDuration | null>(null)

    useEffect(() => {
        if (value) {
            setRawInput(value)
            const result = parseDuration(value)
            if (result.valid) setParsed(result)
        }
    }, [value])

    const handleInputChange = (text: string) => {
        setRawInput(text)
        const result = parseDuration(text)
        if (result.valid) {
            setParsed(result)
            onChange(text)
        } else {
            setParsed(null)
        }
    }

    const handleConfirm = () => {
        if (parsed?.valid) {
            onChange(rawInput)
            setIsEditing(false)
        }
    }

    const handleEdit = () => {
        setIsEditing(true)
    }

    if (disabled && !value) return null

    return (
        <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                <Timer className="w-3.5 h-3.5" strokeWidth={1.5} />
                Thời lượng Video
            </label>

            <AnimatePresence mode="wait">
                {isEditing ? (
                    <motion.div
                        key="input"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.15 }}
                        className="flex gap-2 items-center"
                    >
                        <input
                            type="text"
                            value={rawInput}
                            onChange={(e) => handleInputChange(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
                            placeholder="VD: 1p30s, 45s, 2p"
                            disabled={disabled}
                            className="flex-1 px-3.5 py-2.5 text-sm bg-zinc-900/50 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all"
                        />
                        {parsed?.valid && (
                            <motion.button
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                onClick={handleConfirm}
                                className="p-2.5 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-400 hover:bg-emerald-500/25 transition-colors"
                            >
                                <Check className="w-4 h-4" strokeWidth={2} />
                            </motion.button>
                        )}
                    </motion.div>
                ) : (
                    <motion.div
                        key="display"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center gap-3 p-3 bg-zinc-900/40 border border-emerald-500/20 rounded-xl"
                    >
                        <span className="text-sm font-semibold text-white">
                            {parsed ? formatDuration(parsed.totalSeconds) : value}
                        </span>
                        <motion.div
                            animate={{ scale: [1, 1.15, 1] }}
                            transition={{ repeat: Infinity, duration: 2.5 }}
                            className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-md shadow-emerald-500/40"
                        />
                        {!disabled && (
                            <button
                                onClick={handleEdit}
                                className="ml-auto p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors"
                                title="Chỉnh sửa thời lượng"
                            >
                                <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
                            </button>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Parse preview hint */}
            {isEditing && rawInput && (
                <p className={`text-[10px] font-medium ${parsed?.valid ? 'text-emerald-400' : 'text-zinc-600'}`}>
                    {parsed?.valid ? `= ${parsed.display}` : 'Định dạng: 1p30s, 45s, 2p'}
                </p>
            )}
        </div>
    )
}
