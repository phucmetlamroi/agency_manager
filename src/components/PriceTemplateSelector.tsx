'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Plus, X, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface Template {
    id: string
    name: string
    priceUSD: number | null
    wageVND: number | null
    sortOrder: number
}

interface PriceTemplateSelectorProps {
    workspaceId: string
    onSelect: (data: { usd: number | null; vnd: number | null }) => void
    financeRef?: React.RefObject<HTMLDivElement | null>
}

const MIN_SLOTS = 6
const MAX_SLOTS = 15

function formatPrice(usd: number | null, vnd: number | null): string {
    const parts: string[] = []
    if (usd != null && usd > 0) parts.push(`$${usd}`)
    if (vnd != null && vnd > 0) parts.push(`${(vnd / 1000).toFixed(0)}k`)
    return parts.join(' / ') || 'Empty'
}

export default function PriceTemplateSelector({ workspaceId, onSelect, financeRef }: PriceTemplateSelectorProps) {
    const [templates, setTemplates] = useState<Template[]>([])
    const [showDropdown, setShowDropdown] = useState(false)
    const [showCreate, setShowCreate] = useState(false)
    const [loading, setLoading] = useState(false)

    // Radial menu state
    const [showRadial, setShowRadial] = useState(false)
    const [radialPos, setRadialPos] = useState({ x: 0, y: 0 })
    const [hoveredSlot, setHoveredSlot] = useState<number | null>(null)
    const radialRef = useRef<HTMLDivElement>(null)

    // Create form
    const [newName, setNewName] = useState('')
    const [newUsd, setNewUsd] = useState('')
    const [newVnd, setNewVnd] = useState('')

    // Fetch templates
    const fetchTemplates = useCallback(async () => {
        const { getTemplates } = await import('@/actions/price-template-actions')
        const res = await getTemplates(workspaceId)
        setTemplates(res.templates || [])
    }, [workspaceId])

    useEffect(() => { fetchTemplates() }, [fetchTemplates])

    // ─── Radial Menu: Ctrl + Click on finance area ───
    useEffect(() => {
        const el = financeRef?.current
        if (!el) return

        const handleMouseDown = (e: MouseEvent) => {
            if (!e.ctrlKey) return
            e.preventDefault()
            e.stopPropagation()

            const rect = el.getBoundingClientRect()
            setRadialPos({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
            })
            setShowRadial(true)
            setHoveredSlot(null)
        }

        el.addEventListener('mousedown', handleMouseDown)
        return () => el.removeEventListener('mousedown', handleMouseDown)
    }, [financeRef])

    // Close radial on Ctrl release or mouse up
    useEffect(() => {
        if (!showRadial) return

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'Control') {
                selectHoveredSlot()
            }
        }

        const handleMouseUp = () => {
            selectHoveredSlot()
        }

        window.addEventListener('keyup', handleKeyUp)
        window.addEventListener('mouseup', handleMouseUp)
        return () => {
            window.removeEventListener('keyup', handleKeyUp)
            window.removeEventListener('mouseup', handleMouseUp)
        }
    }, [showRadial, hoveredSlot, templates])

    const selectHoveredSlot = () => {
        if (hoveredSlot !== null && hoveredSlot < templates.length) {
            const t = templates[hoveredSlot]
            onSelect({ usd: t.priceUSD, vnd: t.wageVND })
            toast.success(`Applied: ${t.name}`)
        }
        setShowRadial(false)
        setHoveredSlot(null)
    }

    // ─── CRUD ────────────────────────────────────────
    const handleCreate = async () => {
        if (!newName.trim()) return toast.error('Template name required')
        const usdVal = newUsd ? parseFloat(newUsd) : null
        const vndVal = newVnd ? parseFloat(newVnd.replace(/\D/g, '')) : null
        if (!usdVal && !vndVal) return toast.error('Enter at least USD or VND')

        setLoading(true)
        const { createTemplate } = await import('@/actions/price-template-actions')
        const res = await createTemplate({ name: newName, priceUSD: usdVal, wageVND: vndVal }, workspaceId)
        if (res.error) toast.error(res.error)
        else {
            toast.success('Template created')
            setNewName('')
            setNewUsd('')
            setNewVnd('')
            setShowCreate(false)
            await fetchTemplates()
        }
        setLoading(false)
    }

    const handleDelete = async (id: string) => {
        const { deleteTemplate } = await import('@/actions/price-template-actions')
        const res = await deleteTemplate(id, workspaceId)
        if (res.error) toast.error(res.error)
        else {
            toast.success('Template deleted')
            await fetchTemplates()
        }
    }

    const handleSelect = (t: Template) => {
        onSelect({ usd: t.priceUSD, vnd: t.wageVND })
        setShowDropdown(false)
        toast.success(`Applied: ${t.name}`)
    }

    // ─── Radial slots ────────────────────────────────
    const slotCount = Math.max(MIN_SLOTS, Math.min(templates.length, MAX_SLOTS))
    const RADIUS = 85

    return (
        <>
            {/* ─── "+" Button ─────────────────── */}
            <div className="relative inline-block">
                <button
                    type="button"
                    onClick={() => setShowDropdown(!showDropdown)}
                    className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center hover:bg-emerald-500/25 hover:scale-110 transition-all duration-150"
                    title="Price Templates"
                >
                    <Plus className="w-4 h-4" />
                </button>

                {/* ─── Dropdown ────────────────── */}
                {showDropdown && (
                    <div className="absolute top-full left-0 mt-2 w-72 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl shadow-black/50 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                        {/* Header */}
                        <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
                            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Templates</span>
                            <button onClick={() => setShowDropdown(false)} className="text-zinc-600 hover:text-zinc-300">
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>

                        {/* Template List */}
                        <div className="max-h-[200px] overflow-y-auto">
                            {templates.length === 0 ? (
                                <div className="px-3 py-4 text-center text-xs text-zinc-600 italic">
                                    No templates yet
                                </div>
                            ) : (
                                templates.map(t => (
                                    <div key={t.id} className="flex items-center justify-between px-3 py-2.5 hover:bg-white/5 transition-colors group">
                                        <button
                                            type="button"
                                            onClick={() => handleSelect(t)}
                                            className="flex-1 text-left"
                                        >
                                            <div className="text-sm font-medium text-zinc-200">{t.name}</div>
                                            <div className="text-[10px] text-zinc-500 font-mono">
                                                {t.priceUSD != null ? `$${t.priceUSD}` : ''} 
                                                {t.priceUSD != null && t.wageVND != null ? ' / ' : ''} 
                                                {t.wageVND != null ? `${t.wageVND.toLocaleString('vi-VN')}\u20ab` : ''}
                                            </div>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDelete(t.id)}
                                            className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-400 p-1 transition-opacity"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Create Form */}
                        <div className="border-t border-white/5">
                            {!showCreate ? (
                                <button
                                    type="button"
                                    onClick={() => setShowCreate(true)}
                                    className="w-full px-3 py-2.5 text-xs text-indigo-400 hover:bg-indigo-500/10 transition-colors flex items-center gap-1.5 font-bold"
                                >
                                    <Plus className="w-3.5 h-3.5" /> Create Template
                                </button>
                            ) : (
                                <div className="p-3 space-y-2">
                                    <input
                                        type="text"
                                        value={newName}
                                        onChange={e => setNewName(e.target.value)}
                                        placeholder="Template name..."
                                        className="w-full px-2.5 py-1.5 bg-zinc-800 border border-white/10 rounded-lg text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50"
                                    />
                                    <div className="grid grid-cols-2 gap-2">
                                        <input
                                            type="number"
                                            value={newUsd}
                                            onChange={e => setNewUsd(e.target.value)}
                                            placeholder="USD"
                                            className="px-2.5 py-1.5 bg-zinc-800 border border-white/10 rounded-lg text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50"
                                        />
                                        <input
                                            type="text"
                                            value={newVnd}
                                            onChange={e => setNewVnd(e.target.value)}
                                            placeholder="VND"
                                            className="px-2.5 py-1.5 bg-zinc-800 border border-white/10 rounded-lg text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-yellow-500/50"
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={handleCreate}
                                            disabled={loading}
                                            className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors"
                                        >
                                            {loading ? '...' : 'Save'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setShowCreate(false)}
                                            className="px-3 py-1.5 bg-zinc-800 text-zinc-400 text-xs rounded-lg hover:bg-zinc-700 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Shortcut hint */}
                        <div className="px-3 py-1.5 border-t border-white/5 text-[10px] text-zinc-700 text-center">
                            Tip: Ctrl + Click on finance area for radial menu
                        </div>
                    </div>
                )}
            </div>

            {/* ─── Radial Menu Overlay ────────── */}
            {showRadial && (
                <div
                    ref={radialRef}
                    className="fixed inset-0 z-[100]"
                    style={{ cursor: 'none' }}
                    onMouseMove={(e) => {
                        // Determine which slot is closest to cursor
                        const el = financeRef?.current
                        if (!el) return
                        const rect = el.getBoundingClientRect()
                        const cx = radialPos.x + rect.left
                        const cy = radialPos.y + rect.top
                        const mx = e.clientX
                        const my = e.clientY

                        let closest = -1
                        let closestDist = Infinity

                        for (let i = 0; i < slotCount; i++) {
                            const angle = (i / slotCount) * 2 * Math.PI - Math.PI / 2
                            const sx = cx + Math.cos(angle) * RADIUS
                            const sy = cy + Math.sin(angle) * RADIUS
                            const dist = Math.sqrt((mx - sx) ** 2 + (my - sy) ** 2)
                            if (dist < closestDist && dist < 50) {
                                closest = i
                                closestDist = dist
                            }
                        }
                        setHoveredSlot(closest >= 0 ? closest : null)
                    }}
                >
                    {/* Radial backdrop */}
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

                    {/* Center point */}
                    <div
                        className="absolute w-3 h-3 rounded-full bg-white/30"
                        style={{
                            left: radialPos.x + (financeRef?.current?.getBoundingClientRect().left || 0) - 6,
                            top: radialPos.y + (financeRef?.current?.getBoundingClientRect().top || 0) - 6,
                        }}
                    />

                    {/* Slots */}
                    {Array.from({ length: slotCount }).map((_, i) => {
                        const angle = (i / slotCount) * 2 * Math.PI - Math.PI / 2
                        const rect = financeRef?.current?.getBoundingClientRect()
                        const cx = radialPos.x + (rect?.left || 0)
                        const cy = radialPos.y + (rect?.top || 0)
                        const sx = cx + Math.cos(angle) * RADIUS
                        const sy = cy + Math.sin(angle) * RADIUS
                        const template = templates[i]
                        const isHovered = hoveredSlot === i
                        const isEmpty = !template

                        return (
                            <div
                                key={i}
                                className={`
                                    absolute flex flex-col items-center justify-center rounded-full transition-all duration-150 select-none
                                    ${isEmpty
                                        ? 'bg-zinc-800/80 border-2 border-dashed border-zinc-700 text-zinc-600'
                                        : isHovered
                                            ? 'bg-indigo-500/30 border-2 border-indigo-400 text-white scale-125 shadow-xl shadow-indigo-500/30'
                                            : 'bg-zinc-800/90 border-2 border-zinc-600 text-zinc-300 hover:border-zinc-400'
                                    }
                                `}
                                style={{
                                    left: sx - 32,
                                    top: sy - 32,
                                    width: 64,
                                    height: 64,
                                }}
                            >
                                {isEmpty ? (
                                    <span className="text-[9px] font-medium">Empty</span>
                                ) : (
                                    <>
                                        <span className="text-[10px] font-bold leading-tight truncate max-w-[56px] text-center">
                                            {formatPrice(template.priceUSD, template.wageVND)}
                                        </span>
                                        <span className="text-[8px] opacity-60 truncate max-w-[56px]">{template.name}</span>
                                    </>
                                )}
                            </div>
                        )
                    })}

                    {/* Center label */}
                    <div
                        className="absolute text-[10px] text-zinc-400 font-bold whitespace-nowrap"
                        style={{
                            left: radialPos.x + (financeRef?.current?.getBoundingClientRect().left || 0) - 40,
                            top: radialPos.y + (financeRef?.current?.getBoundingClientRect().top || 0) + 10,
                        }}
                    >
                        {hoveredSlot !== null && templates[hoveredSlot]
                            ? `Select: ${templates[hoveredSlot].name}`
                            : 'Move to select'}
                    </div>
                </div>
            )}
        </>
    )
}
