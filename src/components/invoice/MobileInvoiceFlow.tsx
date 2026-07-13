'use client'

// [Mobile design-handoff §3 / PR#3] Full-screen 2-step invoice flow for mobile.
// Desktop InvoiceModal (2-panel + live PDF preview) stays UNTOUCHED — this is a separate
// mobile presentation. CRITICAL: the invoice state, derived calcs, item handlers and
// handleGenerate (createInvoiceRecord DB payload + /api/invoices/generate PDF payload) are
// copied VERBATIM from InvoiceModal so the money/records/PDF are byte-identical; only the
// RENDER changes (2 mobile steps instead of the desktop 2-panel + 760px preview sheet).
//   Bước 1 "Chọn mục": groupByBrand + task selector (auto-select all) + manual items + line
//                       items (edit inline) + running subtotal.
//   Bước 2 "Thiết lập": billing profile + số/ngày + thuế/trả trước/cọc + link + field EN + tổng.
//   [design-handoff parity] reskinned under `.mroot` (indigo #6366F1 --m-* tokens) to match the
//   owner's prototype — presentational only; no money/calc/payload change.

import { useState, useEffect, useMemo, type CSSProperties } from 'react'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2, Pencil, Check, FileDown, X, ChevronDown, ChevronLeft, ArrowRight, Layers, Landmark, PiggyBank, Languages } from 'lucide-react'
import { getUnbilledTasks, getBillingProfiles, createInvoiceRecord } from '@/actions/invoice-actions'
import { formatCurrency } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { useHistoryBackClose } from '@/hooks/useHistoryBackClose'
import BillingProfileManager from './BillingProfileManager'

interface MobileInvoiceFlowProps {
    open: boolean
    onClose: () => void
    clientId: number
    clientName: string
    clientAddress?: string
    depositBalance?: number
    workspaceId: string
}

interface InvoiceItem {
    id: string
    description: string
    note?: string
    quantity: number
    unitPrice: number
    amount: number
    isManual: boolean
    taskId?: string
}

export default function MobileInvoiceFlow({ open, onClose, clientId, clientName, clientAddress, depositBalance = 0, workspaceId }: MobileInvoiceFlowProps) {
    const router = useRouter()

    // ── Data state (verbatim from InvoiceModal) ──
    const [tasks, setTasks] = useState<any[]>([])
    const [billingProfiles, setBillingProfiles] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isGenerating, setIsGenerating] = useState(false)

    // ── Invoice state ──
    const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([])
    const [manualItems, setManualItems] = useState<InvoiceItem[]>([])
    const [billingProfileId, setBillingProfileId] = useState<string>('')
    const [invoiceNumber, setInvoiceNumber] = useState('')
    const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0])
    const [dueDate, setDueDate] = useState('')
    const [taxPercent, setTaxPercent] = useState(0)
    const [applyDeposit, setApplyDeposit] = useState(false)
    const [groupByBrand, setGroupByBrand] = useState(true)
    const [currency, setCurrency] = useState('$')

    const [customAgencyName, setCustomAgencyName] = useState('Agency Manager')
    const [customTitle, setCustomTitle] = useState('INVOICE')
    const [customClientAddress, setCustomClientAddress] = useState(clientAddress || '')
    const [dueDateLabel, setDueDateLabel] = useState('Due Date')
    const [paymentLink, setPaymentLink] = useState('')
    const [customPrepaid, setCustomPrepaid] = useState(0)

    const [editingItemId, setEditingItemId] = useState<string | null>(null)
    const [editForm, setEditForm] = useState({ description: '', unitPrice: 0, quantity: 1 })
    const [overrides, setOverrides] = useState<Record<string, { description?: string; unitPrice?: number; quantity?: number; amount: number }>>({})

    // ── Mobile-only: which step ──
    const [step, setStep] = useState<1 | 2>(1)

    // Back gesture closes the flow (X button = 2nd close path). Step-back is the footer button.
    useHistoryBackClose(open, onClose)

    const fetchData = async () => {
        setIsLoading(true)
        try {
            const [tasksRes, profilesRes] = await Promise.all([
                getUnbilledTasks(clientId, workspaceId),
                getBillingProfiles(workspaceId),
            ])
            if (tasksRes.success) setTasks(tasksRes.data)
            if (profilesRes.success) {
                setBillingProfiles(profilesRes.data)
                const def = profilesRes.data.find((p: any) => p.isDefault)
                if (def) setBillingProfileId(def.id)
                else if (profilesRes.data.length > 0) setBillingProfileId(profilesRes.data[0].id)
            }
            const date = new Date()
            setInvoiceNumber(`INV-${date.getFullYear()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`)
        } catch {
            toast.error('Không tải được dữ liệu')
        } finally {
            setIsLoading(false)
        }
    }

    const refreshProfiles = async () => {
        const res = await getBillingProfiles(workspaceId)
        if (res.success && res.data) {
            setBillingProfiles(res.data)
            if (!res.data.find((p: any) => p.id === billingProfileId)) {
                const def = res.data.find((p: any) => p.isDefault)
                if (def) setBillingProfileId(def.id)
            }
        }
    }

    useEffect(() => {
        const profile = billingProfiles.find((p) => p.id === billingProfileId)
        if (profile) setCurrency(profile.currency || '$')
    }, [billingProfileId, billingProfiles])

    useEffect(() => {
        if (tasks.length > 0) setSelectedTaskIds(tasks.map((t) => t.id))
    }, [tasks])

    const groupedTasks = useMemo(() => {
        const groups: Record<string, any[]> = {}
        tasks.forEach((t) => {
            const brand = t.originalClientName || 'General'
            if (!groups[brand]) groups[brand] = []
            groups[brand].push(t)
        })
        return groups
    }, [tasks])

    // Fetch when opened; reset to step 1 each open.
    useEffect(() => {
        if (open) {
            setStep(1)
            fetchData()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, clientId])

    // Derived items (verbatim)
    const invoiceItems = useMemo(() => {
        try {
            if (!Array.isArray(tasks)) return []
            const selectedTasks = tasks.filter((t) => t && t.id && selectedTaskIds.includes(t.id))
            if (!groupByBrand) {
                const taskItems: InvoiceItem[] = selectedTasks.map((t) => ({
                    id: t.id,
                    description: t.title || 'Untitled task',
                    note: t.productLink ? `Ref: ${t.productLink}` : undefined,
                    quantity: 1,
                    unitPrice: Number(t.jobPriceUSD) || 0,
                    amount: Number(t.jobPriceUSD) || 0,
                    isManual: false,
                    taskId: t.id,
                }))
                return [...taskItems, ...manualItems]
            }
            const groupedItems: InvoiceItem[] = []
            const findGroup = (name: string) => groupedItems.find((i) => i.taskId === `group-${name}`)
            selectedTasks.forEach((t) => {
                const name = t.originalClientName || 'General'
                const amount = Number(t.jobPriceUSD) || 0
                const existing = findGroup(name)
                if (existing) {
                    existing.quantity += 1
                    existing.amount += amount
                    existing.unitPrice = existing.amount / existing.quantity
                } else {
                    groupedItems.push({
                        id: `group-${name}-${Date.now()}`,
                        description: `Production services [${name}]`,
                        note: `${selectedTasks.filter((st) => (st.originalClientName || 'General') === name).length} tasks`,
                        quantity: 1,
                        unitPrice: amount,
                        amount: amount,
                        isManual: false,
                        taskId: `group-${name}`,
                    })
                }
            })
            return [...groupedItems, ...manualItems]
        } catch (error) {
            console.error('Error generating invoice items:', error)
            return []
        }
    }, [tasks, selectedTaskIds, manualItems, groupByBrand])

    const activeItems = useMemo(() => invoiceItems.map((item) => (overrides[item.id] ? { ...item, ...overrides[item.id] } : item)), [invoiceItems, overrides])

    const activeSubtotal = activeItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
    const activeTaxAmount = activeSubtotal * (Number(taxPercent) / 100)
    const activeTotalBeforeDeposit = activeSubtotal + activeTaxAmount
    const maxDeductible = Math.min(activeTotalBeforeDeposit, depositBalance || 0)
    const depositDeducted = applyDeposit ? maxDeductible : 0
    const totalDeducted = depositDeducted + customPrepaid
    const finalTotalDue = Math.max(0, activeTotalBeforeDeposit - totalDeducted)

    const toggleTask = (taskId: string) => {
        setSelectedTaskIds((prev) => (prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]))
    }

    const handleEditItem = (item: any) => {
        setEditingItemId(item.id)
        setEditForm({ description: item.description, unitPrice: item.unitPrice, quantity: item.quantity })
    }

    const applyEditField = (patch: Partial<{ description: string; unitPrice: number; quantity: number }>) => {
        if (!editingItemId) return
        const next = { ...editForm, ...patch }
        setEditForm(next)
        const unitPrice = Number(next.unitPrice) || 0
        const quantity = Number(next.quantity) || 1
        const amount = unitPrice * quantity
        const isTask = tasks.find((t) => t.id === editingItemId)
        if (isTask) {
            setOverrides((prev) => ({ ...prev, [editingItemId]: { description: next.description, unitPrice, quantity, amount } }))
        } else {
            setManualItems((prev) => prev.map((m) => (m.id === editingItemId ? { ...m, description: next.description, unitPrice, quantity, amount } : m)))
        }
    }

    const saveEditItem = () => {
        if (!editingItemId) return
        const newAmount = (Number(editForm.unitPrice) || 0) * (Number(editForm.quantity) || 1)
        const isTask = tasks.find((t) => t.id === editingItemId)
        if (isTask) {
            setOverrides((prev) => ({ ...prev, [editingItemId]: { description: editForm.description, unitPrice: Number(editForm.unitPrice) || 0, quantity: Number(editForm.quantity) || 1, amount: newAmount } }))
        } else {
            setManualItems((prev) => prev.map((m) => (m.id === editingItemId ? { ...m, description: editForm.description, unitPrice: Number(editForm.unitPrice) || 0, quantity: Number(editForm.quantity) || 1, amount: newAmount } : m)))
        }
        setEditingItemId(null)
    }

    const handleGenerate = async () => {
        if (!billingProfileId) return toast.error('Vui lòng chọn hồ sơ thanh toán')
        if (activeItems.length === 0) return toast.error('Hóa đơn đang trống')

        setIsGenerating(true)
        try {
            const profile = billingProfiles.find((p) => p.id === billingProfileId)
            const dbPayload = {
                clientId,
                createdBy: 'system',
                invoiceNumber,
                invoiceStatus: 'SENT',
                agencyName: customAgencyName,
                clientName,
                clientAddress: customClientAddress,
                issueDate: new Date(issueDate),
                dueDate: dueDate ? new Date(dueDate) : undefined,
                items: activeItems.map((i) => ({
                    description: i.description,
                    note: i.note,
                    quantity: i.quantity,
                    unitPrice: i.unitPrice,
                    amount: i.amount,
                    taskId: i.taskId && (i.taskId.startsWith('group-') || i.taskId.startsWith('man-')) ? undefined : i.taskId,
                })),
                subtotalAmount: activeSubtotal,
                taxPercent,
                taxAmount: activeTaxAmount,
                depositDeducted: totalDeducted,
                clientDepositDeducted: depositDeducted,
                totalDue: finalTotalDue,
                billingSnapshot: profile,
                taskIds: selectedTaskIds,
            }

            toast.info('Đang lưu hóa đơn...')
            const saveRes = await createInvoiceRecord(dbPayload, workspaceId)
            if (saveRes.error) throw new Error(saveRes.error)

            toast.success('Đã lưu hóa đơn! Đang tạo PDF...')

            const pdfPayload = {
                ...dbPayload,
                customTitle,
                dueDateLabel,
                paymentLink,
                currency,
                issueDate: issueDate || new Date().toLocaleDateString(),
                dueDate: dueDate || 'Upon receipt',
                subtotal: activeSubtotal.toFixed(2),
                taxAmount: activeTaxAmount.toFixed(2),
                depositDeducted: totalDeducted > 0 ? totalDeducted.toFixed(2) : undefined,
                totalDue: finalTotalDue.toFixed(2),
                items: activeItems.map((i) => ({
                    description: i.description,
                    note: i.note,
                    quantity: i.quantity,
                    unitPrice: `${currency}${i.unitPrice.toFixed(2)}`,
                    amount: `${currency}${i.amount.toFixed(2)}`,
                })),
                bank: {
                    beneficiaryName: profile.beneficiaryName,
                    bankName: profile.bankName,
                    accountNumber: profile.accountNumber,
                    swiftCode: profile.swiftCode,
                    address: profile.address,
                    notes: profile.notes,
                },
            }

            const response = await fetch('/api/invoices/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...pdfPayload, workspaceId }),
            })
            if (!response.ok) {
                const errorText = await response.text()
                throw new Error(errorText || 'Tạo hóa đơn không thành công')
            }

            const blob = await response.blob()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `Invoice-${invoiceNumber}.pdf`
            document.body.appendChild(a)
            a.click()
            a.remove()

            toast.success('Đã tạo & tải hóa đơn về!')
            onClose()
            router.refresh()
        } catch (e: any) {
            console.error(e)
            toast.error(`Lỗi: ${e.message}`)
        } finally {
            setIsGenerating(false)
        }
    }

    if (!open) return null

    // Presentational-only helpers (prototype parity — no logic/calc/payload impact).
    const faux: CSSProperties = {
        height: 40,
        width: '100%',
        borderRadius: 11,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid var(--m-border-3)',
        padding: '0 11px',
        fontSize: 12.5,
        color: 'var(--m-fg-1)',
        outline: 'none',
    }
    const selectedProfile = billingProfiles.find((p) => p.id === billingProfileId)

    return (
        <div className="mroot m-scr fixed inset-0 z-dialog flex flex-col" style={{ background: 'var(--m-bg-1)' }}>
            {/* ── Header ── */}
            <header
                className="flex items-center gap-2.5 px-3 pb-2 pt-[calc(env(safe-area-inset-top)+8px)]"
                style={{ borderBottom: '1px solid var(--m-border-2)' }}
            >
                <button
                    type="button"
                    onClick={step === 1 ? onClose : () => setStep(1)}
                    aria-label={step === 1 ? 'Đóng' : 'Quay lại'}
                    className="m-press flex h-10 w-10 items-center justify-center rounded-full"
                    style={{ color: 'var(--m-fg-3)' }}
                >
                    {step === 1 ? <X size={22} /> : <ChevronLeft size={22} />}
                </button>
                <div className="min-w-0 flex-1" style={{ lineHeight: 1.25 }}>
                    <h1 className="truncate" style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--m-fg-1)' }}>
                        {step === 1 ? `Tạo invoice — ${clientName}` : 'Thiết lập hóa đơn'}
                    </h1>
                    <p className={step === 1 ? 'truncate' : 'm-mono truncate'} style={{ fontSize: 10.5, color: 'var(--m-fg-4)', marginTop: 1 }}>
                        {step === 1 ? 'chỉ task chưa xuất hóa đơn (UNBILLED)' : `${invoiceNumber} · tự sinh, sửa được`}
                    </p>
                </div>
                <span className="m-mono shrink-0" style={{ fontSize: 11, color: 'var(--m-primary-fg)' }}>{step}/2</span>
            </header>

            {/* ── Progress bar ── */}
            <div className="flex" style={{ gap: 5, padding: '0 16px 8px' }}>
                <span style={{ flex: 1, height: 4, borderRadius: 99, background: 'var(--m-primary)', boxShadow: step === 1 ? '0 0 10px var(--m-primary-glow)' : 'none' }} />
                <span style={{ flex: 1, height: 4, borderRadius: 99, background: step === 2 ? 'var(--m-primary)' : 'var(--m-border-2)', boxShadow: step === 2 ? '0 0 10px var(--m-primary-glow)' : 'none' }} />
            </div>

            {/* ── Body ── */}
            <div className="flex-1 overflow-y-auto px-4" style={{ paddingTop: 4, paddingBottom: 'calc(122px + env(safe-area-inset-bottom))' }}>
                {isLoading ? (
                    <div className="flex justify-center pt-16">
                        <Loader2 className="h-7 w-7 animate-spin" style={{ color: 'var(--m-fg-3)' }} />
                    </div>
                ) : step === 1 ? (
                    /* ══ STEP 1 — Chọn mục ══ */
                    <div className="flex flex-col" style={{ gap: 11 }}>
                        {/* Gộp theo brand — switch row */}
                        <div className="flex items-center" style={{ gap: 9, padding: '2px 2px' }}>
                            <Layers size={14} style={{ color: 'var(--m-primary-hover)' }} />
                            <span style={{ fontSize: 11.5, color: 'var(--m-fg-3)' }}>Gộp theo brand</span>
                            <span style={{ flex: 1 }} />
                            <MSwitch on={groupByBrand} onClick={() => setGroupByBrand((v) => !v)} />
                        </div>

                        {/* Grouped task list */}
                        {tasks.length === 0 ? (
                            <p className="text-center" style={{ paddingTop: 24, fontStyle: 'italic', fontSize: 12.5, color: 'var(--m-fg-4)' }}>Không có task chưa xuất hóa đơn.</p>
                        ) : (
                            Object.entries(groupedTasks).map(([brand, brandTasks]) => (
                                <div key={brand}>
                                    <div className="m-eb" style={{ marginBottom: 6, paddingLeft: 2 }}>{brand === clientName ? `${brand} — trực tiếp` : `${brand} — brand con`}</div>
                                    <div className="m-card" style={{ overflow: 'hidden' }}>
                                        {brandTasks.map((task, i) => {
                                            const sel = selectedTaskIds.includes(task.id)
                                            const created = new Date(task.createdAt)
                                            const shortDate = `${created.getDate()}/${created.getMonth() + 1}`
                                            const meta = task.status ? `${task.status} · ${shortDate}` : shortDate
                                            return (
                                                <button
                                                    type="button"
                                                    key={task.id}
                                                    onClick={() => toggleTask(task.id)}
                                                    className="flex w-full items-center text-left"
                                                    style={{ gap: 10, padding: '10px 12px', background: 'transparent', border: 0, borderBottom: i < brandTasks.length - 1 ? '1px solid var(--m-border-1)' : 'none' }}
                                                >
                                                    <span style={{ width: 18, height: 18, borderRadius: 6, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: sel ? 'var(--m-primary)' : 'transparent', border: sel ? 'none' : '1.5px solid rgba(255,255,255,0.20)' }}>
                                                        {sel && <Check size={12} color="#fff" strokeWidth={3} />}
                                                    </span>
                                                    <span className="min-w-0" style={{ flex: 1 }}>
                                                        <span className="block truncate" style={{ fontSize: 12.5, fontWeight: 600, color: sel ? 'var(--m-fg-1)' : 'var(--m-fg-3)' }}>{task.title}</span>
                                                        <span className="block" style={{ fontSize: 10, color: 'var(--m-fg-4)', marginTop: 1 }}>{meta}</span>
                                                    </span>
                                                    <span className="m-mono shrink-0 whitespace-nowrap" style={{ fontSize: 12.5, fontWeight: 700, color: sel ? 'var(--m-fg-1)' : 'var(--m-fg-4)' }}>{formatCurrency(task.jobPriceUSD)}</span>
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>
                            ))
                        )}

                        {/* Add manual line */}
                        <button
                            type="button"
                            onClick={() => {
                                const newItem: InvoiceItem = { id: `man-${Date.now()}`, description: 'Additional service', quantity: 1, unitPrice: 0, amount: 0, isManual: true }
                                setManualItems([...manualItems, newItem])
                                setEditingItemId(newItem.id)
                                setEditForm({ description: newItem.description, unitPrice: 0, quantity: 1 })
                            }}
                            className="m-note"
                            style={{ width: '100%' }}
                        >
                            <Plus size={14} style={{ color: 'var(--m-primary-fg)' }} />
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--m-primary-fg)' }}>Thêm dòng thủ công</span>
                            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--m-fg-4)' }}>mô tả · SL · đơn giá</span>
                        </button>

                        {/* Line items (activeItems) — edit inline */}
                        {activeItems.length > 0 && (
                            <div className="flex flex-col" style={{ gap: 8 }}>
                                {activeItems.map((item) => (
                                    <div key={item.id} className="m-card" style={{ padding: 12 }}>
                                        {editingItemId === item.id ? (
                                            <div className="flex flex-col" style={{ gap: 8 }}>
                                                <input style={faux} value={editForm.description} onChange={(e) => applyEditField({ description: e.target.value })} placeholder="Mô tả" />
                                                <div className="flex" style={{ gap: 8 }}>
                                                    <label className="flex-1">
                                                        <span className="m-eb block" style={{ marginBottom: 4 }}>Số lượng</span>
                                                        <input type="number" inputMode="decimal" style={faux} value={editForm.quantity} onChange={(e) => applyEditField({ quantity: Number(e.target.value) })} />
                                                    </label>
                                                    <label className="flex-1">
                                                        <span className="m-eb block" style={{ marginBottom: 4 }}>Đơn giá ({currency})</span>
                                                        <input type="number" inputMode="decimal" style={faux} value={editForm.unitPrice} onChange={(e) => applyEditField({ unitPrice: Number(e.target.value) })} />
                                                    </label>
                                                </div>
                                                <div className="flex items-center justify-between" style={{ paddingTop: 2 }}>
                                                    <span className="m-mono" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--m-fg-1)' }}>{currency}{(editForm.unitPrice * editForm.quantity).toFixed(2)}</span>
                                                    <button type="button" className="m-btnP" style={{ padding: '0 16px' }} onClick={saveEditItem}>
                                                        <Check size={16} /> Xong
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-start justify-between" style={{ gap: 8 }}>
                                                <div className="min-w-0">
                                                    <div className="break-words" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--m-fg-1)' }}>{item.description}</div>
                                                    {item.note && <div style={{ fontSize: 10, color: 'var(--m-fg-4)', marginTop: 2 }}>{item.note}</div>}
                                                    <div className="m-mono" style={{ fontSize: 10, color: 'var(--m-fg-4)', marginTop: 2 }}>{item.quantity} × {currency}{item.unitPrice.toFixed(2)}</div>
                                                </div>
                                                <div className="flex shrink-0 flex-col items-end" style={{ gap: 6 }}>
                                                    <span className="m-mono whitespace-nowrap" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--m-fg-1)' }}>{currency}{item.amount.toFixed(2)}</span>
                                                    <div className="flex items-center" style={{ gap: 6 }}>
                                                        <button type="button" onClick={() => handleEditItem(item)} aria-label="Sửa" className="m-press flex h-10 w-10 items-center justify-center" style={{ color: 'var(--m-primary-fg)' }}>
                                                            <Pencil size={16} />
                                                        </button>
                                                        {item.isManual && (
                                                            <button type="button" onClick={() => setManualItems((prev) => prev.filter((m) => m.id !== item.id))} aria-label="Xóa" className="m-press flex h-10 w-10 items-center justify-center" style={{ color: 'var(--m-danger-fg)' }}>
                                                                <Trash2 size={16} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    /* ══ STEP 2 — Thiết lập ══ */
                    <div className="flex flex-col" style={{ gap: 11 }}>
                        {/* Hồ sơ thanh toán */}
                        <div>
                            <div className="m-card" style={{ position: 'relative', padding: '11px 13px', display: 'flex', alignItems: 'center', gap: 9 }}>
                                <Landmark size={16} style={{ color: 'var(--m-primary-hover)', flexShrink: 0 }} />
                                <div className="min-w-0" style={{ flex: 1 }}>
                                    <div className="truncate" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--m-fg-1)' }}>
                                        {selectedProfile ? selectedProfile.profileName : '-- Chọn hồ sơ thanh toán --'}
                                        {selectedProfile?.isDefault && <span style={{ fontSize: 9.5, fontWeight: 400, color: 'var(--m-fg-4)' }}> · mặc định</span>}
                                    </div>
                                    <div style={{ fontSize: 10, color: 'var(--m-fg-4)', marginTop: 1 }}>hồ sơ thanh toán · tiền tệ {currency}</div>
                                </div>
                                <ChevronDown size={14} style={{ color: 'var(--m-fg-4)', flexShrink: 0 }} />
                                <select
                                    aria-label="Hồ sơ thanh toán"
                                    className="absolute inset-0 h-full w-full opacity-0"
                                    value={billingProfileId}
                                    onChange={(e) => setBillingProfileId(e.target.value)}
                                >
                                    <option value="">-- Chọn hồ sơ thanh toán --</option>
                                    {billingProfiles.map((p) => (
                                        <option key={p.id} value={p.id}>{p.profileName} ({p.bankName})</option>
                                    ))}
                                </select>
                            </div>
                            <div style={{ marginTop: 6 }}>
                                <BillingProfileManager
                                    currentProfileId={billingProfileId}
                                    workspaceId={workspaceId}
                                    onProfileSelect={(p) => {
                                        refreshProfiles()
                                        setBillingProfileId(p.id)
                                    }}
                                />
                            </div>
                        </div>

                        {/* Dates 2-up */}
                        <div className="flex" style={{ gap: 8 }}>
                            <label className="flex-1">
                                <span className="m-eb block" style={{ marginBottom: 4 }}>Phát hành</span>
                                <input type="date" style={faux} value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
                            </label>
                            <label className="flex-1">
                                <span className="m-eb block" style={{ marginBottom: 4 }}>Hạn "{dueDateLabel}"</span>
                                <input style={faux} value={dueDate} onChange={(e) => setDueDate(e.target.value)} placeholder="Khi có yêu cầu" />
                            </label>
                        </div>

                        {/* Thuế % + Link thanh toán */}
                        <div className="flex" style={{ gap: 8 }}>
                            <label style={{ flex: 1 }}>
                                <span className="m-eb block" style={{ marginBottom: 4 }}>Thuế %</span>
                                <input type="number" inputMode="decimal" className="m-mono" style={faux} value={taxPercent} onChange={(e) => setTaxPercent(Number(e.target.value))} />
                            </label>
                            <label style={{ flex: 2 }}>
                                <span className="m-eb block" style={{ marginBottom: 4 }}>Link thanh toán</span>
                                <input style={faux} value={paymentLink} onChange={(e) => setPaymentLink(e.target.value)} placeholder="https://…" />
                            </label>
                        </div>

                        {/* Số hóa đơn + Trả trước (KEEP — prototype hides these but they feed the record/PDF) */}
                        <div className="flex" style={{ gap: 8 }}>
                            <label className="flex-1">
                                <span className="m-eb block" style={{ marginBottom: 4 }}>Số hóa đơn</span>
                                <input className="m-mono" style={faux} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
                            </label>
                            <label className="flex-1">
                                <span className="m-eb block" style={{ marginBottom: 4 }}>Trả trước ({currency})</span>
                                <input type="number" inputMode="decimal" className="m-mono" style={faux} value={customPrepaid} onChange={(e) => setCustomPrepaid(Number(e.target.value))} />
                            </label>
                        </div>

                        {/* Deposit toggle */}
                        {depositBalance > 0 && (
                            <div className="m-card flex items-center" style={{ gap: 9, padding: '10px 13px' }}>
                                <PiggyBank size={16} style={{ color: 'var(--m-success-fg)', flexShrink: 0 }} />
                                <div className="min-w-0" style={{ flex: 1 }}>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--m-fg-1)' }}>Trừ tiền cọc hiện có</div>
                                    <div className="m-mono" style={{ fontSize: 10, color: 'var(--m-fg-4)', marginTop: 1 }}>số dư cọc {currency}{depositBalance}</div>
                                </div>
                                <MSwitch on={applyDeposit} onClick={() => setApplyDeposit((v) => !v)} />
                            </div>
                        )}

                        {/* EN client fields (PDF) */}
                        <div className="m-card" style={{ padding: '11px 13px', borderStyle: 'dashed' }}>
                            <div className="flex items-center" style={{ gap: 8, marginBottom: 8 }}>
                                <Languages size={15} style={{ color: 'var(--m-fg-4)', flexShrink: 0 }} />
                                <span style={{ fontSize: 11.5, color: 'var(--m-fg-3)' }}>Trường hiển thị cho khách (EN): INVOICE · Agency Manager · địa chỉ</span>
                            </div>
                            <div className="flex flex-col" style={{ gap: 8 }}>
                                <input style={faux} value={customAgencyName} onChange={(e) => setCustomAgencyName(e.target.value)} placeholder="Agency name" />
                                <input style={faux} value={customTitle} onChange={(e) => setCustomTitle(e.target.value.toUpperCase())} placeholder="INVOICE" />
                                <textarea style={{ ...faux, height: 'auto', padding: '9px 11px', resize: 'none' }} rows={2} value={customClientAddress} onChange={(e) => setCustomClientAddress(e.target.value)} placeholder="Địa chỉ khách hàng…" />
                            </div>
                        </div>

                        {/* Totals */}
                        <div className="m-card" style={{ position: 'relative', overflow: 'hidden', background: 'var(--m-bg-2)', padding: '12px 14px' }}>
                            <span className="m-orb" style={{ background: 'rgba(16,185,129,.08)', top: -40, right: -34 }} />
                            <div className="relative flex flex-col" style={{ gap: 4 }}>
                                <div className="m-mono flex justify-between" style={{ fontSize: 12, color: 'var(--m-fg-3)' }}>
                                    <span>Subtotal</span>
                                    <span>{currency}{activeSubtotal.toFixed(2)}</span>
                                </div>
                                {taxPercent > 0 && (
                                    <div className="m-mono flex justify-between" style={{ fontSize: 12, color: 'var(--m-fg-3)' }}>
                                        <span>Tax {taxPercent}%</span>
                                        <span>{currency}{activeTaxAmount.toFixed(2)}</span>
                                    </div>
                                )}
                                {totalDeducted > 0 && (
                                    <div className="m-mono flex justify-between" style={{ fontSize: 12, color: 'var(--m-danger-fg)' }}>
                                        <span>Deposit</span>
                                        <span>−{currency}{totalDeducted.toFixed(2)}</span>
                                    </div>
                                )}
                                <div style={{ borderTop: '1px solid var(--m-border-2)', margin: '8px 0 6px' }} />
                                <div className="flex items-center justify-between">
                                    <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.08em', color: 'var(--m-fg-3)' }}>TOTAL DUE</span>
                                    <span className="m-mono whitespace-nowrap" style={{ fontSize: 20, fontWeight: 800, color: 'var(--m-success-fg)' }}>{currency}{finalTotalDue.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Bottom action ── */}
            {step === 1 ? (
                <div
                    className="absolute inset-x-0 bottom-0"
                    style={{ background: 'var(--m-glass-zinc-strong)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderTop: '1px solid var(--m-border-2)', borderRadius: '24px 24px 0 0', padding: '12px 18px calc(16px + env(safe-area-inset-bottom))', boxShadow: '0 -12px 40px rgba(0,0,0,.5)' }}
                >
                    <div className="flex items-center" style={{ marginBottom: 10 }}>
                        <span style={{ fontSize: 12, color: 'var(--m-fg-3)' }}>Đã chọn <b style={{ color: 'var(--m-fg-1)', fontWeight: 700 }}>{activeItems.length} mục</b></span>
                        <span style={{ flex: 1 }} />
                        <span className="m-mono" style={{ fontSize: 16, fontWeight: 800, color: 'var(--m-fg-1)' }}>{currency}{activeSubtotal.toFixed(2)}</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setStep(2)}
                        disabled={isLoading || activeItems.length === 0}
                        className="m-btnP w-full disabled:opacity-40"
                        style={{ height: 48, borderRadius: 13, fontSize: 13.5, fontWeight: 800, boxShadow: '0 0 22px var(--m-primary-glow)' }}
                    >
                        Tiếp tục <ArrowRight size={15} />
                    </button>
                </div>
            ) : (
                <div
                    className="absolute inset-x-0 bottom-0"
                    style={{ background: 'var(--m-glass-zinc-strong)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderTop: '1px solid var(--m-border-2)', padding: '12px 16px calc(14px + env(safe-area-inset-bottom))' }}
                >
                    <button
                        type="button"
                        onClick={handleGenerate}
                        disabled={isGenerating || activeItems.length === 0 || !billingProfileId}
                        className="m-btnP w-full disabled:opacity-40"
                        style={{ height: 50, borderRadius: 14, fontSize: 13.5, fontWeight: 800, boxShadow: '0 0 24px var(--m-primary-glow)' }}
                    >
                        {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown size={16} />}
                        {isGenerating ? 'Đang tạo…' : 'Tạo invoice & xuất PDF'}
                    </button>
                </div>
            )}
        </div>
    )
}

// iOS-style toggle switch (presentational; prototype parity).
function MSwitch({ on, onClick }: { on: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            onClick={onClick}
            style={{ position: 'relative', width: 38, height: 22, borderRadius: 999, flex: 'none', border: 0, cursor: 'pointer', background: on ? 'var(--m-primary)' : 'var(--m-border-3)', transition: 'background .15s' }}
        >
            <span style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
        </button>
    )
}
