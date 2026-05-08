import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { getMyTrashedWorkspaces } from '@/actions/workspace-actions'
import RestoreWorkspaceButton from '@/components/account/RestoreWorkspaceButton'
import { ArrowLeft, Trash2, Calendar, AlertTriangle } from 'lucide-react'

export const metadata = {
    title: 'Trash - HustlyTasker',
    description: 'Workspaces đã xóa — khôi phục trong 30 ngày trước khi xóa vĩnh viễn.',
}

export default async function TrashPage() {
    const session = await getSession()
    if (!session?.user?.id) redirect('/login')

    const { workspaces, error } = await getMyTrashedWorkspaces()

    return (
        <div className="min-h-screen px-4 py-8" style={{
            background: 'radial-gradient(circle at top right, #2d1b5e, #000)'
        }}>
            <div className="max-w-3xl mx-auto">
                <Link
                    href="/"
                    className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 mb-6 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Quay lại Dashboard
                </Link>

                <div className="backdrop-blur-2xl bg-white/[0.04] border border-white/10 rounded-2xl shadow-2xl p-8">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/15 text-red-400">
                            <Trash2 className="w-5 h-5" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-zinc-100">Workspace Trash</h1>
                            <p className="text-xs text-zinc-500">
                                Workspaces đã xóa — bạn có 30 ngày để khôi phục trước khi xóa vĩnh viễn.
                            </p>
                        </div>
                    </div>

                    {error && (
                        <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
                            {error}
                        </div>
                    )}

                    {(!workspaces || workspaces.length === 0) && (
                        <div className="mt-8 text-center py-12 text-zinc-500">
                            <Trash2 className="w-12 h-12 mx-auto mb-3 text-zinc-700" />
                            <p className="text-sm">Không có workspace nào trong Trash.</p>
                        </div>
                    )}

                    <div className="mt-6 space-y-3">
                        {workspaces?.map((ws) => {
                            const isCritical = ws.daysUntilHardDelete <= 3
                            return (
                                <div
                                    key={ws.id}
                                    className={`p-4 rounded-xl border ${
                                        isCritical
                                            ? 'bg-red-500/5 border-red-500/30'
                                            : 'bg-zinc-900/40 border-white/10'
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-base font-bold text-zinc-100 truncate">
                                                {ws.name}
                                            </h3>
                                            {ws.description && (
                                                <p className="text-xs text-zinc-500 mt-1 line-clamp-2">
                                                    {ws.description}
                                                </p>
                                            )}
                                            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-zinc-500">
                                                {ws.deletedAt && (
                                                    <span className="flex items-center gap-1">
                                                        <Calendar className="w-3 h-3" />
                                                        Xóa: {new Date(ws.deletedAt).toLocaleDateString('vi-VN')}
                                                    </span>
                                                )}
                                                {isCritical ? (
                                                    <span className="flex items-center gap-1 text-red-400 font-bold">
                                                        <AlertTriangle className="w-3 h-3" />
                                                        Còn {ws.daysUntilHardDelete} ngày!
                                                    </span>
                                                ) : (
                                                    <span className="text-zinc-400">
                                                        Xóa vĩnh viễn sau {ws.daysUntilHardDelete} ngày
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <RestoreWorkspaceButton workspaceId={ws.id} workspaceName={ws.name} />
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    <div className="mt-8 p-4 rounded-xl bg-violet-500/5 border border-violet-500/20 text-xs text-violet-200 leading-relaxed">
                        💡 <strong>Lưu ý:</strong> Sau 30 ngày, workspace sẽ bị xóa vĩnh viễn cùng tất cả task,
                        comment, và lịch sử. Khôi phục KHÔNG còn được sau thời điểm này.
                    </div>
                </div>
            </div>
        </div>
    )
}
