'use client'

import { deleteTask } from '@/actions/task-management-actions'
import { useState } from 'react'

export default function DeleteTaskButton({ taskId, minimal = false }: { taskId: string, minimal?: boolean }) {
    const [isDeleting, setIsDeleting] = useState(false)

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation() // Prevent row click

        if (!confirm('Bạn có chắc muốn xóa vĩnh viễn task này không? Hành động này không thể hoàn tác.')) return

        setIsDeleting(true)
        try {
            await deleteTask(taskId)
            // Router refresh is handled in the server action
        } catch (error) {
            alert('Có lỗi xảy ra khi xóa.')
        } finally {
            setIsDeleting(false)
        }
    }

    if (minimal) {
        return (
            <button
                onClick={handleDelete}
                disabled={isDeleting}
                title="Xóa Task"
                style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#ef4444',
                    cursor: 'pointer',
                    fontSize: '1.2rem',
                    padding: '0 0.5rem',
                    opacity: isDeleting ? 0.5 : 1
                }}
            >
                {isDeleting ? '...' : '×'}
            </button>
        )
    }

    return (
        <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="btn-delete-hover"
            style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                color: '#ef4444',
                cursor: 'pointer',
                borderRadius: '6px',
                padding: '0.2rem 0.6rem',
                fontSize: '0.8rem',
                fontWeight: '500',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem'
            }}
        >
            <span style={{ fontSize: '1rem', lineHeight: 1 }}>×</span>
            {isDeleting ? 'Đang xóa...' : 'Xóa'}
        </button>
    )
}
