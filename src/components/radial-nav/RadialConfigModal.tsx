'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    DndContext,
    DragOverlay,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragStartEvent,
} from '@dnd-kit/core'
import {
    SortableContext,
    verticalListSortingStrategy,
    useSortable,
    arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { X, GripVertical, RotateCcw, Save, Plus, Settings2 } from 'lucide-react'
import {
    ROUTE_REGISTRY,
    DEFAULT_CONFIG,
    getIcon,
    COLOR_MAP,
    FALLBACK_COLOR,
    SEGMENT_MIN,
    SEGMENT_MAX,
} from './radial-nav.constants'
import type { RadialNavConfig, RadialSegment } from './radial-nav.types'

// ─────────────────────────────────────────────
// Sortable Segment Row
// ─────────────────────────────────────────────
function SortableSegmentRow({
    segment,
    index,
    onRemove,
    canRemove,
}: {
    segment: RadialSegment
    index: number
    onRemove: (id: string) => void
    canRemove: boolean
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: segment.id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
    }

    const IconComponent = getIcon(segment.icon)
    const colors = segment.color ? (COLOR_MAP[segment.color] ?? FALLBACK_COLOR) : FALLBACK_COLOR

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900/50 border border-white/5 group hover:border-white/10 transition-colors"
        >
            {/* Drag Handle */}
            <button
                {...attributes}
                {...listeners}
                className="text-zinc-600 hover:text-zinc-400 cursor-grab active:cursor-grabbing transition-colors"
            >
                <GripVertical className="w-4 h-4" />
            </button>

            {/* Index Badge */}
            <span className="text-xs text-zinc-600 w-4 text-center font-mono">{index + 1}</span>

            {/* Icon */}
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colors.bg} border ${colors.border}`}>
                <IconComponent className={`w-4 h-4 ${colors.text}`} />
            </div>

            {/* Label */}
            <span className="flex-1 text-sm text-zinc-300 font-medium">{segment.label}</span>

            {/* Path */}
            <span className="text-xs text-zinc-600 font-mono hidden sm:block truncate max-w-[140px]">
                {segment.path.replace('[workspaceId]', '…')}
            </span>

            {/* Remove */}
            {canRemove && (
                <button
                    onClick={() => onRemove(segment.id)}
                    className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all p-1 rounded-lg hover:bg-red-400/10"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            )}
        </div>
    )
}

// ─────────────────────────────────────────────
// Available Route Row
// ─────────────────────────────────────────────
function RouteRow({
    path,
    label,
    icon,
    color,
    isAdded,
    onAdd,
    disabled,
}: {
    path: string
    label: string
    icon: string
    color?: string
    isAdded: boolean
    onAdd: () => void
    disabled: boolean
}) {
    const IconComponent = getIcon(icon)
    const colors = color ? (COLOR_MAP[color] ?? FALLBACK_COLOR) : FALLBACK_COLOR

    return (
        <div className={`flex items-center gap-3 p-2.5 rounded-xl border transition-colors
            ${isAdded
                ? 'bg-zinc-900/20 border-white/5 opacity-40'
                : 'bg-zinc-900/40 border-white/5 hover:border-white/10 hover:bg-zinc-800/40'
            }`}
        >
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${colors.bg} border ${colors.border}`}>
                <IconComponent className={`w-3.5 h-3.5 ${colors.text}`} />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-zinc-300">{label}</p>
                <p className="text-[10px] text-zinc-600 font-mono truncate">
                    {path.replace('[workspaceId]', '…')}
                </p>
            </div>
            <button
                onClick={onAdd}
                disabled={isAdded || disabled}
                className={`flex-shrink-0 p-1 rounded-lg transition-all
                    ${isAdded || disabled
                        ? 'text-zinc-700 cursor-not-allowed'
                        : 'text-zinc-500 hover:text-violet-400 hover:bg-violet-400/10 cursor-pointer'
                    }`}
            >
                <Plus className="w-3.5 h-3.5" />
            </button>
        </div>
    )
}

// ─────────────────────────────────────────────
// Main Config Modal
// ─────────────────────────────────────────────
type RadialConfigModalProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    config: RadialNavConfig
    onSave: (config: RadialNavConfig) => void
}

export function RadialConfigModal({ open, onOpenChange, config, onSave }: RadialConfigModalProps) {
    const [segments, setSegments] = useState<RadialSegment[]>(config.segments)
    const [activeId, setActiveId] = useState<string | null>(null)

    // Sync with parent config when modal opens
    const handleOpenChange = useCallback((isOpen: boolean) => {
        if (isOpen) setSegments(config.segments)
        onOpenChange(isOpen)
    }, [config.segments, onOpenChange])

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 8 },
        })
    )

    // Which routes are already in segments
    const addedPaths = new Set(segments.map(s => s.path))

    const handleDragStart = ({ active }: DragStartEvent) => {
        setActiveId(active.id as string)
    }

    const handleDragEnd = ({ active, over }: DragEndEvent) => {
        setActiveId(null)
        if (!over || active.id === over.id) return
        const oldIdx = segments.findIndex(s => s.id === active.id)
        const newIdx = segments.findIndex(s => s.id === over.id)
        if (oldIdx !== -1 && newIdx !== -1) {
            setSegments(prev => arrayMove(prev, oldIdx, newIdx))
        }
    }

    const addSegment = useCallback((entry: typeof ROUTE_REGISTRY[number]) => {
        if (segments.length >= SEGMENT_MAX) return
        const newSeg: RadialSegment = {
            id: `seg-${Date.now()}`,
            label: entry.label,
            path: entry.path,
            icon: entry.icon,
            color: entry.color,
        }
        setSegments(prev => [...prev, newSeg])
    }, [segments.length])

    const removeSegment = useCallback((id: string) => {
        setSegments(prev => prev.filter(s => s.id !== id))
    }, [])

    const handleReset = () => setSegments(DEFAULT_CONFIG.segments)

    const handleSave = () => {
        onSave({ version: 1, segments })
        onOpenChange(false)
    }

    const activeSegment = activeId ? segments.find(s => s.id === activeId) : null
    const canRemove = segments.length > SEGMENT_MIN
    const atMax = segments.length >= SEGMENT_MAX

    return (
        <AnimatePresence>
            {open && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        className="fixed inset-0 z-[99996] bg-black/50 backdrop-blur-sm"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        onClick={() => handleOpenChange(false)}
                    />

                    {/* Modal */}
                    <motion.div
                        className="fixed inset-0 z-[99997] flex items-center justify-center p-4 pointer-events-none"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.div
                            className="w-full max-w-2xl max-h-[85vh] flex flex-col pointer-events-auto
                                bg-[#111111]/95 border border-white/10 rounded-2xl shadow-2xl
                                backdrop-blur-xl overflow-hidden relative"
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Ambient glow */}
                            <div className="absolute -top-24 -left-24 w-48 h-48 rounded-full blur-[100px] opacity-15 pointer-events-none bg-violet-500" />
                            <div className="absolute -bottom-16 -right-16 w-40 h-40 rounded-full blur-[80px] opacity-10 pointer-events-none bg-indigo-500" />

                            {/* Header */}
                            <div className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-white/8">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                                        <Settings2 className="w-4 h-4 text-violet-400" />
                                    </div>
                                    <div>
                                        <h2 className="text-sm font-semibold text-zinc-100">Quick Navigation</h2>
                                        <p className="text-xs text-zinc-500">Cấu hình các phím tắt radial menu</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-zinc-600 font-mono">Ctrl+Shift+K</span>
                                    <button
                                        onClick={() => handleOpenChange(false)}
                                        className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Body */}
                            <div className="relative z-10 flex-1 overflow-hidden">
                                <div className="grid grid-cols-2 h-full divide-x divide-white/5">

                                    {/* Left: Available Routes */}
                                    <div className="flex flex-col overflow-hidden">
                                        <div className="px-4 py-3 border-b border-white/5">
                                            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                                                Trang có thể thêm
                                            </p>
                                        </div>
                                        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar">
                                            {ROUTE_REGISTRY.map(entry => (
                                                <RouteRow
                                                    key={entry.path}
                                                    {...entry}
                                                    isAdded={addedPaths.has(entry.path)}
                                                    onAdd={() => addSegment(entry)}
                                                    disabled={atMax}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    {/* Right: Current Segments (sortable) */}
                                    <div className="flex flex-col overflow-hidden">
                                        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                                            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                                                Segments của bạn
                                            </p>
                                            <div className="flex items-center gap-1.5">
                                                <span className={`text-xs font-mono ${atMax ? 'text-amber-400' : 'text-zinc-600'}`}>
                                                    {segments.length}/{SEGMENT_MAX}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
                                            <DndContext
                                                sensors={sensors}
                                                collisionDetection={closestCenter}
                                                onDragStart={handleDragStart}
                                                onDragEnd={handleDragEnd}
                                            >
                                                <SortableContext
                                                    items={segments.map(s => s.id)}
                                                    strategy={verticalListSortingStrategy}
                                                >
                                                    <div className="space-y-1.5">
                                                        {segments.map((seg, i) => (
                                                            <SortableSegmentRow
                                                                key={seg.id}
                                                                segment={seg}
                                                                index={i}
                                                                onRemove={removeSegment}
                                                                canRemove={canRemove}
                                                            />
                                                        ))}
                                                    </div>
                                                </SortableContext>

                                                <DragOverlay>
                                                    {activeSegment && (
                                                        <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900/90 border border-violet-500/30 shadow-xl shadow-violet-500/10">
                                                            <GripVertical className="w-4 h-4 text-zinc-500" />
                                                            <span className="text-sm text-zinc-200 font-medium">{activeSegment.label}</span>
                                                        </div>
                                                    )}
                                                </DragOverlay>
                                            </DndContext>

                                            {/* Min segments warning */}
                                            {segments.length <= SEGMENT_MIN && (
                                                <p className="text-xs text-amber-400/70 mt-2 px-1">
                                                    Cần tối thiểu {SEGMENT_MIN} segment
                                                </p>
                                            )}

                                            {/* Max segments warning */}
                                            {atMax && (
                                                <p className="text-xs text-amber-400/70 mt-2 px-1">
                                                    Đã đạt giới hạn tối đa {SEGMENT_MAX} segment
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="relative z-10 flex items-center justify-between px-6 py-4 border-t border-white/8">
                                <button
                                    onClick={handleReset}
                                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-zinc-500 hover:text-zinc-300
                                        hover:bg-white/5 border border-transparent hover:border-white/10 transition-all"
                                >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    Reset mặc định
                                </button>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleOpenChange(false)}
                                        className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400
                                            bg-white/5 border border-white/10 hover:bg-white/8 transition-colors"
                                    >
                                        Hủy
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        className="px-4 py-2 rounded-xl text-xs font-semibold text-white
                                            bg-gradient-to-r from-violet-600 to-indigo-600
                                            shadow-lg shadow-violet-500/20
                                            hover:from-violet-500 hover:to-indigo-500
                                            flex items-center gap-1.5 transition-all active:scale-95"
                                    >
                                        <Save className="w-3.5 h-3.5" />
                                        Lưu thay đổi
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}
