'use client'

// [Mobile P2 §FR-H6] Error boundary cấp segment — hỏng chỉ vùng nội dung này,
// người dùng bấm "Thử lại" (reset) mà không mất shell/nav. Dùng EmptyState variant="error".
import { useEffect } from 'react'
import { EmptyState } from '@/components/ui/empty-state'

export default function PayrollError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error('[PayrollError]', error)
    }, [error])

    return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))]">
            <EmptyState
                variant="error"
                title="Đã xảy ra lỗi"
                description="Có gì đó không ổn khi tải trang này."
                cta={{ label: 'Thử lại', onClick: () => reset() }}
                className="w-full max-w-sm"
            />
        </div>
    )
}
