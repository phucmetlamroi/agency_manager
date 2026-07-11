'use client'

// [Mobile P2 §FR-H6] Error boundary cấp segment cho trang chi tiết task full-screen.
// Hỏng chỉ vùng nội dung, bấm "Thử lại" (reset) mà không mất shell/nav. EmptyState variant="error".
import { useEffect } from 'react'
import { EmptyState } from '@/components/ui/empty-state'

export default function TaskDetailError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error('[TaskDetailError]', error)
    }, [error])

    return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))]">
            <EmptyState
                variant="error"
                title="Đã xảy ra lỗi"
                description="Có gì đó không ổn khi tải task này."
                cta={{ label: 'Thử lại', onClick: () => reset() }}
                className="w-full max-w-sm"
            />
        </div>
    )
}
