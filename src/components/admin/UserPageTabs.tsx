'use client'

import { useState } from 'react'
import UserList from '@/components/admin/UserList'
import PayrollTable from '@/components/admin/PayrollTable'
import ProfileManagement from '@/components/admin/ProfileManagement'

export default function UserPageTabs({ users, currentUser, profiles, incomingRequests, workspaceId }: { users: any[], currentUser: any, profiles?: any[], incomingRequests?: any[], workspaceId: string }) {
    const [activeTab, setActiveTab] = useState<'users' | 'payroll' | 'profiles'>('users')
    const isSuperAdmin = currentUser?.username === 'admin'

    return (
        <div>
            {/* TABS HEADER */}
            <div className="flex flex-wrap items-center gap-2 mb-6 bg-white/5 p-1.5 rounded-xl w-fit border border-white/10">
                <button
                    onClick={() => setActiveTab('users')}
                    className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'users' ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                >
                    👥 Danh sách & Cấp quyền
                </button>
                <button
                    onClick={() => setActiveTab('payroll')}
                    className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'payroll' ? 'bg-green-600 text-white shadow-lg shadow-green-500/30' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                >
                    💵 Bảng Lương Admin
                </button>
                {isSuperAdmin && (
                    <button
                        onClick={() => setActiveTab('profiles')}
                        className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'profiles' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                    >
                        🏢 Quản lý Teams
                    </button>
                )}
            </div>

            {/* CONTENT */}
            <div className="min-h-[600px]">
                {activeTab === 'users' && (
                    <UserList 
                        users={users} 
                        currentUser={currentUser} 
                        profiles={profiles} 
                        incomingRequests={incomingRequests} 
                        workspaceId={workspaceId} 
                    />
                )}

                {activeTab === 'payroll' && (
                    <PayrollTable users={users} workspaceId={workspaceId} />
                )}

                {activeTab === 'profiles' && isSuperAdmin && (
                    <ProfileManagement initialProfiles={profiles || []} />
                )}
            </div>
        </div>
    )
}
