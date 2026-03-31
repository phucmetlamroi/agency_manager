'use client'

import { useState, useEffect, useMemo } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2, Edit2, FileDown, AlertTriangle } from 'lucide-react'
import { getUnbilledTasks, getBillingProfiles, createBillingProfile, createInvoiceRecord } from '@/actions/invoice-actions'
import { formatCurrency } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import BillingProfileManager from './BillingProfileManager'

interface InvoiceModalProps {
    isOpen: boolean
    onClose: () => void
    clientId: number
    clientName: string
    clientAddress?: string
    depositBalance?: number
    workspaceId: string
}

interface InvoiceItem {
    id: string // Task ID or temp ID
    description: string
    note?: string
    quantity: number
    unitPrice: number
    amount: number
    isManual: boolean
    taskId?: string
}

export function InvoiceModal({ isOpen, onClose, clientId, clientName, clientAddress, depositBalance = 0, workspaceId }: InvoiceModalProps) {
    const router = useRouter()
    // Data State
    const [tasks, setTasks] = useState<any[]>([])
    const [billingProfiles, setBillingProfiles] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isGenerating, setIsGenerating] = useState(false)

    // Invoice State
    const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([])
    const [manualItems, setManualItems] = useState<InvoiceItem[]>([])
    const [billingProfileId, setBillingProfileId] = useState<string>('')
    const [invoiceNumber, setInvoiceNumber] = useState('')
    const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0])
    const [dueDate, setDueDate] = useState('')
    const [taxPercent, setTaxPercent] = useState(0) // Default 0
    const [applyDeposit, setApplyDeposit] = useState(false)
    const [groupByBrand, setGroupByBrand] = useState(true) // Default to Grouped View
    const [currency, setCurrency] = useState('$')


    // Customizable Fields
    const [customAgencyName, setCustomAgencyName] = useState('Agency Manager')
    const [customTitle, setCustomTitle] = useState('INVOICE')
    const [customClientAddress, setCustomClientAddress] = useState(clientAddress || '')
    const [dueDateLabel, setDueDateLabel] = useState('Balance Due')
    const [paymentLink, setPaymentLink] = useState('')
    const [customPrepaid, setCustomPrepaid] = useState(0)

    // Editing Item State
    const [editingItemId, setEditingItemId] = useState<string | null>(null)
    const [editForm, setEditForm] = useState({ description: '', unitPrice: 0, quantity: 1 })
    // We need 'overrides' state to handle edits to task items
    const [overrides, setOverrides] = useState<Record<string, { description?: string, unitPrice?: number, quantity?: number, amount: number }>>({})

    // Fetch Data on Open
    const fetchData = async () => {
        setIsLoading(true)
        try {
            const [tasksRes, profilesRes] = await Promise.all([
                getUnbilledTasks(clientId, workspaceId),
                getBillingProfiles(workspaceId)
            ])

            if (tasksRes.success) setTasks(tasksRes.data)
            if (profilesRes.success) {
                setBillingProfiles(profilesRes.data)
                // Select default
                const def = profilesRes.data.find((p: any) => p.isDefault)
                if (def) setBillingProfileId(def.id)
                else if (profilesRes.data.length > 0) setBillingProfileId(profilesRes.data[0].id)
            }

            // Auto-gen invoice number (Simple logic for now)
            const date = new Date()
            setInvoiceNumber(`INV-${date.getFullYear()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`)

        } catch (e) {
            toast.error('Failed to load data')
        } finally {
            setIsLoading(false)
        }
    }

    const refreshProfiles = async () => {
        const res = await getBillingProfiles(workspaceId)
        if (res.success && res.data) {
            setBillingProfiles(res.data)
            // Keep current selection if valid, else select default
            if (!res.data.find((p: any) => p.id === billingProfileId)) {
                const def = res.data.find((p: any) => p.isDefault)
                if (def) setBillingProfileId(def.id)
            }
        }
    }

    // Effect to update currency when profile changes
    useEffect(() => {
        const profile = billingProfiles.find(p => p.id === billingProfileId)
        if (profile) {
            setCurrency(profile.currency || '$')
        }
    }, [billingProfileId, billingProfiles])


    // Auto-select all tasks when loaded
    useEffect(() => {
        if (tasks.length > 0) {
            setSelectedTaskIds(tasks.map(t => t.id))
        }
    }, [tasks])

    // Group tasks for Selector
    const groupedTasks = useMemo(() => {
        const groups: Record<string, any[]> = {}
        tasks.forEach(t => {
            const brand = t.originalClientName || 'General'
            if (!groups[brand]) groups[brand] = []
            groups[brand].push(t)
        })
        return groups
    }, [tasks])

    useEffect(() => {
        if (isOpen) {
            fetchData()
        }
    }, [isOpen, clientId])

    // Derived State: Items from Tasks + Manual
    const invoiceItems = useMemo(() => {
        try {
            if (!Array.isArray(tasks)) return []

            // 1. Filter Selected
            const selectedTasks = tasks.filter(t => t && t.id && selectedTaskIds.includes(t.id))

            if (!groupByBrand) {
                // FLAT LIST (Itemized)
                const taskItems: InvoiceItem[] = selectedTasks.map(t => ({
                    id: t.id,
                    description: t.title || 'Untitled Task',
                    note: t.productLink ? `Ref: ${t.productLink}` : undefined,
                    quantity: 1,
                    unitPrice: Number(t.jobPriceUSD) || 0,
                    amount: Number(t.jobPriceUSD) || 0,
                    isManual: false,
                    taskId: t.id
                }))
                return [...taskItems, ...manualItems]
            }

            // 2. GROUPED LIST (Condensed)
            const groupedItems: InvoiceItem[] = []

            // Helper to find existing group
            const findGroup = (clientName: string) => groupedItems.find(i => i.taskId === `group-${clientName}`)

            selectedTasks.forEach(t => {
                const clientName = t.originalClientName || 'General' // Use the new field
                const amount = Number(t.jobPriceUSD) || 0

                // Check if we should group
                const existing = findGroup(clientName)

                if (existing) {
                    existing.quantity += 1
                    existing.amount += amount
                    // Average Unit Price
                    existing.unitPrice = existing.amount / existing.quantity
                } else {
                    groupedItems.push({
                        id: `group-${clientName}-${Date.now()}`, // Temp ID
                        description: `Production Services [${clientName}]`, // Simplified Description
                        note: `${selectedTasks.filter(st => (st.originalClientName || 'General') === clientName).length} tasks merged`,
                        quantity: 1,
                        unitPrice: amount,
                        amount: amount,
                        isManual: false,
                        taskId: `group-${clientName}` // Marker ID
                    })
                }
            })

            return [...groupedItems, ...manualItems]
        } catch (error) {
            console.error('Error generating invoice items:', error)
            return []
        }
    }, [tasks, selectedTaskIds, manualItems, groupByBrand])

    // CALCULATIONS
    const activeItems = useMemo(() => {
        return invoiceItems.map(item => {
            if (overrides[item.id]) {
                return { ...item, ...overrides[item.id] }
            }
            return item
        })
    }, [invoiceItems, overrides])

    const activeSubtotal = activeItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
    const activeTaxAmount = activeSubtotal * (Number(taxPercent) / 100)
    const activeTotalBeforeDeposit = activeSubtotal + activeTaxAmount

    // Deposit Logic
    const maxDeductible = Math.min(activeTotalBeforeDeposit, depositBalance || 0)
    const depositDeducted = applyDeposit ? maxDeductible : 0
    const totalDeducted = depositDeducted + customPrepaid
    const finalTotalDue = Math.max(0, activeTotalBeforeDeposit - totalDeducted)

    // Handlers
    const toggleTask = (taskId: string) => {
        setSelectedTaskIds(prev =>
            prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
        )
    }

    const handleEditItem = (item: any) => {
        setEditingItemId(item.id)
        setEditForm({
            description: item.description,
            unitPrice: item.unitPrice,
            quantity: item.quantity
        })
    }

    const saveEditItem = () => {
        if (!editingItemId) return

        const newAmount = editForm.unitPrice * editForm.quantity

        // Check if it's a task or manual
        const isTask = tasks.find(t => t.id === editingItemId)

        if (isTask) {
            setOverrides(prev => ({
                ...prev,
                [editingItemId]: {
                    description: editForm.description,
                    unitPrice: editForm.unitPrice,
                    quantity: editForm.quantity,
                    amount: newAmount
                }
            }))
        } else {
            // Manual item update
            setManualItems(prev => prev.map(m => m.id === editingItemId ? {
                ...m,
                description: editForm.description,
                unitPrice: editForm.unitPrice,
                quantity: editForm.quantity,
                amount: newAmount
            } : m))
        }
        setEditingItemId(null)
    }

    const handleGenerate = async () => {
        if (!billingProfileId) return toast.error('Please select a Billing Profile')
        if (activeItems.length === 0) return toast.error('Invoice is empty')

        setIsGenerating(true)
        try {
            const profile = billingProfiles.find(p => p.id === billingProfileId)

            // 1. Prepare Data for DB
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
                items: activeItems.map(i => ({
                    description: i.description,
                    note: i.note,
                    quantity: i.quantity,
                    unitPrice: i.unitPrice,
                    amount: i.amount,
                    taskId: (i.taskId && (i.taskId.startsWith('group-') || i.taskId.startsWith('man-'))) ? undefined : i.taskId
                })),
                subtotalAmount: activeSubtotal,
                taxPercent,
                taxAmount: activeTaxAmount,
                depositDeducted: totalDeducted,
                clientDepositDeducted: depositDeducted,
                totalDue: finalTotalDue,
                billingSnapshot: profile,
                taskIds: selectedTaskIds
            }

            toast.info('Saving invoice...')
            const saveRes = await createInvoiceRecord(dbPayload, workspaceId)
            if (saveRes.error) throw new Error(saveRes.error)

            toast.success('Invoice saved! Generating PDF...')

            const pdfPayload = {
                ...dbPayload,
                customTitle,
                dueDateLabel,
                paymentLink,
                currency,
                issueDate: issueDate || new Date().toLocaleDateString(),

                dueDate: dueDate || 'On Receipt',
                subtotal: activeSubtotal.toFixed(2),
                taxAmount: activeTaxAmount.toFixed(2),
                depositDeducted: totalDeducted > 0 ? totalDeducted.toFixed(2) : undefined,
                totalDue: finalTotalDue.toFixed(2),
                items: activeItems.map(i => ({
                    description: i.description,
                    note: i.note,
                    quantity: i.quantity,
                    unitPrice: `${currency}${i.unitPrice.toFixed(2)}`,
                    amount: `${currency}${i.amount.toFixed(2)}`
                })),

                bank: {
                    beneficiaryName: profile.beneficiaryName,
                    bankName: profile.bankName,
                    accountNumber: profile.accountNumber,
                    swiftCode: profile.swiftCode,
                    address: profile.address,
                    notes: profile.notes
                }
            }

            const response = await fetch('/api/invoices/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(pdfPayload)
            })

            if (!response.ok) {
                const errorText = await response.text()
                throw new Error(errorText || 'Failed to generate')
            }

            const blob = await response.blob()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `Invoice-${invoiceNumber}.pdf`
            document.body.appendChild(a)
            a.click()
            a.remove()

            toast.success('Invoice generated & downloaded!')

        } catch (e: any) {
            console.error(e)
            toast.error(`Error: ${e.message}`)
        } finally {
            setIsGenerating(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-[95vw] w-[1400px] h-[90vh] p-0 gap-0 overflow-hidden flex flex-row bg-zinc-900 border border-zinc-700">

                {/* LEFT PANEL: CONTROL (zinc-800) */}
                <div className="w-[420px] shrink-0 bg-zinc-800 border-r border-zinc-700 flex flex-col h-full">
                    <div className="px-5 py-4 border-b border-zinc-700">
                        <h2 className="font-extrabold text-lg text-white tracking-tight">Tạo Hóa Đơn</h2>
                        <p className="text-xs text-zinc-400 mt-0.5">Chọn tasks chưa xuất hóa đơn</p>
                    </div>

                    <div className="px-5 pt-4 pb-3 border-b border-zinc-700 space-y-3">
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Cấu hình</p>
                        <div className="flex gap-3">
                            <div className="flex-1 bg-zinc-900/50 rounded-xl border border-zinc-700 px-3 py-2 flex items-center gap-2">
                                <span className="text-[11px] font-semibold text-zinc-400 whitespace-nowrap">Tax %</span>
                                <input
                                    type="number"
                                    className="flex-1 bg-transparent text-right text-white font-bold text-sm focus:outline-none min-w-0"
                                    value={taxPercent}
                                    onChange={e => setTaxPercent(Number(e.target.value))}
                                />
                            </div>
                            <div className="flex-1 bg-zinc-900/50 rounded-xl border border-zinc-700 px-3 py-2 flex items-center gap-2">
                                <span className="text-[11px] font-semibold text-zinc-400 whitespace-nowrap">Prepaid {currency}</span>
                                <input
                                    type="number"
                                    className="flex-1 bg-transparent text-right text-red-400 font-bold text-sm focus:outline-none min-w-0"
                                    value={customPrepaid}
                                    onChange={e => setCustomPrepaid(Number(e.target.value))}
                                />
                            </div>

                        </div>

                        <div className="bg-zinc-900/50 rounded-xl border border-zinc-700 px-3 py-2 flex items-center gap-2">
                            <span className="text-[11px] font-semibold text-zinc-400 whitespace-nowrap">Payment Link</span>
                            <input
                                type="text"
                                placeholder="https://..."
                                className="flex-1 bg-transparent text-blue-400 text-xs font-medium focus:outline-none placeholder-zinc-600 min-w-0"
                                value={paymentLink}
                                onChange={e => setPaymentLink(e.target.value)}
                            />
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                            <button
                                onClick={() => setGroupByBrand(v => !v)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all duration-200 ${groupByBrand ? 'bg-indigo-500/20 border-indigo-500/60 text-indigo-300' : 'bg-zinc-700 border-zinc-600 text-zinc-400'}`}
                            >
                                <span className={`w-2 h-2 rounded-full ${groupByBrand ? 'bg-indigo-400' : 'bg-zinc-500'}`} />
                                Gộp theo Brand
                            </button>

                            {depositBalance > 0 && (
                                <button
                                    onClick={() => setApplyDeposit(v => !v)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all duration-200 ${applyDeposit ? 'bg-amber-500/20 border-amber-500/60 text-amber-300' : 'bg-zinc-700 border-zinc-600 text-zinc-400'}`}
                                >
                                    <span className={`w-2 h-2 rounded-full ${applyDeposit ? 'bg-amber-400' : 'bg-zinc-500'}`} />
                                    Dùng Deposit (-${maxDeductible})
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 custom-scrollbar">
                        {isLoading ? (
                            <div className="flex justify-center mt-10"><Loader2 className="animate-spin text-zinc-500" size={28} /></div>
                        ) : tasks.length === 0 ? (
                            <p className="text-sm text-zinc-500 text-center mt-10 italic">Không có task chưa xuất hóa đơn.</p>
                        ) : (
                            <Accordion type="multiple" defaultValue={Object.keys(groupedTasks)} className="space-y-2">
                                {Object.entries(groupedTasks).map(([brand, brandTasks]) => (
                                    <AccordionItem key={brand} value={brand} className="border border-zinc-700 rounded-xl bg-zinc-900/40 px-0 overflow-hidden">
                                        <AccordionTrigger className="px-4 py-2.5 hover:no-underline hover:bg-zinc-700/30 transition-colors">
                                            <div className="flex justify-between items-center w-full mr-2">
                                                <span className="font-bold text-sm text-zinc-200">{brand}</span>
                                                <span className="text-[11px] text-zinc-500 font-normal bg-zinc-800 px-2 py-0.5 rounded-full">{brandTasks.length} tasks</span>
                                            </div>
                                        </AccordionTrigger>
                                        <AccordionContent className="px-3 pb-3 pt-0">
                                            <div className="space-y-1.5 mt-2">
                                                {brandTasks.map(task => (
                                                    <div
                                                        key={task.id}
                                                        onClick={() => toggleTask(task.id)}
                                                        className={`p-2.5 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${selectedTaskIds.includes(task.id) ? 'bg-indigo-500/15 border-indigo-500/40' : 'bg-zinc-800/60 border-zinc-700 hover:border-indigo-500/30'}`}
                                                    >
                                                        <div className="flex items-center gap-3 overflow-hidden">
                                                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all shrink-0 ${selectedTaskIds.includes(task.id) ? 'bg-indigo-500 border-indigo-500' : 'border-zinc-600 bg-transparent'}`}>
                                                                {selectedTaskIds.includes(task.id) && <Plus className="text-white rotate-45" size={10} />}
                                                            </div>
                                                            <div className="flex flex-col min-w-0">
                                                                 <div className="text-xs font-semibold text-zinc-200 truncate">{task.title}</div>
                                                                <div className="text-[10px] text-zinc-500 mt-0.5">{new Date(task.createdAt).toLocaleDateString('vi-VN')}</div>
                                                            </div>
                                                        </div>
                                                        <div className="text-xs font-bold text-emerald-400 whitespace-nowrap ml-2 shrink-0">
                                                            {formatCurrency(task.jobPriceUSD)}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </AccordionContent>
                                    </AccordionItem>
                                ))}
                            </Accordion>
                        )}

                        <button
                            onClick={() => {
                                const newItem = { id: `man-${Date.now()}`, description: 'Extra Service', quantity: 1, unitPrice: 0, amount: 0, isManual: true }
                                setManualItems([...manualItems, newItem])
                                setEditingItemId(newItem.id)
                                setEditForm({ description: newItem.description, unitPrice: 0, quantity: 1 })
                            }}
                            className="w-full py-2.5 border border-dashed border-zinc-700 rounded-xl text-sm text-zinc-500 hover:border-indigo-500/50 hover:text-indigo-400 hover:bg-indigo-500/5 flex items-center justify-center gap-2 transition-all"
                        >
                            <Plus size={14} /> Thêm hạng mục thủ công
                        </button>
                    </div>

                    <div className="px-5 py-5 border-t border-zinc-700 bg-zinc-800 space-y-4 shrink-0 shadow-[0_-10px_20px_rgba(0,0,0,0.1)]">
                        <div className="space-y-3">
                            <div className="flex justify-between items-center px-1">
                                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Hồ sơ thanh toán</label>
                                <BillingProfileManager
                                    currentProfileId={billingProfileId}
                                    workspaceId={workspaceId}
                                    onProfileSelect={(p) => {
                                        refreshProfiles()
                                        setBillingProfileId(p.id)
                                    }}
                                />
                            </div>
                            
                            <select
                                className="w-full h-11 rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer hover:border-zinc-500"
                                value={billingProfileId}
                                onChange={e => setBillingProfileId(e.target.value)}
                            >
                                <option value="">-- Chọn hồ sơ thanh toán --</option>
                                {billingProfiles.map(p => (
                                    <option key={p.id} value={p.id}>{p.profileName} ({p.bankName})</option>
                                ))}
                            </select>
                        </div>

                        <button
                            onClick={handleGenerate}
                            disabled={isGenerating || activeItems.length === 0}
                            className="w-full h-12 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:scale-[1.02] active:scale-[0.98] text-white font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-900/40 disabled:opacity-40 disabled:cursor-not-allowed group"
                        >
                            {isGenerating ? <Loader2 className="animate-spin" size={18} /> : <FileDown size={18} className="group-hover:translate-y-0.5 transition-transform" />}
                            {isGenerating ? 'Đang tạo...' : 'Xuất & Lưu'}
                        </button>
                    </div>
                </div>

                {/* RIGHT PANEL: LIVE PREVIEW (zinc-950) */}
                <div className="flex-1 bg-zinc-950 flex flex-col h-full overflow-hidden">
                    <div className="h-12 border-b border-zinc-800 flex items-center px-6 gap-4 shrink-0">
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Live Preview</span>
                        </div>
                        <span className="ml-auto text-[11px] text-zinc-600 font-mono">{invoiceNumber}</span>
                    </div>

                    <div className="flex-1 overflow-y-auto py-16 px-10 flex justify-center custom-scrollbar bg-zinc-950">
                        <div className="bg-white shadow-[0_40px_100px_rgba(0,0,0,0.8)] w-[760px] min-h-[1050px] p-12 flex flex-col relative text-gray-900 text-sm rounded-sm mb-10">

                            <div className="flex justify-between mb-10">
                                <div className="text-2xl font-bold text-gray-900">
                                    <input
                                        type="text"
                                        value={customAgencyName}
                                        onChange={e => setCustomAgencyName(e.target.value)}
                                        className="font-bold border-b border-transparent hover:border-gray-200 focus:outline-none focus:border-indigo-400 bg-transparent transition-colors"
                                        style={{ width: `${Math.max(10, customAgencyName.length)}ch` }}
                                    />
                                </div>
                                <div className="text-right">
                                    <input
                                        type="text"
                                        value={customTitle}
                                        onChange={e => setCustomTitle(e.target.value.toUpperCase())}
                                        className="text-4xl font-black text-gray-900 uppercase text-right border-b border-transparent hover:border-gray-200 focus:outline-none focus:border-indigo-400 bg-transparent tracking-tight transition-colors leading-none"
                                        style={{ width: `${Math.max(6, customTitle.length)}ch` }}
                                    />
                                    <div className="text-gray-400 text-sm mt-2 font-mono tracking-wide"># {invoiceNumber}</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-12 mb-10 border-t border-gray-100 pt-8">
                                <div>
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Bill To</p>
                                    <div className="font-bold text-xl text-gray-900 mb-1">{clientName}</div>
                                    <textarea
                                        value={customClientAddress}
                                        onChange={e => setCustomClientAddress(e.target.value)}
                                        placeholder="Thêm địa chỉ khách hàng..."
                                        rows={3}
                                        className="w-full bg-transparent border border-transparent hover:border-gray-100 focus:border-indigo-200 focus:outline-none resize-none text-gray-500 text-sm rounded transition-colors"
                                    />
                                </div>
                                <div className="text-right space-y-4">
                                    <div className="flex flex-col items-end">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Ngày xuất</p>
                                        <input
                                            type="date"
                                            value={issueDate}
                                            onChange={e => setIssueDate(e.target.value)}
                                            className="text-right font-bold text-gray-800 border-b border-dashed border-gray-200 focus:outline-none focus:border-indigo-400 bg-transparent"
                                        />
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <input
                                            type="text"
                                            value={dueDateLabel}
                                            onChange={e => setDueDateLabel(e.target.value)}
                                            className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-right bg-transparent border-b border-transparent hover:border-gray-100 focus:outline-none focus:border-indigo-300 transition-colors"
                                            style={{ width: `${Math.max(8, dueDateLabel.length + 2)}ch` }}
                                        />
                                        <input
                                            type="text"
                                            value={dueDate}
                                            onChange={e => setDueDate(e.target.value)}
                                            placeholder="e.g. On Request"
                                            className="text-right font-bold text-gray-800 border-b border-dashed border-gray-200 focus:outline-none focus:border-indigo-400 bg-transparent placeholder-gray-300"
                                            style={{ width: '10rem' }}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex-1 min-h-[400px]">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b-2 border-gray-900">
                                            <th className="text-left pb-3 text-[11px] font-black text-gray-500 uppercase tracking-wider w-[45%]">Mô tả</th>
                                            <th className="text-center pb-3 text-[11px] font-black text-gray-500 uppercase tracking-wider w-14">SL</th>
                                            <th className="text-right pb-3 text-[11px] font-black text-gray-500 uppercase tracking-wider">Đơn giá</th>
                                            <th className="text-right pb-3 text-[11px] font-black text-gray-500 uppercase tracking-wider">Thành tiền</th>
                                            <th className="w-10" />
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {activeItems.map(item => (
                                            <tr key={item.id} className="group hover:bg-gray-50/50 transition-colors">
                                                {editingItemId === item.id ? (
                                                    <>
                                                        <td className="py-3 pr-2">
                                                            <Input value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} className="h-8 text-sm bg-white" />
                                                        </td>
                                                        <td className="py-3 text-center">
                                                            <Input type="number" value={editForm.quantity} onChange={e => setEditForm({ ...editForm, quantity: Number(e.target.value) })} className="h-8 w-14 mx-auto text-center bg-white" />
                                                        </td>
                                                        <td className="py-3 text-right">
                                                            <Input type="number" value={editForm.unitPrice} onChange={e => setEditForm({ ...editForm, unitPrice: Number(e.target.value) })} className="h-8 w-24 ml-auto text-right bg-white" />
                                                        </td>
                                                        <td className="py-3 text-right font-bold font-mono text-gray-900">
                                                            {currency}{(editForm.unitPrice * editForm.quantity).toFixed(2)}
                                                        </td>
                                                        <td className="py-3 text-center">
                                                            <button onClick={saveEditItem} className="text-emerald-600 hover:text-emerald-800 p-1"><Edit2 size={15} /></button>
                                                        </td>
                                                    </>
                                                ) : (
                                                    <>
                                                        <td className="py-4 pr-4">
                                                            <div className="font-bold text-gray-900">{item.description}</div>
                                                            {item.note && <div className="text-[11px] text-gray-400 font-medium mt-0.5">{item.note}</div>}
                                                        </td>
                                                        <td className="py-4 text-center text-gray-600 font-medium">{item.quantity}</td>
                                                        <td className="py-4 text-right text-gray-500 font-mono">{currency}{item.unitPrice.toFixed(2)}</td>
                                                        <td className="py-4 text-right font-bold text-gray-900 font-mono">{currency}{item.amount.toFixed(2)}</td>
                                                        <td className="py-4 text-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <div className="flex items-center justify-center gap-1">
                                                                <button onClick={() => handleEditItem(item)} className="text-indigo-500 hover:text-indigo-700 p-1"><Edit2 size={13} /></button>
                                                                {item.isManual && (
                                                                    <button onClick={() => setManualItems(prev => prev.filter(m => m.id !== item.id))} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={13} /></button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </>
                                                )}
                                            </tr>
                                        ))}
                                        {activeItems.length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="py-20 text-center text-gray-300 italic text-sm">Chọn tasks ở bên trái hoặc thêm hạng mục thủ công</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <div className="mt-12 border-t-2 border-gray-100 pt-10">
                                <div className="flex flex-col md:flex-row gap-10">
                                    <div className="flex-1">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-5 flex items-center gap-2">
                                            Chi tiết thanh toán
                                            <span className="text-[11px] font-normal text-gray-300 normal-case italic">(Có thể sửa nhanh trực tiếp)</span>
                                        </p>
                                        <div className="bg-gray-50/80 rounded-2xl p-6 border border-gray-100 space-y-4">
                                            {(() => {
                                                const p = billingProfiles.find(p => p.id === billingProfileId)
                                                return (
                                                    <div className="space-y-4 text-[13px]">
                                                        <div className="flex flex-col gap-1">
                                                            <span className="text-[10px] font-bold text-gray-400 uppercase">Beneficiary Name</span>
                                                            <input 
                                                                className="font-bold text-gray-900 bg-transparent border-b border-transparent hover:border-gray-200 focus:outline-none focus:border-indigo-400 w-full px-1 py-0.5 transition-all"
                                                                defaultValue={p?.beneficiaryName || ''}
                                                            />
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div className="flex flex-col gap-1">
                                                                <span className="text-[10px] font-bold text-gray-400 uppercase">Bank Name</span>
                                                                <input 
                                                                    className="font-bold text-gray-900 bg-transparent border-b border-transparent hover:border-gray-200 focus:outline-none focus:border-indigo-400 w-full px-1 py-0.5 transition-all"
                                                                    defaultValue={p?.bankName || ''}
                                                                />
                                                            </div>
                                                            <div className="flex flex-col gap-1">
                                                                <span className="text-[10px] font-bold text-gray-400 uppercase">Account Number</span>
                                                                <input 
                                                                    className="font-mono font-bold text-indigo-600 bg-indigo-50/50 px-2 py-1 rounded focus:outline-none focus:ring-1 focus:ring-indigo-400 w-full transition-all"
                                                                    defaultValue={p?.accountNumber || ''}
                                                                />
                                                            </div>
                                                        </div>
                                                        {paymentLink && (
                                                            <div className="mt-2 p-3 bg-white rounded-xl border border-blue-50 shadow-sm flex flex-col gap-1">
                                                                <span className="text-[9px] font-black text-blue-400 uppercase tracking-tight">Payment Link</span>
                                                                <span className="text-blue-600 font-medium break-all text-xs">{paymentLink}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                )
                                            })()}
                                        </div>
                                    </div>

                                    <div className="w-72 space-y-3">
                                        <div className="flex justify-between text-gray-500 text-sm">
                                            <span className="font-medium">Tạm tính</span>
                                            <span className="font-mono font-semibold">{currency}{activeSubtotal.toFixed(2)}</span>
                                        </div>
                                        {taxPercent > 0 && (
                                            <div className="flex justify-between text-gray-500 text-sm">
                                                <span className="font-medium">Thuế ({taxPercent}%)</span>
                                                <span className="font-mono font-semibold">{currency}{activeTaxAmount.toFixed(2)}</span>
                                            </div>
                                        )}
                                        {totalDeducted > 0 && (
                                            <div className="flex justify-between text-red-500 text-sm">
                                                <span className="font-medium">Giảm trừ / Trả trước</span>
                                                <span className="font-mono font-semibold">-{currency}{totalDeducted.toFixed(2)}</span>
                                            </div>
                                        )}
                                        <div className="flex flex-col items-end pt-5 mt-2 border-t-2 border-gray-900">
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Tổng cộng thanh toán</span>
                                            <div className="text-3xl font-black text-gray-900 font-mono tracking-tighter">
                                                {currency}{finalTotalDue.toFixed(2)}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>

            </DialogContent>
        </Dialog>
    )
}
