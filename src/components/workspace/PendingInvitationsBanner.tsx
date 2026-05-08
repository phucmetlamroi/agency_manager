'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Check, X, Loader2, Sparkles } from 'lucide-react'
import { getMyPendingInvitations, acceptWorkspaceInvitation, declineWorkspaceInvitation } from '@/actions/member-actions'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

type Invitation = {
    id: string
    role: string
    workspace: { id: string; name: string; description: string | null }
    invitedBy: { id: string; username: string; nickname: string | null }
}

export default function PendingInvitationsBanner() {
    const router = useRouter()
    const [invitations, setInvitations] = useState<Invitation[]>([])
    const [loading, setLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState<string | null>(null)

    useEffect(() => {
        loadInvitations()
    }, [])

    async function loadInvitations() {
        try {
            const result = await getMyPendingInvitations()
            setInvitations(result.invitations as any)
        } catch {
            // Silently fail — invitation table may not exist
        } finally {
            setLoading(false)
        }
    }

    async function handleAccept(invitationId: string) {
        setActionLoading(invitationId)
        try {
            const result = await acceptWorkspaceInvitation(invitationId)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success(`Đã tham gia workspace ${result.workspaceName}!`)
                setInvitations(prev => prev.filter(inv => inv.id !== invitationId))
                // Navigate to the workspace
                if (result.workspaceId) {
                    router.push(`/${result.workspaceId}/dashboard`)
                }
            }
        } catch (err: any) {
            toast.error(err?.message || 'Lỗi')
        } finally {
            setActionLoading(null)
        }
    }

    async function handleDecline(invitationId: string) {
        setActionLoading(invitationId)
        try {
            const result = await declineWorkspaceInvitation(invitationId)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success('Đã từ chối lời mời.')
                setInvitations(prev => prev.filter(inv => inv.id !== invitationId))
            }
        } catch (err: any) {
            toast.error(err?.message || 'Lỗi')
        } finally {
            setActionLoading(null)
        }
    }

    if (loading || invitations.length === 0) return null

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mb-4"
            >
                <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-bold text-indigo-400">
                        <Sparkles className="w-4 h-4" strokeWidth={2} />
                        Lời mời tham gia Workspace ({invitations.length})
                    </div>

                    {invitations.map(inv => (
                        <div
                            key={inv.id}
                            className="bg-zinc-900/40 border border-white/5 rounded-xl p-3 flex items-center gap-3 flex-wrap"
                        >
                            <div className="w-9 h-9 rounded-lg bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center shrink-0">
                                <Mail className="w-4 h-4 text-indigo-400" strokeWidth={1.5} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-zinc-100">
                                    {inv.workspace.name}
                                </div>
                                <div className="text-[11px] text-zinc-500">
                                    Mời bởi {inv.invitedBy.nickname || inv.invitedBy.username} · Vai trò: {inv.role}
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    onClick={() => handleDecline(inv.id)}
                                    disabled={actionLoading === inv.id}
                                    className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-zinc-400 text-xs font-bold hover:bg-white/10 hover:text-white transition-all disabled:opacity-50 flex items-center gap-1"
                                >
                                    {actionLoading === inv.id ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                        <X className="w-3 h-3" />
                                    )}
                                    Từ chối
                                </button>
                                <button
                                    onClick={() => handleAccept(inv.id)}
                                    disabled={actionLoading === inv.id}
                                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1 shadow-lg shadow-indigo-500/20"
                                >
                                    {actionLoading === inv.id ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                        <Check className="w-3 h-3" />
                                    )}
                                    Tham gia
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </motion.div>
        </AnimatePresence>
    )
}
