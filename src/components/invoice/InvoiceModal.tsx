'use client'

import { useState, useEffect, useMemo } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2, Edit2, FileDown, AlertTriangle } from 'lucide-react'
import { getUnbilledTasks, getBillingProfiles, createBillingProfile, createInvoiceRecord } from '@/actions/invoice-actions'
import { formatCurrency } from '@/lib/utils'
import { useRouter } from 'next/navigation'

interface InvoiceModalProps {
    isOpen: boolean
    onClose: () => void
    clientId: number
    clientName: string
    clientAddress?: string
    depositBalance?: number
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

export function InvoiceModal({ isOpen, onClose, clientId, clientName, clientAddress, depositBalance = 0 }: InvoiceModalProps) {
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

    // Editing Item State
    const [editingItemId, setEditingItemId] = useState<string | null>(null)
    const [editForm, setEditForm] = useState({ description: '', unitPrice: 0, quantity: 1 })


    // Fetch Data on Open
    useEffect(() => {
        if (isOpen) {
            const fetchData = async () => {
                setIsLoading(true)
                try {
                    const [tasksRes, profilesRes] = await Promise.all([
                        getUnbilledTasks(clientId),
                        getBillingProfiles()
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
            fetchData()
        }
    }, [isOpen, clientId])

    // Derived State: Items from Tasks + Manual
    const invoiceItems = useMemo(() => {
        const taskItems: InvoiceItem[] = tasks
            .filter(t => selectedTaskIds.includes(t.id))
            .map(t => ({
                id: t.id,
                description: t.title, // Initial description
                note: t.productLink ? `Ref: ${t.productLink}` : undefined,
                quantity: 1,
                unitPrice: Number(t.jobPriceUSD || 0),
                amount: Number(t.jobPriceUSD || 0),
                isManual: false,
                taskId: t.id
            }))

        // Merge with overrides? 
        // Logic: We need to allow editing descriptions/prices of Task Items.
        // So we should probably store ALL items in a state, initialized when tasks are selected?
        // OR: simpler approach for MVP:
        // Use a "overrides" map for task items.

        return [...taskItems, ...manualItems]
    }, [tasks, selectedTaskIds, manualItems])

    // CALCULATIONS
    const subtotal = invoiceItems.reduce((sum, item) => sum + (item.isManual ? item.amount : (overrides[item.id]?.amount ?? item.amount)), 0)
    // We need 'overrides' state to handle edits to task items
    const [overrides, setOverrides] = useState<Record<string, { description?: string, unitPrice?: number, quantity?: number, amount: number }>>({})

    const activeItems = useMemo(() => {
        return invoiceItems.map(item => {
            if (overrides[item.id]) {
                return { ...item, ...overrides[item.id] }
            }
            return item
        })
    }, [invoiceItems, overrides])

    const activeSubtotal = activeItems.reduce((sum, item) => sum + item.amount, 0)
    const activeTaxAmount = activeSubtotal * (taxPercent / 100)
    const activeTotalBeforeDeposit = activeSubtotal + activeTaxAmount

    // Deposit Logic
    const maxDeductible = Math.min(activeTotalBeforeDeposit, depositBalance)
    const depositDeducted = applyDeposit ? maxDeductible : 0
    const finalTotalDue = activeTotalBeforeDeposit - depositDeducted

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
                agencyName: 'Agency Manager',
                clientName,
                clientAddress,
                issueDate: new Date(issueDate),
                dueDate: dueDate ? new Date(dueDate) : undefined,
                items: activeItems.map(i => ({
                    description: i.description,
                    note: i.note,
                    quantity: i.quantity,
                    unitPrice: i.unitPrice,
                    amount: i.amount,
                    taskId: i.taskId
                })),
                subtotalAmount: activeSubtotal,
                taxPercent,
                taxAmount: activeTaxAmount,
                depositDeducted: depositDeducted,
                totalDue: finalTotalDue,
                billingSnapshot: profile,
                taskIds: selectedTaskIds
            }

            // 2. Create Record in DB
            toast.info('Saving invoice...')
            const saveRes = await createInvoiceRecord(dbPayload)
            if (saveRes.error) throw new Error(saveRes.error)

            toast.success('Invoice saved! Generating PDF...')

            // 3. Generate PDF (Download)
            const pdfPayload = {
                ...dbPayload,
                issueDate: issueDate || new Date().toLocaleDateString(),
                dueDate: dueDate || 'On Receipt',
                subtotal: activeSubtotal.toFixed(2),
                taxAmount: activeTaxAmount.toFixed(2),
                depositDeducted: depositDeducted.toFixed(2),
                totalDue: finalTotalDue.toFixed(2),
                items: activeItems.map(i => ({
                    description: i.description,
                    note: i.note,
                    quantity: i.quantity,
                    unitPrice: i.unitPrice.toFixed(2),
                    amount: i.amount.toFixed(2)
                })),
                bank: {
                    beneficiaryName: profile.beneficiaryName,
                    bankName: profile.bankName,
                    accountNumber: profile.accountNumber,
                    swiftCode: profile.swiftCode,
                    address: profile.address
                }
            }

            const response = await fetch('/api/invoices/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(pdfPayload)
            })

            if (!response.ok) throw new Error('Failed to generate')

            // Download Blob
            const blob = await response.blob()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `Invoice-${invoiceNumber}.pdf`
            document.body.appendChild(a)
            a.click()
            a.remove()

            toast.success('Invoice generated & downloaded!')
            // TODO: Call Action to Save Invoice Record to DB

        } catch (e) {
            console.error(e)
            toast.error('Error generating PDF')
        } finally {
            setIsGenerating(false)
        }
    }


    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-[95vw] w-[1400px] h-[90vh] p-0 gap-0 overflow-hidden flex flex-row">

                {/* LEFT PANEL: SELECTOR (30%) */}
                <div className="w-[350px] bg-gray-50 border-r border-gray-200 flex flex-col h-full">
                    <div className="p-4 border-b border-gray-200 bg-white">
                        <h2 className="font-bold text-lg">Create Invoice</h2>
                        <p className="text-xs text-gray-500">Select unbilled tasks to include</p>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                        {isLoading ? <Loader2 className="animate-spin text-gray-400 mx-auto mt-10" /> : (
                            tasks.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center mt-10">No unbilled tasks found.</p>
                            ) : (
                                tasks.map(task => (
                                    <div
                                        key={task.id}
                                        onClick={() => toggleTask(task.id)}
                                        className={`p-3 rounded-lg border cursor-pointer transition-all ${selectedTaskIds.includes(task.id) ? 'bg-blue-50 border-blue-500 shadow-sm' : 'bg-white border-gray-200 hover:border-blue-300'}`}
                                    >
                                        <div className="flex justify-between items-start mb-1">
                                            <div className="text-sm font-bold text-gray-800 line-clamp-2">{task.title}</div>
                                            <div className="text-xs font-mono font-bold text-green-600">${task.jobPriceUSD}</div>
                                        </div>
                                        <div className="flex justify-between items-center text-xs text-gray-400">
                                            <span>{new Date(task.createdAt).toLocaleDateString()}</span>
                                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${task.status === 'Hoàn tất' || task.status === 'Review' ? 'bg-green-100 text-green-700' : 'bg-gray-100'}`}>
                                                {task.status}
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )
                        )}

                        {/* Manual Item Button */}
                        <button
                            onClick={() => {
                                const newItem = { id: `man-${Date.now()}`, description: 'Extra Service', quantity: 1, unitPrice: 0, amount: 0, isManual: true }
                                setManualItems([...manualItems, newItem])
                                setEditingItemId(newItem.id)
                                setEditForm({ description: newItem.description, unitPrice: 0, quantity: 1 })
                            }}
                            className="w-full py-2 border border-dashed border-gray-300 rounded text-sm text-gray-500 hover:bg-gray-100 flex items-center justify-center gap-2"
                        >
                            <Plus size={14} /> Add Manual Item
                        </button>
                    </div>

                    <div className="p-4 border-t border-gray-200 bg-white space-y-3">
                        <div>
                            <label className="text-xs font-bold text-gray-500 mb-1 block">Billing Profile</label>
                            <select
                                value={billingProfileId}
                                onChange={e => setBillingProfileId(e.target.value)}
                                className="w-full text-sm border rounded p-2"
                            >
                                {billingProfiles.map(p => (
                                    <option key={p.id} value={p.id}>{p.profileName}</option>
                                ))}
                            </select>
                        </div>
                        <Button onClick={handleGenerate} disabled={isGenerating || activeItems.length === 0} className="w-full gap-2">
                            {isGenerating ? <Loader2 className="animate-spin" size={16} /> : <FileDown size={16} />}
                            Generate & Save
                        </Button>
                    </div>
                </div>

                {/* RIGHT PANEL: PREVIEW (70%) */}
                <div className="flex-1 bg-gray-100 flex flex-col h-full overflow-hidden">
                    <div className="h-14 border-b border-gray-200 bg-white flex items-center justify-between px-6">
                        <span className="font-bold text-gray-500 text-sm">LIVE PREVIEW</span>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold">Tax:</span>
                                <Input
                                    type="number"
                                    className="w-16 h-8 text-right"
                                    value={taxPercent}
                                    onChange={e => setTaxPercent(Number(e.target.value))}
                                />
                                <span className="text-xs">%</span>
                            </div>
                            {depositBalance > 0 && (
                                <div className="flex items-center gap-2 bg-yellow-50 px-3 py-1 rounded border border-yellow-200">
                                    <input
                                        type="checkbox"
                                        checked={applyDeposit}
                                        onChange={e => setApplyDeposit(e.target.checked)}
                                        id="use-deposit"
                                    />
                                    <label htmlFor="use-deposit" className="text-xs font-bold text-yellow-700 cursor-pointer">
                                        Use Deposit (-${maxDeductible})
                                    </label>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-8 flex justify-center">
                        <div className="bg-white shadow-xl w-[800px] min-h-[1000px] p-10 flex flex-col relative animate-fade-in text-gray-800 text-sm">

                            {/* HEADER */}
                            <div className="flex justify-between mb-10">
                                <div className="text-2xl font-bold">Agency Manager</div>
                                <div className="text-right">
                                    <h1 className="text-4xl font-bold text-gray-900 uppercase">INVOICE</h1>
                                    <div className="text-gray-500 mt-1"># {invoiceNumber}</div>
                                </div>
                            </div>

                            {/* META */}
                            <div className="grid grid-cols-2 gap-10 mb-10">
                                <div>
                                    <h3 className="text-xs font-bold text-gray-400 uppercase mb-1">Bill To</h3>
                                    <div className="font-bold text-lg text-black">{clientName}</div>
                                    <div className="text-gray-600 whitespace-pre-wrap">{clientAddress || 'No address on file'}</div>
                                </div>
                                <div className="text-right">
                                    <div className="mb-4">
                                        <h3 className="text-xs font-bold text-gray-400 uppercase mb-1">Date</h3>
                                        <input
                                            type="date"
                                            value={issueDate}
                                            onChange={e => setIssueDate(e.target.value)}
                                            className="text-right font-bold border-b border-dashed border-gray-300 focus:outline-none focus:border-blue-500 w-32"
                                        />
                                    </div>
                                    <div>
                                        <h3 className="text-xs font-bold text-gray-400 uppercase mb-1">Due Date</h3>
                                        <input
                                            type="text"
                                            value={dueDate}
                                            onChange={e => setDueDate(e.target.value)}
                                            placeholder="e.g. On Request"
                                            className="text-right font-bold border-b border-dashed border-gray-300 focus:outline-none focus:border-blue-500 w-32"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* TABLE */}
                            <div className="flex-1">
                                <table className="w-full mb-8">
                                    <thead>
                                        <tr className="border-b-2 border-gray-100">
                                            <th className="text-left py-2 text-xs font-bold text-gray-400 uppercase w-1/2">Description</th>
                                            <th className="text-right py-2 text-xs font-bold text-gray-400 uppercase">Qty</th>
                                            <th className="text-right py-2 text-xs font-bold text-gray-400 uppercase">Rate</th>
                                            <th className="text-right py-2 text-xs font-bold text-gray-400 uppercase">Amount</th>
                                            <th className="w-8"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {activeItems.map((item) => (
                                            <tr key={item.id} className="border-b border-gray-50 group hover:bg-gray-50 transition-colors">
                                                {editingItemId === item.id ? (
                                                    // EDIT MODE
                                                    <>
                                                        <td className="py-3">
                                                            <Input
                                                                value={editForm.description}
                                                                onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                                                                className="h-8 mb-1"
                                                            />
                                                        </td>
                                                        <td className="py-3 text-right">
                                                            <Input
                                                                type="number"
                                                                value={editForm.quantity}
                                                                onChange={e => setEditForm({ ...editForm, quantity: Number(e.target.value) })}
                                                                className="h-8 w-16 ml-auto"
                                                            />
                                                        </td>
                                                        <td className="py-3 text-right">
                                                            <Input
                                                                type="number"
                                                                value={editForm.unitPrice}
                                                                onChange={e => setEditForm({ ...editForm, unitPrice: Number(e.target.value) })}
                                                                className="h-8 w-24 ml-auto"
                                                            />
                                                        </td>
                                                        <td className="py-3 text-right font-bold font-mono">
                                                            ${(editForm.unitPrice * editForm.quantity).toFixed(2)}
                                                        </td>
                                                        <td className="py-3 text-right">
                                                            <button onClick={saveEditItem} className="text-green-600 hover:text-green-800"><Edit2 size={16} /></button>
                                                        </td>
                                                    </>
                                                ) : (
                                                    // VIEW MODE
                                                    <>
                                                        <td className="py-3 pr-4">
                                                            <div className="font-bold text-gray-800">{item.description}</div>
                                                            {item.note && <div className="text-xs text-gray-400 mt-1">{item.note}</div>}
                                                        </td>
                                                        <td className="py-3 text-right">{item.quantity}</td>
                                                        <td className="py-3 text-right text-gray-500">${item.unitPrice.toFixed(2)}</td>
                                                        <td className="py-3 text-right font-bold text-gray-800 font-mono">${item.amount.toFixed(2)}</td>
                                                        <td className="py-3 text-right opacity-0 group-hover:opacity-100 flex gap-2 justify-end items-center h-full">
                                                            <button onClick={() => handleEditItem(item)} className="text-blue-500 hover:text-blue-700 p-1"><Edit2 size={14} /></button>
                                                            {item.isManual && (
                                                                <button onClick={() => setManualItems(prev => prev.filter(m => m.id !== item.id))} className="text-red-500 hover:text-red-700 p-1"><Trash2 size={14} /></button>
                                                            )}
                                                        </td>
                                                    </>
                                                )}
                                            </tr>
                                        ))}
                                        {activeItems.length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="py-10 text-center text-gray-300 italic">Select tasks from the left or add manual items</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* TOTALS */}
                            <div className="flex justify-end mb-10">
                                <div className="w-64 space-y-2">
                                    <div className="flex justify-between text-gray-600">
                                        <span>Subtotal</span>
                                        <span>${activeSubtotal.toFixed(2)}</span>
                                    </div>
                                    {taxPercent > 0 && (
                                        <div className="flex justify-between text-gray-600">
                                            <span>Tax ({taxPercent}%)</span>
                                            <span>${activeTaxAmount.toFixed(2)}</span>
                                        </div>
                                    )}
                                    {depositDeducted > 0 && (
                                        <div className="flex justify-between text-red-600 font-medium">
                                            <span>Less Deposit</span>
                                            <span>-${depositDeducted.toFixed(2)}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between text-xl font-bold border-t-2 border-gray-900 pt-3 mt-3">
                                        <span>Total Due</span>
                                        <span>${finalTotalDue.toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* FOOTER */}
                            {billingProfiles.find(p => p.id === billingProfileId) && (
                                <div className="bg-gray-50 p-6 rounded-lg text-xs text-gray-600">
                                    <h4 className="font-bold uppercase text-gray-400 mb-2">Payment Information</h4>
                                    {(() => {
                                        const p = billingProfiles.find(p => p.id === billingProfileId)
                                        return (
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <span className="font-bold">Beneficiary:</span> {p.beneficiaryName} <br />
                                                    <span className="font-bold">Bank:</span> {p.bankName} <br />
                                                    <span className="font-bold">Account:</span> {p.accountNumber}
                                                </div>
                                                <div>
                                                    {p.swiftCode && <><span className="font-bold">SWIFT/BIC:</span> {p.swiftCode} <br /></>}
                                                    {p.address && <><span className="font-bold">Address:</span> {p.address}</>}
                                                </div>
                                            </div>
                                        )
                                    })()}
                                </div>
                            )}

                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
