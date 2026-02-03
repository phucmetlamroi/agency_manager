'use client'

import { useState } from 'react'
import PaymentModal from './PaymentModal'
import { format } from 'date-fns'
import { BadgeDollarSign, CheckCircle2, CircleDashed } from 'lucide-react'

type UserWithPayroll = {
    id: string
    username: string
    nickname: string | null
    paymentQrUrl: string | null
    paymentBankName: string | null
    paymentAccountNum: string | null
    payrolls: any[] // Filtered for current month
    tasks: { wageVND: number | null, value: number, status: string }[] // Filtered for current month
}

export default function PayrollTable({ users }: { users: UserWithPayroll[] }) {
    const [selectedUser, setSelectedUser] = useState<UserWithPayroll | null>(null)
    const [isModalOpen, setIsModalOpen] = useState(false)

    const now = new Date()
    const currentMonth = now.getMonth() + 1
    const currentYear = now.getFullYear()

    return (
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden backdrop-blur-sm">
            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
                <h3 className="font-bold text-gray-200 flex items-center gap-2">
                    <BadgeDollarSign className="w-5 h-5 text-green-400" />
                    Bảng Lương Tháng {currentMonth}/{currentYear}
                </h3>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-black/20 text-gray-400 uppercase text-xs">
                        <tr>
                            <th className="px-6 py-3">Nhân viên</th>
                            <th className="px-6 py-3 text-center">Tasks (Tháng này)</th>
                            <th className="px-6 py-3 text-right">Lương Cơ Bản</th>
                            <th className="px-6 py-3 text-right">Thưởng</th>
                            <th className="px-6 py-3 text-right">Tổng Thực Nhận</th>
                            <th className="px-6 py-3 text-center">Trạng Thái</th>
                            <th className="px-6 py-3 text-right">Hành động</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {users.filter(u => u.username !== 'admin').map(user => {
                            // Calculate Financials
                            const validTasks = user.tasks || []
                            const baseSalary = validTasks.reduce((acc, t) => acc + (t.wageVND || 0), 0)

                            // Check existing payroll record
                            const payrollRecord = user.payrolls[0] // Assuming passed with filter

                            const bonus = payrollRecord?.bonus || 0
                            // If we had a separate Bonus Module calculation, we'd pull it here or use the Record.
                            // For UNPAID, maybe we should fetch 'MonthlyBonus' table? 
                            // For simplicity MVP, we use the record if exists, else 0 (or manual input in future).

                            const totalAmount = baseSalary + bonus
                            const isPaid = payrollRecord?.status === 'PAID'

                            return (
                                <tr key={user.id} className="hover:bg-white/5 transition-colors">
                                    <td className="px-6 py-4 font-medium text-white">
                                        <div className="flex flex-col">
                                            <span>{user.nickname || user.username}</span>
                                            <span className="text-xs text-gray-500">{user.username}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="px-2 py-1 bg-white/10 rounded text-xs">
                                            {validTasks.length}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right font-mono text-gray-300">
                                        {baseSalary.toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 text-right font-mono text-yellow-400">
                                        {bonus > 0 ? `+${bonus.toLocaleString()}` : '-'}
                                    </td>
                                    <td className="px-6 py-4 text-right font-bold text-lg text-green-400">
                                        {totalAmount.toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        {isPaid ? (
                                            <span className="inline-flex items-center gap-1 text-green-400 bg-green-400/10 px-2 py-1 rounded-full text-xs font-bold border border-green-400/20">
                                                <CheckCircle2 className="w-3 h-3" /> PAID
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 text-gray-400 bg-gray-500/10 px-2 py-1 rounded-full text-xs font-bold border border-gray-500/20">
                                                <CircleDashed className="w-3 h-3" /> UNPAID
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {!isPaid && (
                                            <button
                                                onClick={() => {
                                                    setSelectedUser(user)
                                                    setIsModalOpen(true)
                                                }}
                                                className="bg-gradient-to-r from-blue-600 to-cyan-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:brightness-110 hover:scale-105 transition-all shadow-[0_0_10px_rgba(59,130,246,0.3)] flex items-center gap-2 ml-auto"
                                            >
                                                Thanh toán
                                            </button>
                                        )}
                                        {isPaid && (
                                            <span className="text-xs text-gray-600 italic">Is Paid</span>
                                        )}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {selectedUser && (
                <PaymentModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    user={selectedUser}
                    payrollData={{
                        month: currentMonth,
                        year: currentYear,
                        totalAmount: (selectedUser.tasks?.reduce((acc, t) => acc + (t.wageVND || 0), 0) || 0) + (selectedUser.payrolls[0]?.bonus || 0),
                        baseSalary: selectedUser.tasks?.reduce((acc, t) => acc + (t.wageVND || 0), 0) || 0,
                        bonus: selectedUser.payrolls[0]?.bonus || 0
                    }}
                />
            )}
        </div>
    )
}
