'use client'

/**
 * Reusable searchable autocomplete input.
 *
 * Shared between AddTaskModal (Step 1 client + assignee picker) and
 * QuickCreateMode (client picker). Supports hierarchical labels via the
 * optional `parentLabel` field — items render as "Parent / Child" and
 * matching against the full path.
 *
 * Visual style matches the dark glassmorphism modal aesthetic
 * (#8B5CF6 accent, rounded-full pill input, ⌘-K-style dropdown).
 */

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X } from 'lucide-react'

export interface AutocompleteOption {
    id: string
    label: string
    parentLabel?: string
}

interface Props {
    selectedId: string
    onSelect: (id: string) => void
    options: AutocompleteOption[]
    placeholder: string
    /** Shown as a clickable "clear" row at the top of the dropdown (e.g., "Leave Blank") */
    emptyLabel?: string
}

export function AutocompleteInput({
    selectedId,
    onSelect,
    options,
    placeholder,
    emptyLabel,
}: Props) {
    const [query, setQuery] = useState('')
    const [isOpen, setIsOpen] = useState(false)
    const [isSearching, setIsSearching] = useState(false)
    const wrapperRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    const selectedOption = options.find((o) => o.id === selectedId)

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setIsOpen(false)
                setIsSearching(false)
                setQuery('')
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    useEffect(() => {
        if (!selectedId) {
            setQuery('')
            setIsSearching(false)
        }
    }, [selectedId])

    const filtered = query
        ? options.filter((o) => {
              const searchStr = o.parentLabel ? `${o.parentLabel} ${o.label}` : o.label
              return searchStr.toLowerCase().includes(query.toLowerCase())
          })
        : options

    const displayValue = isSearching
        ? query
        : selectedOption
          ? selectedOption.parentLabel
              ? `${selectedOption.parentLabel} / ${selectedOption.label}`
              : selectedOption.label
          : ''

    return (
        <div ref={wrapperRef} className="relative">
            <div className="relative">
                <div className="pointer-events-none absolute left-[14px] top-1/2 -translate-y-1/2 text-[#71717A]">
                    <Search size={14} />
                </div>
                <input
                    ref={inputRef}
                    className="h-11 w-full rounded-full bg-white/[0.04] border border-[rgba(139,92,246,0.12)] pl-9 pr-9 text-[13px] text-zinc-300 placeholder:text-zinc-600 outline-none transition-colors focus:border-[#8B5CF6]/50 focus:bg-white/[0.06]"
                    placeholder={placeholder}
                    value={displayValue}
                    onChange={(e) => {
                        if (selectedId && !isSearching) {
                            onSelect('')
                        }
                        setQuery(e.target.value)
                        setIsSearching(true)
                        setIsOpen(true)
                    }}
                    onFocus={() => {
                        setIsOpen(true)
                        if (selectedId) {
                            setIsSearching(true)
                            setQuery('')
                        }
                    }}
                />
                {selectedId && !isSearching && (
                    <button
                        type="button"
                        onClick={() => {
                            onSelect('')
                            setIsSearching(true)
                            setQuery('')
                            inputRef.current?.focus()
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A1A1AA] hover:text-white transition-colors"
                    >
                        <X size={14} />
                    </button>
                )}
            </div>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-full mt-1.5 left-0 w-full z-50 max-h-[200px] overflow-y-auto rounded-2xl border border-[rgba(139,92,246,0.15)] bg-[#0A0A0A] shadow-[0_16px_48px_rgba(0,0,0,0.5)] custom-scrollbar"
                    >
                        {emptyLabel && (
                            <button
                                type="button"
                                onClick={() => {
                                    onSelect('')
                                    setIsOpen(false)
                                    setIsSearching(false)
                                    setQuery('')
                                }}
                                className="w-full text-left px-4 py-2.5 text-[13px] text-zinc-500 hover:bg-white/[0.06] transition-colors"
                            >
                                {emptyLabel}
                            </button>
                        )}
                        {filtered.length > 0 ? (
                            filtered.map((o) => (
                                <button
                                    key={o.id}
                                    type="button"
                                    onClick={() => {
                                        onSelect(o.id)
                                        setIsOpen(false)
                                        setIsSearching(false)
                                        setQuery('')
                                    }}
                                    className={`w-full text-left px-4 py-2.5 text-[13px] transition-colors ${
                                        o.id === selectedId
                                            ? 'bg-[#8B5CF6]/10 text-white'
                                            : 'text-zinc-300 hover:bg-white/[0.06]'
                                    }`}
                                >
                                    {o.parentLabel ? (
                                        <>
                                            <span className="text-zinc-500">{o.parentLabel}</span>
                                            <span className="text-zinc-600 mx-1">/</span>
                                            <span>{o.label}</span>
                                        </>
                                    ) : (
                                        o.label
                                    )}
                                </button>
                            ))
                        ) : (
                            <div className="px-4 py-3 text-[13px] text-zinc-600">No results found</div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
