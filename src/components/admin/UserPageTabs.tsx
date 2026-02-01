'use client'

import { useState } from 'react'
import UserList from '@/components/admin/UserList'
import TimelineBoard from '@/components/admin/TimelineBoard'

export default function UserPageTabs({ users, currentUser }: { users: any[], currentUser: any }) {
    const [activeTab, setActiveTab] = useState<'users' | 'schedule'>('users')

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
                    onClick={() => setActiveTab('schedule')}
                    className={`px-4 py-2 rounded-md font-bold text-sm transition-all ${activeTab === 'schedule' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                >
                    📅 Lịch trình (Timeline)
                </button>
            </div>

            {/* CONTENT */}
            <div className="min-h-[600px]">
                {activeTab === 'users' && (
                    <UserList users={users} currentUser={currentUser} />
                )}

                {activeTab === 'schedule' && (
                    <TimelineBoard users={users} />
                )}
            </div>
        </div>
    )
}
