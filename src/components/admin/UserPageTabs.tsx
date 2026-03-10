'use client'

import { useState } from 'react'
import UserList from '@/components/admin/UserList'
import PayrollTable from '@/components/admin/PayrollTable'

export default function UserPageTabs({ users, currentUser, agencies, profiles, workspaceId }: { users: any[], currentUser: any, agencies?: any[], profiles?: any[], workspaceId: string }) {
    const [activeTab, setActiveTab] = useState<'users' | 'payroll'>('users')

    return (
        <div>
            {/* TABS HEADER */}
            <div className="flex items-center gap-1 mb-6 bg-white/5 p-1 rounded-lg w-fit border border-white/10">
                <button
                    onClick={() => setActiveTab('users')}
                    className={`px-4 py-2 rounded-md font-bold text-sm transition-all ${activeTab === 'users' ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                >
                    👥 Danh sách & Cấp quyền
                </button>
                <button
                    onClick={() => setActiveTab('payroll')}
                    className={`px-4 py-2 rounded-md font-bold text-sm transition-all ${activeTab === 'payroll' ? 'bg-green-600 text-white shadow-lg shadow-green-500/30' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                >
                    💵 Bảng Lương Admin
                </button>
            </div>

            {/* CONTENT */}
            <div className="min-h-[600px]">
                {activeTab === 'users' && (
                    <UserList users={users} currentUser={currentUser} agencies={agencies} profiles={profiles} workspaceId={workspaceId} />
                )}

                {activeTab === 'payroll' && (
                    <PayrollTable users={users} workspaceId={workspaceId} />
                )}
            </div>
        </div>
    )
}
