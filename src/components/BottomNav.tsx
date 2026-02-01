'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function BottomNav({ role }: { role: string }) {
    const pathname = usePathname()

    const isActive = (path: string) => pathname === path

    return (
        <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white/10 backdrop-blur-md border-t border-white/10 flex items-center justify-around z-50">
            <Link href="/dashboard" className={`flex flex-col items-center gap-1 ${isActive('/dashboard') ? 'text-blue-400' : 'text-gray-400'}`}>
                <span className="text-xl">🏠</span>
                <span className="text-[10px] font-bold">Home</span>
            </Link>

            <Link href={role === 'ADMIN' ? '/admin' : '/dashboard'} className={`flex flex-col items-center gap-1 ${isActive('/admin') || (role !== 'ADMIN' && isActive('/dashboard') && false) ? 'text-blue-400' : 'text-gray-400'}`}>
                <span className="text-xl">📋</span>
                <span className="text-[10px] font-bold">Tasks</span>
            </Link>

            {role === 'ADMIN' && (
                <Link href="/admin/users" className={`flex flex-col items-center gap-1 ${isActive('/admin/users') ? 'text-blue-400' : 'text-gray-400'}`}>
                    <span className="text-xl">👥</span>
                    <span className="text-[10px] font-bold">Users</span>
                </Link>
            )}

            <Link href={role === 'ADMIN' ? '/admin/schedule' : '/dashboard/schedule'} className={`flex flex-col items-center gap-1 ${isActive('/dashboard/schedule') ? 'text-blue-400' : 'text-gray-400'}`}>
                <span className="text-xl">📅</span>
                <span className="text-[10px] font-bold">Lịch</span>
            </Link>

            <Link href={role === 'ADMIN' ? '/admin/payroll' : '/dashboard'} className={`flex flex-col items-center gap-1 ${isActive('/admin/payroll') ? 'text-blue-400' : 'text-gray-400'}`}>
                <span className="text-xl">💰</span>
                <span className="text-[10px] font-bold">{role === 'ADMIN' ? 'Payroll' : 'Income'}</span>
            </Link>
        </div>
    )
}
