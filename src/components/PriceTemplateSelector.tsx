'use client'

import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react'
import { Plus, X, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { createPortal } from 'react-dom'

interface Template {
    id: string
    name: string
    priceUSD: number | null
    wageVND: number | null
    sortOrder: number
}

export interface PriceTemplateSelectorHandle {
    openRadial: (x: number, y: number) => void
}

interface PriceTemplateSelectorProps {
    workspaceId: string
    onSelect: (data: { usd: number | null; vnd: number | null }) => void
}

const MIN_SLOTS = 6
const MAX_SLOTS = 15
const RADIUS = 95

function formatPrice(usd: number | null, vnd: number | null): string {
    const parts: string[] = []
    if (usd != null && usd > 0) parts.push(`$${usd}`)
    if (vnd != null && vnd > 0) parts.push(`${(vnd / 1000).toFixed(0)}k`)
    return parts.join(' / ') || 'Empty'
}

// ─── Hook: Exposes onMouseDown for parent container ──────
export function useRadialTrigger(
    selectorRef: React.RefObject<PriceTemplateSelectorHandle | null>
) {
    const onContainerMouseDown = useCallback((e: React.MouseEvent) => {
        if (!e.ctrlKey || !selectorRef.current) return
        e.preventDefault()
        e.stopPropagation()
        selectorRef.current.openRadial(e.clientX, e.clientY)
    }, [selectorRef])

    return { onContainerMouseDown }
}

// ─── Main Component ──────────────────────────────────────
const PriceTemplateSelector = forwardRef<PriceTemplateSelectorHandle, PriceTemplateSelectorProps>(
    ({ workspaceId, onSelect }, ref) => {
        const [templates, setTemplates] = useState<Template[]>([])
        const [showDropdown, setShowDropdown] = useState(false)
        const [showCreate, setShowCreate] = useState(false)
        const [loading, setLoading] = useState(false)
        const triggerRef = useRef<HTMLButtonElement>(null)
        const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 })

        // ─── Radial menu state ───
        const [showRadial, setShowRadial] = useState(false)
        const [center, setCenter] = useState({ x: 0, y: 0 })
        const [hoveredSlot, setHoveredSlot] = useState<number | null>(null)
        const hoveredSlotRef = useRef<number | null>(null)

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

        // Keep ref in sync
        useEffect(() => { hoveredSlotRef.current = hoveredSlot }, [hoveredSlot])

        // Handle dropdown toggle with position calc
        const toggleDropdown = () => {
            if (!showDropdown && triggerRef.current) {
                const rect = triggerRef.current.getBoundingClientRect()
                setDropdownPos({
                    top: rect.bottom + window.scrollY,
                    right: window.innerWidth - rect.right - window.scrollX
                })
            }
            setShowDropdown(!showDropdown)
        }

        // ─── Open radial ───
        const openRadial = useCallback((x: number, y: number) => {
            setCenter({ x, y })
            setShowRadial(true)
            setHoveredSlot(null)
        }, [])

        // Expose openRadial to parent
        useImperativeHandle(ref, () => ({
            openRadial
        }))

        // ─── Close radial + select ───────────────────────
        const selectAndClose = useCallback(() => {
            const idx = hoveredSlotRef.current
            if (idx !== null && idx < templates.length) {
                const t = templates[idx]
                onSelect({ usd: t.priceUSD, vnd: t.wageVND })
                toast.success(`Applied: ${t.name}`)
            }
            setShowRadial(false)
            setHoveredSlot(null)
        }, [templates, onSelect])

        // Close on Ctrl release or mouse up
        useEffect(() => {
            if (!showRadial) return

            const handleKeyUp = (e: KeyboardEvent) => {
                if (e.key === 'Control') selectAndClose()
            }
            const handleMouseUp = () => selectAndClose()

            window.addEventListener('keyup', handleKeyUp)
            window.addEventListener('mouseup', handleMouseUp)
            return () => {
                window.removeEventListener('keyup', handleKeyUp)
                window.removeEventListener('mouseup', handleMouseUp)
            }
        }, [showRadial, selectAndClose])

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
                setNewName(''); setNewUsd(''); setNewVnd('')
                setShowCreate(false)
                await fetchTemplates()
            }
            setLoading(false)
        }

        const handleDelete = async (id: string) => {
            const { deleteTemplate } = await import('@/actions/price-template-actions')
            const res = await deleteTemplate(id, workspaceId)
            if (res.error) toast.error(res.error)
            else { toast.success('Deleted'); await fetchTemplates() }
        }

        const handleSelect = (t: Template) => {
            onSelect({ usd: t.priceUSD, vnd: t.wageVND })
            setShowDropdown(false)
            toast.success(`Applied: ${t.name}`)
        }

        // ─── Radial geometry ─────────────────────────────
        const slotCount = Math.max(MIN_SLOTS, templates.length)
        const effectiveSlots = Math.min(slotCount, MAX_SLOTS)

        return (
            <>
                {/* ─── "+" Button + Dropdown ──────── */}
                <div className="relative inline-block">
                    <button
                        ref={triggerRef}
                        type="button"
                        onClick={toggleDropdown}
                        className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center hover:bg-emerald-500/25 hover:scale-110 transition-all duration-150"
                        title="Price Templates (Ctrl+Click area for radial)"
                    >
                        <Plus className="w-4 h-4" />
                    </button>

                    {showDropdown && createPortal(
                        <>
                            {/* Backdrop for click-away */}
                            <div className="fixed inset-0 z-[9998]" onClick={() => setShowDropdown(false)} />
                            
                            <div 
                                className="fixed w-72 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl shadow-black/50 z-[9999] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
                                style={{
                                    top: `${dropdownPos.top + 8}px`,
                                    right: `${dropdownPos.right}px`,
                                }}
                            >
                                <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
                                    <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Templates</span>
                                    <button onClick={() => setShowDropdown(false)} className="text-zinc-600 hover:text-zinc-300">
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>

                                <div className="max-h-[200px] overflow-y-auto">
                                    {templates.length === 0 ? (
                                        <div className="px-3 py-4 text-center text-xs text-zinc-600 italic">No templates yet</div>
                                    ) : (
                                        templates.map(t => (
                                            <div key={t.id} className="flex items-center justify-between px-3 py-2.5 hover:bg-white/5 transition-colors group">
                                                <button type="button" onClick={() => handleSelect(t)} className="flex-1 text-left">
                                                    <div className="text-sm font-medium text-zinc-200">{t.name}</div>
                                                    <div className="text-[10px] text-zinc-500 font-mono">
                                                        {t.priceUSD != null ? `$${t.priceUSD}` : ''}
                                                        {t.priceUSD != null && t.wageVND != null ? ' / ' : ''}
                                                        {t.wageVND != null ? `${t.wageVND.toLocaleString('vi-VN')}\u20ab` : ''}
                                                    </div>
                                                </button>
                                                <button type="button" onClick={() => handleDelete(t.id)} className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-400 p-1 transition-opacity">
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>

                                {/* Create inline form */}
                                <div className="border-t border-white/5">
                                    {!showCreate ? (
                                        <button type="button" onClick={() => setShowCreate(true)} className="w-full px-3 py-2.5 text-xs text-indigo-400 hover:bg-indigo-500/10 transition-colors flex items-center gap-1.5 font-bold">
                                            <Plus className="w-3.5 h-3.5" /> Create Template
                                        </button>
                                    ) : (
                                        <div className="p-3 space-y-2">
                                            <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Template name..." className="w-full px-2.5 py-1.5 bg-zinc-800 border border-white/10 rounded-lg text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50" />
                                            <div className="grid grid-cols-2 gap-2">
                                                <input type="number" value={newUsd} onChange={e => setNewUsd(e.target.value)} placeholder="USD" className="px-2.5 py-1.5 bg-zinc-800 border border-white/10 rounded-lg text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50" />
                                                <input type="text" value={newVnd} onChange={e => setNewVnd(e.target.value)} placeholder="VND" className="px-2.5 py-1.5 bg-zinc-800 border border-white/10 rounded-lg text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-yellow-500/50" />
                                            </div>
                                            <div className="flex gap-2">
                                                <button type="button" onClick={handleCreate} disabled={loading} className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors">
                                                    {loading ? '...' : 'Save'}
                                                </button>
                                                <button type="button" onClick={() => setShowCreate(false)} className="px-3 py-1.5 bg-zinc-800 text-zinc-400 text-xs rounded-lg hover:bg-zinc-700 transition-colors">Cancel</button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="px-3 py-1.5 border-t border-white/5 text-[10px] text-zinc-700 text-center">
                                    Tip: Ctrl + Click on finance area for radial menu
                                </div>
                            </div>
                        </>,
                        document.body
                    )}
                </div>

                {/* ─── Radial Menu (Portal to body) ──── */}
                {showRadial && typeof window !== 'undefined' && createPortal(
                    <div
                        className="fixed inset-0 z-[9999]"
                        style={{ cursor: 'default' }}
                        onMouseMove={(e) => {
                            const mx = e.clientX
                            const my = e.clientY
                            let closest = -1
                            let closestDist = Infinity

                            for (let i = 0; i < effectiveSlots; i++) {
                                const angle = (i / effectiveSlots) * 2 * Math.PI - Math.PI / 2
                                const sx = center.x + Math.cos(angle) * RADIUS
                                const sy = center.y + Math.sin(angle) * RADIUS
                                const dist = Math.sqrt((mx - sx) ** 2 + (my - sy) ** 2)
                                if (dist < closestDist && dist < 50) {
                                    closest = i
                                    closestDist = dist
                                }
                            }
                            setHoveredSlot(closest >= 0 ? closest : null)
                        }}
                    >
                        {/* Backdrop */}
                        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

                        {/* Center dot */}
                        <div
                            className="absolute w-4 h-4 rounded-full bg-white/40 border border-white/60"
                            style={{ left: center.x - 8, top: center.y - 8 }}
                        />

                        {/* Slots */}
                        {Array.from({ length: effectiveSlots }).map((_, i) => {
                            const angle = (i / effectiveSlots) * 2 * Math.PI - Math.PI / 2
                            const sx = center.x + Math.cos(angle) * RADIUS
                            const sy = center.y + Math.sin(angle) * RADIUS
                            const template = templates[i]
                            const isHovered = hoveredSlot === i
                            const isEmpty = !template

                            return (
                                <div
                                    key={i}
                                    className={`
                                        absolute flex flex-col items-center justify-center rounded-full transition-all duration-150 select-none pointer-events-none
                                        ${isEmpty
                                            ? 'bg-zinc-800/90 border-2 border-dashed border-zinc-600 text-zinc-500'
                                            : isHovered
                                                ? 'bg-indigo-500/40 border-2 border-indigo-400 text-white scale-[1.3] shadow-2xl shadow-indigo-500/40'
                                                : 'bg-zinc-800 border-2 border-zinc-500 text-zinc-200'
                                        }
                                    `}
                                    style={{
                                        left: sx - 34,
                                        top: sy - 34,
                                        width: 68,
                                        height: 68,
                                    }}
                                >
                                    {isEmpty ? (
                                        <span className="text-[9px] font-medium">Empty</span>
                                    ) : (
                                        <>
                                            <span className="text-[11px] font-bold leading-tight text-center px-1">
                                                {formatPrice(template.priceUSD, template.wageVND)}
                                            </span>
                                            <span className="text-[8px] opacity-60 truncate max-w-[60px] text-center">{template.name}</span>
                                        </>
                                    )}
                                </div>
                            )
                        })}

                        {/* Center label */}
                        <div
                            className="absolute text-xs text-white font-bold whitespace-nowrap bg-black/60 px-3 py-1 rounded-full"
                            style={{
                                left: center.x - 60,
                                top: center.y + RADIUS + 50,
                            }}
                        >
                            {hoveredSlot !== null && templates[hoveredSlot]
                                ? `\u2705 ${templates[hoveredSlot].name}`
                                : '\u2191 Move to a slot, release to select'}
                        </div>
                    </div>,
                    document.body
                )}
            </>
        )
    }
)

PriceTemplateSelector.displayName = 'PriceTemplateSelector'
export default PriceTemplateSelector
