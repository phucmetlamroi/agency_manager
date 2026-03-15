'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function BottomNav({ role, workspaceId }: { role: string, workspaceId: string }) {
    const pathname = usePathname()

    const isActive = (path: string) => pathname === path

    return (
        <div className="md:hidden fixed bottom-0 left-0 right-0 py-3 pb-[calc(12px+env(safe-area-inset-bottom))] bg-black/80 backdrop-blur-md border-t border-white/10 flex items-center justify-around z-50">
            <Link href={`/${workspaceId}/dashboard`} className={`flex flex-col items-center gap-1 ${isActive(`/${workspaceId}/dashboard`) ? 'text-blue-400' : 'text-gray-400'}`}>
                <span className="text-xl">🏠</span>
                <span className="text-[10px] font-bold">Home</span>
            </Link>

            <Link href={role === 'ADMIN' ? `/${workspaceId}/admin` : `/${workspaceId}/dashboard`} className={`flex flex-col items-center gap-1 ${isActive(`/${workspaceId}/admin`) || (role !== 'ADMIN' && isActive(`/${workspaceId}/dashboard`) && false) ? 'text-blue-400' : 'text-gray-400'}`}>
                <span className="text-xl">📋</span>
                <span className="text-[10px] font-bold">Tasks</span>
            </Link>

            {role === 'ADMIN' && (
                <Link href={`/${workspaceId}/admin/users`} className={`flex flex-col items-center gap-1 ${isActive(`/${workspaceId}/admin/users`) ? 'text-blue-400' : 'text-gray-400'}`}>
                    <span className="text-xl">👥</span>
                    <span className="text-[10px] font-bold">Users</span>
                </Link>
            )}

            <Link 
                href={role === 'ADMIN' ? `/${workspaceId}/admin/schedule` : `/${workspaceId}/dashboard/schedule`} 
                onClick={(e) => {
                    if (role !== 'ADMIN') {
                        e.preventDefault();
                        alert('Tính năng Lịch làm việc cho nhân sự hiện đang được phát triển. Vui lòng quay lại sau!');
                    }
                }}
                className={`flex flex-col items-center gap-1 ${isActive(`/${workspaceId}/dashboard/schedule`) || isActive(`/${workspaceId}/admin/schedule`) ? 'text-blue-400' : 'text-gray-400'}`}
            >
                <span className="text-xl">📅</span>
                <span className="text-[10px] font-bold">Schedule</span>
            </Link>

            <Link href={role === 'ADMIN' ? `/${workspaceId}/admin/payroll` : `/${workspaceId}/dashboard`} className={`flex flex-col items-center gap-1 ${isActive(`/${workspaceId}/admin/payroll`) ? 'text-blue-400' : 'text-gray-400'}`}>
                <span className="text-xl">💰</span>
                <span className="text-[10px] font-bold">{role === 'ADMIN' ? 'Payroll' : 'Income'}</span>
            </Link>
        </div>
    )
}
