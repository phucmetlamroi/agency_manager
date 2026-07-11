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

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2, Pencil, Check, FileDown, X, ChevronDown } from 'lucide-react'
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

    const inputCls =
        'w-full rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-3 text-base text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-primary/40'

    return (
        <div className="fixed inset-0 z-dialog flex flex-col bg-zinc-950">
            {/* ── Header (X + title + step) ── */}
            <header className="flex items-center gap-3 border-b border-white/8 px-3 pb-2 pt-[calc(env(safe-area-inset-top)+8px)]">
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Đóng"
                    className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors active:bg-white/10"
                >
                    <X className="h-5 w-5" />
                </button>
                <div className="min-w-0 flex-1">
                    <h1 className="truncate text-[15px] font-bold text-foreground">Tạo hóa đơn</h1>
                    <p className="truncate text-caption text-muted-foreground">{clientName}</p>
                </div>
                <span className="shrink-0 rounded-full bg-primary/15 px-2.5 py-1 text-caption font-bold text-primary-accent">
                    Bước {step}/2
                </span>
            </header>

            {/* ── Body ── */}
            <div className="flex-1 overflow-y-auto px-3 py-3 pb-[calc(88px+env(safe-area-inset-bottom))]">
                {isLoading ? (
                    <div className="flex justify-center pt-16">
                        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
                    </div>
                ) : step === 1 ? (
                    /* ══ Bước 1: Chọn mục ══ */
                    <div className="flex flex-col gap-3">
                        {/* Config chips */}
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setGroupByBrand((v) => !v)}
                                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-caption font-bold transition-colors ${groupByBrand ? 'border-primary/60 bg-primary/15 text-primary-accent' : 'border-white/10 bg-zinc-900/70 text-muted-foreground'}`}
                            >
                                <span className={`h-2 w-2 rounded-full ${groupByBrand ? 'bg-primary-accent' : 'bg-zinc-500'}`} />
                                Gộp theo Brand
                            </button>
                            {depositBalance > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setApplyDeposit((v) => !v)}
                                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-caption font-bold transition-colors ${applyDeposit ? 'border-warning/60 bg-warning/15 text-warning' : 'border-white/10 bg-zinc-900/70 text-muted-foreground'}`}
                                >
                                    <span className={`h-2 w-2 rounded-full ${applyDeposit ? 'bg-warning' : 'bg-zinc-500'}`} />
                                    Dùng cọc (-{currency}{maxDeductible})
                                </button>
                            )}
                        </div>

                        {/* Task selector — grouped by brand */}
                        {tasks.length === 0 ? (
                            <p className="pt-6 text-center text-body-sm italic text-muted-foreground">Không có task chưa xuất hóa đơn.</p>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {Object.entries(groupedTasks).map(([brand, brandTasks]) => (
                                    <div key={brand} className="overflow-hidden rounded-xl border border-white/8 bg-zinc-900/40">
                                        <div className="flex items-center justify-between px-3 py-2">
                                            <span className="text-body-sm font-bold text-zinc-200">{brand}</span>
                                            <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-caption text-muted-foreground">{brandTasks.length} task</span>
                                        </div>
                                        <div className="flex flex-col gap-1.5 px-2 pb-2">
                                            {brandTasks.map((task) => {
                                                const sel = selectedTaskIds.includes(task.id)
                                                return (
                                                    <button
                                                        type="button"
                                                        key={task.id}
                                                        onClick={() => toggleTask(task.id)}
                                                        className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2.5 text-left transition-colors ${sel ? 'border-primary/40 bg-primary/10' : 'border-white/8 bg-zinc-800/60'}`}
                                                    >
                                                        <span className="flex min-w-0 items-center gap-2.5">
                                                            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${sel ? 'border-primary bg-primary text-white' : 'border-zinc-600'}`}>
                                                                {sel && <Check className="h-3 w-3" />}
                                                            </span>
                                                            <span className="min-w-0">
                                                                <span className="block truncate text-body-sm font-semibold text-zinc-200">{task.title}</span>
                                                                <span className="block text-caption text-muted-foreground">{new Date(task.createdAt).toLocaleDateString('vi-VN')}</span>
                                                            </span>
                                                        </span>
                                                        <span className="shrink-0 whitespace-nowrap font-mono text-body-sm font-bold text-emerald-400">{formatCurrency(task.jobPriceUSD)}</span>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Add manual item */}
                        <button
                            type="button"
                            onClick={() => {
                                const newItem: InvoiceItem = { id: `man-${Date.now()}`, description: 'Additional service', quantity: 1, unitPrice: 0, amount: 0, isManual: true }
                                setManualItems([...manualItems, newItem])
                                setEditingItemId(newItem.id)
                                setEditForm({ description: newItem.description, unitPrice: 0, quantity: 1 })
                            }}
                            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 text-body-sm text-muted-foreground transition-colors active:bg-white/5"
                        >
                            <Plus className="h-4 w-4" /> Thêm hạng mục thủ công
                        </button>

                        {/* Line items (activeItems) — edit inline */}
                        {activeItems.length > 0 && (
                            <div className="mt-1 flex flex-col gap-2">
                                <p className="text-caption font-bold uppercase tracking-widest text-muted-foreground">Hạng mục hóa đơn</p>
                                {activeItems.map((item) => (
                                    <div key={item.id} className="rounded-xl border border-white/8 bg-zinc-900/60 p-3">
                                        {editingItemId === item.id ? (
                                            <div className="flex flex-col gap-2">
                                                <input className={inputCls} value={editForm.description} onChange={(e) => applyEditField({ description: e.target.value })} placeholder="Mô tả" />
                                                <div className="flex gap-2">
                                                    <label className="flex-1">
                                                        <span className="mb-1 block text-caption text-muted-foreground">Số lượng</span>
                                                        <input type="number" inputMode="decimal" className={inputCls} value={editForm.quantity} onChange={(e) => applyEditField({ quantity: Number(e.target.value) })} />
                                                    </label>
                                                    <label className="flex-1">
                                                        <span className="mb-1 block text-caption text-muted-foreground">Đơn giá ({currency})</span>
                                                        <input type="number" inputMode="decimal" className={inputCls} value={editForm.unitPrice} onChange={(e) => applyEditField({ unitPrice: Number(e.target.value) })} />
                                                    </label>
                                                </div>
                                                <div className="flex items-center justify-between pt-1">
                                                    <span className="font-mono text-body-sm font-bold text-emerald-400">{currency}{(editForm.unitPrice * editForm.quantity).toFixed(2)}</span>
                                                    <Button className="h-10 gap-1.5" onClick={saveEditItem}>
                                                        <Check className="h-4 w-4" /> Xong
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="break-words text-body-sm font-semibold text-foreground">{item.description}</div>
                                                    {item.note && <div className="mt-0.5 text-caption text-muted-foreground">{item.note}</div>}
                                                    <div className="mt-1 text-caption text-muted-foreground">
                                                        {item.quantity} × {currency}{item.unitPrice.toFixed(2)}
                                                    </div>
                                                </div>
                                                <div className="flex shrink-0 flex-col items-end gap-1.5">
                                                    <span className="whitespace-nowrap font-mono text-body-sm font-bold text-foreground">{currency}{item.amount.toFixed(2)}</span>
                                                    <div className="flex items-center gap-1">
                                                        <button type="button" onClick={() => handleEditItem(item)} aria-label="Sửa" className="flex h-8 w-8 items-center justify-center rounded-lg text-primary-accent active:bg-white/5">
                                                            <Pencil className="h-4 w-4" />
                                                        </button>
                                                        {item.isManual && (
                                                            <button type="button" onClick={() => setManualItems((prev) => prev.filter((m) => m.id !== item.id))} aria-label="Xóa" className="flex h-8 w-8 items-center justify-center rounded-lg text-red-400 active:bg-white/5">
                                                                <Trash2 className="h-4 w-4" />
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

                        {/* Running subtotal */}
                        <div className="flex items-center justify-between rounded-xl border border-white/8 bg-zinc-900/60 px-3 py-3">
                            <span className="text-body-sm text-muted-foreground">Tạm tính</span>
                            <span className="whitespace-nowrap font-mono text-[15px] font-bold text-foreground">{currency}{activeSubtotal.toFixed(2)}</span>
                        </div>
                    </div>
                ) : (
                    /* ══ Bước 2: Thiết lập ══ */
                    <div className="flex flex-col gap-4">
                        {/* Hồ sơ thanh toán */}
                        <div>
                            <div className="mb-1.5 flex items-center justify-between">
                                <label className="text-caption font-bold uppercase tracking-widest text-muted-foreground">Hồ sơ thanh toán</label>
                                <BillingProfileManager
                                    currentProfileId={billingProfileId}
                                    workspaceId={workspaceId}
                                    onProfileSelect={(p) => {
                                        refreshProfiles()
                                        setBillingProfileId(p.id)
                                    }}
                                />
                            </div>
                            <div className="relative">
                                <select
                                    className={`${inputCls} appearance-none pr-10`}
                                    value={billingProfileId}
                                    onChange={(e) => setBillingProfileId(e.target.value)}
                                >
                                    <option value="">-- Chọn hồ sơ thanh toán --</option>
                                    {billingProfiles.map((p) => (
                                        <option key={p.id} value={p.id}>{p.profileName} ({p.bankName})</option>
                                    ))}
                                </select>
                                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            </div>
                        </div>

                        {/* Số + ngày */}
                        <label className="block">
                            <span className="mb-1.5 block text-caption font-bold uppercase tracking-widest text-muted-foreground">Số hóa đơn</span>
                            <input className={`${inputCls} font-mono`} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
                        </label>
                        <div className="flex gap-2">
                            <label className="flex-1">
                                <span className="mb-1.5 block text-caption font-bold uppercase tracking-widest text-muted-foreground">Ngày xuất</span>
                                <input type="date" className={inputCls} value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
                            </label>
                            <label className="flex-1">
                                <span className="mb-1.5 block text-caption font-bold uppercase tracking-widest text-muted-foreground">Hạn ({dueDateLabel})</span>
                                <input className={inputCls} value={dueDate} onChange={(e) => setDueDate(e.target.value)} placeholder="vd. Khi có yêu cầu" />
                            </label>
                        </div>

                        {/* Thuế + trả trước */}
                        <div className="flex gap-2">
                            <label className="flex-1">
                                <span className="mb-1.5 block text-caption font-bold uppercase tracking-widest text-muted-foreground">Thuế %</span>
                                <input type="number" inputMode="decimal" className={inputCls} value={taxPercent} onChange={(e) => setTaxPercent(Number(e.target.value))} />
                            </label>
                            <label className="flex-1">
                                <span className="mb-1.5 block text-caption font-bold uppercase tracking-widest text-muted-foreground">Trả trước ({currency})</span>
                                <input type="number" inputMode="decimal" className={inputCls} value={customPrepaid} onChange={(e) => setCustomPrepaid(Number(e.target.value))} />
                            </label>
                        </div>

                        {depositBalance > 0 && (
                            <button
                                type="button"
                                onClick={() => setApplyDeposit((v) => !v)}
                                className={`inline-flex items-center gap-2 self-start rounded-full border px-3 py-2 text-caption font-bold transition-colors ${applyDeposit ? 'border-warning/60 bg-warning/15 text-warning' : 'border-white/10 bg-zinc-900/70 text-muted-foreground'}`}
                            >
                                <span className={`h-2 w-2 rounded-full ${applyDeposit ? 'bg-warning' : 'bg-zinc-500'}`} />
                                Dùng tiền cọc (-{currency}{maxDeductible})
                            </button>
                        )}

                        <label className="block">
                            <span className="mb-1.5 block text-caption font-bold uppercase tracking-widest text-muted-foreground">Link thanh toán</span>
                            <input className={inputCls} value={paymentLink} onChange={(e) => setPaymentLink(e.target.value)} placeholder="https://..." />
                        </label>

                        {/* Field EN cho khách (PDF) */}
                        <div className="rounded-xl border border-white/8 bg-zinc-900/40 p-3">
                            <p className="mb-2 text-caption font-bold uppercase tracking-widest text-muted-foreground">Hiển thị cho khách (PDF · English)</p>
                            <div className="flex flex-col gap-2">
                                <input className={inputCls} value={customAgencyName} onChange={(e) => setCustomAgencyName(e.target.value)} placeholder="Agency name" />
                                <input className={inputCls} value={customTitle} onChange={(e) => setCustomTitle(e.target.value.toUpperCase())} placeholder="INVOICE" />
                                <textarea className={`${inputCls} resize-none`} rows={2} value={customClientAddress} onChange={(e) => setCustomClientAddress(e.target.value)} placeholder="Địa chỉ khách hàng…" />
                            </div>
                        </div>

                        {/* Totals */}
                        <div className="flex flex-col gap-2 rounded-xl border border-white/8 bg-zinc-900/60 p-4">
                            <div className="flex justify-between text-body-sm text-muted-foreground">
                                <span>Tạm tính</span>
                                <span className="font-mono">{currency}{activeSubtotal.toFixed(2)}</span>
                            </div>
                            {taxPercent > 0 && (
                                <div className="flex justify-between text-body-sm text-muted-foreground">
                                    <span>Thuế ({taxPercent}%)</span>
                                    <span className="font-mono">{currency}{activeTaxAmount.toFixed(2)}</span>
                                </div>
                            )}
                            {totalDeducted > 0 && (
                                <div className="flex justify-between text-body-sm text-red-400">
                                    <span>Giảm trừ / Trả trước</span>
                                    <span className="font-mono">-{currency}{totalDeducted.toFixed(2)}</span>
                                </div>
                            )}
                            <div className="mt-1 flex items-center justify-between border-t border-white/10 pt-3">
                                <span className="text-caption font-bold uppercase tracking-widest text-muted-foreground">Tổng cộng</span>
                                <span className="whitespace-nowrap font-mono text-2xl font-black text-emerald-400">{currency}{finalTotalDue.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Sticky footer nav ── */}
            <footer className="absolute inset-x-0 bottom-0 flex gap-2 border-t border-white/8 bg-zinc-950/95 px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-2.5 backdrop-blur-xl">
                {step === 1 ? (
                    <Button
                        className="h-12 w-full"
                        disabled={isLoading || activeItems.length === 0}
                        onClick={() => setStep(2)}
                    >
                        Tiếp: Thiết lập →
                    </Button>
                ) : (
                    <>
                        <Button variant="outline" className="h-12 flex-1" onClick={() => setStep(1)}>
                            ← Quay lại
                        </Button>
                        <button
                            type="button"
                            onClick={handleGenerate}
                            disabled={isGenerating || activeItems.length === 0 || !billingProfileId}
                            className="flex h-12 flex-[1.4] items-center justify-center gap-2 rounded-xl bg-primary text-base font-bold text-white shadow-lg shadow-primary/30 transition-transform active:scale-[0.98] disabled:opacity-40"
                        >
                            {isGenerating ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileDown className="h-5 w-5" />}
                            {isGenerating ? 'Đang tạo…' : 'Xuất & Lưu'}
                        </button>
                    </>
                )}
            </footer>
        </div>
    )
}
