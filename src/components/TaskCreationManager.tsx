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
                    Giao Task Mới
                </h3>
            </div>

            <BulkCreateTaskForm users={users} onSuccess={() => { }} />
        </div>
    )
}
