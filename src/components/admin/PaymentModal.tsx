'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { confirmPayment } from '@/actions/payroll-actions'
import { toast } from 'sonner'
import { Check, Copy, CreditCard, X, ScanLine } from 'lucide-react'
import Image from 'next/image'

type Props = {
    isOpen: boolean
    onClose: () => void
    user: any
    payrollData: {
        month: number
        year: number
        totalAmount: number
        baseSalary: number
        bonus: number
    }
    workspaceId: string
}

export default function PaymentModal({ isOpen, onClose, user, payrollData, workspaceId }: Props) {
    const [loading, setLoading] = useState(false)

    if (!isOpen) return null

    async function handleConfirm() {
        setLoading(true)
        const res = await confirmPayment({
            userId: user.id,
            month: payrollData.month,
            year: payrollData.year,
            totalAmount: payrollData.totalAmount,
            baseSalary: payrollData.baseSalary,
            bonus: payrollData.bonus
        }, workspaceId)

        setLoading(false)
        if (res.success) {
            toast.success('Thanh toán thành công! Đã cập nhật trạng thái.')
            onClose()
        } else {
            toast.error('Lỗi thanh toán')
        }
    }

    const copyAccount = () => {
        navigator.clipboard.writeText(user.paymentAccountNum || '')
        toast.success('Đã copy số tài khoản')
    }

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="relative w-full max-w-lg border rounded-[26px] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
                    style={{ backgroundColor: '#0A0A0A', borderColor: 'rgba(139,92,246,0.15)', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                >
                    {/* Header */}
                    <div className="p-4 border-b flex justify-between items-center shrink-0" style={{ borderColor: 'rgba(139,92,246,0.1)', backgroundColor: 'rgba(139,92,246,0.04)' }}>
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <CreditCard className="w-5 h-5" style={{ color: '#D8B4FE' }} />
                            Thanh Toán Lương
                        </h3>
                        <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full text-gray-400">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar">

                        {/* Salary Info */}
                        <div className="text-center shrink-0">
                            <div className="text-sm text-gray-400 mb-1">Tổng thực nhận</div>
                            <div className="text-4xl font-black bg-gradient-to-r from-[#8B5CF6] to-[#D8B4FE] bg-clip-text text-transparent">
                                {payrollData.totalAmount.toLocaleString()} đ
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                                {user.nickname} • {payrollData.month}/{payrollData.year}
                            </div>
                        </div>

                        {/* QR Scanner Area */}
                        <div className="relative aspect-square w-full max-w-[280px] mx-auto bg-black rounded-xl overflow-hidden border border-[rgba(139,92,246,0.2)] shadow-inner group shrink-0">
                            {user.paymentQrUrl ? (
                                <>
                                    <Image
                                        src={user.paymentQrUrl}
                                        alt="QR Payment"
                                        fill
                                        className="object-contain p-4"
                                    />
                                    {/* Scan Line Animation */}
                                    <motion.div
                                        className="absolute w-full h-1 bg-[#8B5CF6]/60 shadow-[0_0_10px_rgba(139,92,246,0.8)]"
                                        animate={{ top: ['0%', '100%', '0%'] }}
                                        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                                    />
                                    <div className="absolute inset-0 bg-[rgba(139,92,246,0.05)] pointer-events-none" />
                                </>
                            ) : (
                                <div className="flex items-center justify-center h-full text-gray-500 italic">
                                    Chưa cập nhật QR
                                </div>
                            )}
                        </div>

                        <div className="mt-auto flex flex-col gap-4">
                            {/* Bank Details */}
                            <div className="rounded-lg p-3 flex justify-between items-center border" style={{ backgroundColor: '#121016', borderColor: 'rgba(139,92,246,0.1)' }}>
                                <div>
                                    <div className="text-xs text-gray-500 uppercase">Ngân hàng</div>
                                    <div className="font-bold text-gray-200">{user.paymentBankName || '---'}</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-xs text-gray-500 uppercase">STK</div>
                                    <button
                                        onClick={copyAccount}
                                        className="flex items-center gap-2 font-mono text-[#D8B4FE] hover:text-[#C4A5F5] hover:underline"
                                    >
                                        {user.paymentAccountNum || '---'}
                                        <Copy className="w-3 h-3" />
                                    </button>
                                </div>
                            </div>

                            {/* Action */}
                            <button
                                onClick={handleConfirm}
                                disabled={loading}
                                className="w-full py-3 bg-gradient-to-r from-[#8B5CF6] to-[#A855F7] text-white font-bold rounded-xl shadow-lg shadow-violet-500/30 hover:scale-[1.02] hover:brightness-110 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                            >
                                {loading ? (
                                    'Processing...'
                                ) : (
                                    <>
                                        <Check className="w-5 h-5" />
                                        Xác nhận đã chuyển khoản
                                    </>
                                )}
                            </button>
                        </div>

                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    )
}
