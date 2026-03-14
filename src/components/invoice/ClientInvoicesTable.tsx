'use client'

import { formatCurrency } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Download, Ban } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { voidInvoice } from '@/actions/invoice-actions'
import { useRouter } from 'next/navigation'

interface Invoice {
    id: string
    invoiceNumber: string
    issueDate: Date | string
    totalDue: number | string
    status: string
    depositDeducted: number | string
    items: any[]
}

export function ClientInvoicesTable({ invoices, clientId, workspaceId }: { invoices: Invoice[], clientId: number, workspaceId: string }) {
    const router = useRouter()
    const [isVoiding, setIsVoiding] = useState<string | null>(null)

    const handleVoid = async (id: string) => {
        if (!confirm('Are you sure you want to VOID this invoice? This will revert all associated tasks to UNBILLED status and refund any deposit.')) return

        setIsVoiding(id)
        try {
            const res = await voidInvoice(id, workspaceId)
            if (res.error) throw new Error(res.error)

            toast.success('Invoice voided successfully')
            router.refresh()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to void invoice')
        } finally {
            setIsVoiding(null)
        }
    }

    const handleDownload = async (invoice: Invoice) => {
        try {
            toast.info('Đang chuẩn bị bản PDF...')
            const url = `/api/invoices/${invoice.id}/download?workspaceId=${workspaceId}`
            const response = await fetch(url)
            
            if (!response.ok) {
                const errorText = await response.text()
                throw new Error(errorText || 'Failed to download')
            }

            const blob = await response.blob()
            const blobUrl = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = blobUrl
            a.download = `Invoice-${invoice.invoiceNumber}.pdf`
            document.body.appendChild(a)
            a.click()
            a.remove()
            window.URL.revokeObjectURL(blobUrl)
            
            toast.success('Hóa đơn đã được tải về!')
        } catch (error: any) {
            console.error(error)
            toast.error(`Lỗi tải xuống: ${error.message}`)
        }
    }

    if (invoices.length === 0) {
        return <div className="text-gray-500 italic text-center py-4">No invoices found.</div>
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="text-xs text-gray-400 border-b border-gray-700">
                        <th className="py-2">Invoice #</th>
                        <th className="py-2">Date</th>
                        <th className="py-2">Amount</th>
                        <th className="py-2">Status</th>
                        <th className="py-2 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="text-sm text-gray-300">
                    {invoices.map((inv) => (
                        <tr key={inv.id} className="border-b border-gray-800 hover:bg-white/5">
                            <td className="py-3 font-medium text-white">{inv.invoiceNumber}</td>
                            <td className="py-3 text-gray-500">
                                {new Date(inv.issueDate).toLocaleDateString()}
                            </td>
                            <td className="py-3 font-mono text-emerald-400">
                                {formatCurrency(Number(inv.totalDue))}
                            </td>
                            <td className="py-3">
                                <Badge variant={inv.status === 'VOID' ? 'destructive' : inv.status === 'PAID' ? 'default' : 'secondary'}
                                    className={inv.status === 'SENT' ? 'bg-blue-500/20 text-blue-400' : ''}>
                                    {inv.status}
                                </Badge>
                            </td>
                            <td className="py-3 text-right flex justify-end gap-2">
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-400 hover:text-white" onClick={() => handleDownload(inv)}>
                                    <Download size={16} />
                                </Button>
                                {inv.status !== 'VOID' && (
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-900/20"
                                        onClick={() => handleVoid(inv.id)}
                                        disabled={isVoiding === inv.id}
                                    >
                                        <Ban size={16} />
                                    </Button>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
