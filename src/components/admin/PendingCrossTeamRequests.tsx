'use client'

import { approveCrossTeamAccess, rejectCrossTeamAccess } from '@/actions/cross-team-actions'
import { toast } from 'sonner'
import { CheckCircle2, XCircle, Clock } from 'lucide-react'

type PendingRequest = {
    id: string
    user: any
    requestedBy: any
    createdAt: Date
}

type Props = {
    requests: PendingRequest[]
    workspaceId: string
}

export default function PendingCrossTeamRequests({ requests, workspaceId }: Props) {
    if (!requests || requests.length === 0) return null

    const handleApprove = async (id: string) => {
        const toastId = toast.loading('Đang xử lý...')
        const res = await approveCrossTeamAccess(id, workspaceId)
        toast.dismiss(toastId)
        if (res.success) toast.success('Đã chấp nhận "Tân sinh viên" du học vào team!')
        else toast.error(res.error)
    }

    const handleReject = async (id: string, name: string) => {
        const toastId = toast.loading('Đang từ chối...')
        const res = await rejectCrossTeamAccess(id, workspaceId)
        toast.dismiss(toastId)
        if (res.success) toast.success(`Đã từ chối cấp quyền cho ${name}`)
        else toast.error(res.error)
    }

    return (
        <div className="bg-gradient-to-br from-indigo-900/30 to-purple-900/20 border border-indigo-500/30 rounded-xl p-4 mb-6 shadow-lg shadow-indigo-500/10">
            <h3 className="text-indigo-400 font-bold flex items-center gap-2 mb-3 text-sm">
                <Clock className="w-4 h-4" /> 
                Yêu cầu "Du học" chờ duyệt ({requests.length})
            </h3>
            
            <div className="space-y-2">
                {requests.map(r => (
                    <div key={r.id} className="flex flex-wrap items-center justify-between gap-4 bg-black/40 p-3 rounded-lg border border-white/5 hover:bg-black/60 transition-colors">
                        <div>
                            <div className="font-semibold text-white flex items-center gap-2">
                                🎓 {r.user.nickname || r.user.username}
                                <span className="text-xs text-gray-500 bg-white/10 px-2 py-0.5 rounded">@{r.user.username}</span>
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                                Xin vào team • Được gửi bởi Admin <strong>{r.requestedBy.username}</strong>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button 
                                onClick={() => handleReject(r.id, r.user.username)}
                                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-red-900/30 text-red-400 border border-red-500/30 hover:bg-red-900/50 transition-colors"
                            >
                                <XCircle className="w-3.5 h-3.5" /> Từ chối
                            </button>
                            <button 
                                onClick={() => handleApprove(r.id)}
                                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-green-900/30 text-green-400 border border-green-500/30 hover:bg-green-900/50 transition-colors font-bold shadow-lg shadow-green-500/20"
                            >
                                <CheckCircle2 className="w-3.5 h-3.5" /> Chấp nhận
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
