import { useState } from 'react'
import UserList from '@/components/admin/UserList'
import TimelineBoard from '@/components/admin/TimelineBoard'
import FocusBoard from '@/components/admin/FocusBoard'

export default function UserPageTabs({ users, currentUser }: { users: any[], currentUser: any }) {
    const [activeTab, setActiveTab] = useState<'users' | 'schedule' | 'focus'>('users')
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null)

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
                <button
                    onClick={() => setActiveTab('focus')}
                    className={`px-4 py-2 rounded-md font-bold text-sm transition-all ${activeTab === 'focus' ? 'bg-orange-600 text-white shadow-lg shadow-orange-500/30' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                >
                    📝 Sổ Việc Tiêu Điểm
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

                {activeTab === 'focus' && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 h-[600px]">
                        {/* User Selector for Focus Mode */}
                        <div className="md:col-span-1 bg-white/5 border border-white/10 rounded-xl overflow-hidden flex flex-col">
                            <h3 className="p-4 font-bold text-gray-400 border-b border-white/10">Chọn Nhân viên</h3>
                            <div className="overflow-y-auto flex-1 p-2 space-y-1">
                                {users.filter(u => u.role !== 'ADMIN').map(u => (
                                    <button
                                        key={u.id}
                                        onClick={() => setSelectedUserId(u.id)}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${selectedUserId === u.id ? 'bg-orange-500/20 text-orange-400 border border-orange-500/50' : 'text-gray-400 hover:bg-white/5'}`}
                                    >
                                        <span>{u.nickname || u.username}</span>
                                        {selectedUserId === u.id && <span>✨</span>}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Board */}
                        <div className="md:col-span-3">
                            {selectedUserId ? (
                                <FocusBoard userId={selectedUserId} />
                            ) : (
                                <div className="h-full flex items-center justify-center text-gray-500 bg-white/5 rounded-xl border border-white/10 border-dashed">
                                    👈 Vui lòng chọn nhân viên để giao việc
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
