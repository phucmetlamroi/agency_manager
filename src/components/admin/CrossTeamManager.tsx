'use client'

import { useState } from 'react'
import { requestCrossTeamAccess, removeCrossTeamAccess } from '@/actions/cross-team-actions'
import { toast } from 'sonner'
import { useConfirm } from '@/components/ui/ConfirmModal'
import { X, Send, Clock } from 'lucide-react'

type CrossTeamManagerProps = {
    userId: string
    currentProfileId?: string
    profiles: any[]
    accesses: any[]
    requests: any[]
    workspaceId: string
    isSuperAdmin: boolean
}

export default function CrossTeamManager({ userId, currentProfileId, profiles, accesses = [], requests = [], workspaceId, isSuperAdmin }: CrossTeamManagerProps) {
    const [selectedTarget, setSelectedTarget] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const { confirm } = useConfirm()

    const handleRequest = async () => {
        if (!selectedTarget) return
        setIsSubmitting(true)
        const toastId = toast.loading('Đang gửi yêu cầu...')
        const res = await requestCrossTeamAccess(userId, selectedTarget, workspaceId)
        toast.dismiss(toastId)
        if (res.success) {
            toast.success('Đã gửi yêu cầu du học, chờ duyệt từ Admin team đích')
            setSelectedTarget('')
        } else {
            toast.error(res.error)
        }
        setIsSubmitting(false)
    }

    const handleRemove = async (targetId: string, name: string) => {
        if (!(await confirm({
            title: 'Hủy quyền Du học',
            message: `Bạn có chắc muốn hủy quyền truy cập vào team "${name}" của khóa này?`,
            type: 'warning',
            confirmText: 'Hủy quyền',
            cancelText: 'Hủy'
        }))) return

        const res = await removeCrossTeamAccess(userId, targetId, workspaceId)
        if (res.success) {
            toast.success('Đã hủy quyền truy cập')
        } else {
            toast.error(res.error)
        }
    }

    // Các team có thể gửi yêu cầu (không phải team hiện tại, không phải team đã có quyền, không phải team đang chờ duyệt)
    const availableProfiles = profiles.filter(p => 
        p.id !== currentProfileId && 
        !accesses.some(a => a.profileId === p.id) &&
        !requests.some(r => r.targetProfileId === p.id && r.status === 'PENDING')
    )

    return (
        <div className="flex flex-col gap-2 bg-black/20 p-2 rounded-lg border border-white/5 shadow-inner">
            <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-purple-400">Team Du học:</span>
            </div>

            {/* List existing access */}
            {accesses.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {accesses.map(a => {
                        const targetProfile = profiles.find(p => p.id === a.profileId)
                        return (
                            <div key={a.id} className="flex items-center gap-1 bg-purple-900/40 text-purple-300 text-[10px] px-2 py-0.5 rounded border border-purple-500/30">
                                <span>{targetProfile?.name || 'Unknown Team'}</span>
                                <button onClick={() => handleRemove(a.profileId, targetProfile?.name || '')} className="text-gray-400 hover:text-red-400">
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* List pending requests */}
            {requests.filter(r => r.status === 'PENDING').length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {requests.filter(r => r.status === 'PENDING').map(r => {
                        const targetProfile = profiles.find(p => p.id === r.targetProfileId)
                        return (
                            <div key={r.id} className="flex items-center gap-1 bg-yellow-900/30 text-yellow-400/80 text-[10px] px-2 py-0.5 rounded border border-yellow-500/30 italic" title="Đang chờ duyệt">
                                <Clock className="w-3 h-3" />
                                <span>{targetProfile?.name || 'Unknown Team'}</span>
                                <button onClick={() => handleRemove(r.targetProfileId, targetProfile?.name || '')} className="text-gray-400 hover:text-red-400 ml-1" title="Hủy yêu cầu">
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        )
                    })}
                </div>
            )}

            {accesses.length === 0 && requests.filter(r => r.status === 'PENDING').length === 0 && (
                <span className="text-xs text-gray-500 italic">Chưa đi du học</span>
            )}

            {/* Dropdown to add */}
            {accesses.length < 5 && availableProfiles.length > 0 && (
                <div className="flex items-center gap-1 mt-1">
                    <select 
                        value={selectedTarget}
                        onChange={(e) => setSelectedTarget(e.target.value)}
                        className="bg-white/10 text-white text-xs px-2 py-1 rounded border border-white/20 outline-none w-full max-w-[140px]"
                    >
                        <option value="">-- Xin qua team --</option>
                        {availableProfiles.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                    <button 
                        onClick={handleRequest}
                        disabled={!selectedTarget || isSubmitting}
                        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white p-1 rounded transition-colors"
                        title="Gửi yêu cầu du học"
                    >
                        <Send className="w-3 h-3" />
                    </button>
                </div>
            )}
            
            {accesses.length >= 5 && (
                <div className="text-[10px] text-red-400 mt-1">Đã đạt tối đa 5 team</div>
            )}
        </div>
    )
}
