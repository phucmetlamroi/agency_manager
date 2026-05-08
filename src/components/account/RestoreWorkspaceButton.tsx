'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { restoreWorkspaceAction } from '@/actions/workspace-actions'
import { useConfirm } from '@/components/ui/ConfirmModal'
import { toast } from 'sonner'
import { RotateCcw, Loader2 } from 'lucide-react'

interface Props {
    workspaceId: string
    workspaceName: string
}

export default function RestoreWorkspaceButton({ workspaceId, workspaceName }: Props) {
    const router = useRouter()
    const { confirm } = useConfirm()
    const [isPending, startTransition] = useTransition()

    const handleRestore = async () => {
        if (!(await confirm({
            title: 'Khôi phục Workspace?',
            message: `Workspace "${workspaceName}" sẽ trở lại trạng thái ACTIVE và tất cả thành viên có thể tiếp tục làm việc bình thường.`,
            type: 'warning',
            confirmText: 'Khôi phục',
            cancelText: 'Hủy'
        }))) return

        startTransition(async () => {
            try {
                const result = await restoreWorkspaceAction(workspaceId)
                if ((result as any).error) {
                    toast.error((result as any).error)
                } else {
                    toast.success(`Đã khôi phục "${workspaceName}".`)
                    router.refresh()
                }
            } catch {
                toast.error('Không thể khôi phục workspace.')
            }
        })
    }

    return (
        <button
            type="button"
            onClick={handleRestore}
            disabled={isPending}
            className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 hover:text-emerald-200 border border-emerald-500/30 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
        >
            {isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
                <RotateCcw className="w-3.5 h-3.5" />
            )}
            Khôi phục
        </button>
    )
}
