'use client'

import { useState } from 'react'
import CreateTaskForm from '@/components/CreateTaskForm'
import BulkCreateTaskForm from '@/components/BulkCreateTaskForm'

type User = {
    id: string
    username: string
    reputation: number
    role: string
}

export default function TaskCreationManager({ users }: { users: User[] }) {
    const [mode, setMode] = useState<'SINGLE' | 'BATCH'>('SINGLE')

    return (
        <div className="glass-panel" style={{ padding: '1.5rem', height: 'fit-content' }}>
            <div className="flex justify-between items-center mb-4">
                <h3 style={{ color: 'var(--secondary)', margin: 0 }}>
                    {mode === 'SINGLE' ? 'Giao Việc (Đơn)' : 'Giao Việc (Lô)'}
                </h3>

                {/* Toggle Switch */}
                <div className="flex bg-[#222] rounded p-1 border border-[#333]">
                    <button
                        onClick={() => setMode('SINGLE')}
                        className={`px-3 py-1 text-xs rounded transition-all ${mode === 'SINGLE' ? 'bg-blue-600 text-white font-bold' : 'text-gray-400 hover:text-white'}`}
                    >
                        Đơn
                    </button>
                    <button
                        onClick={() => setMode('BATCH')}
                        className={`px-3 py-1 text-xs rounded transition-all ${mode === 'BATCH' ? 'bg-purple-600 text-white font-bold' : 'text-gray-400 hover:text-white'}`}
                    >
                        Lô (Batch)
                    </button>
                </div>
            </div>

            {mode === 'SINGLE' ? (
                <CreateTaskForm users={users} />
            ) : (
                <BulkCreateTaskForm users={users} onSuccess={() => { }} />
            )}
        </div>
    )
}
