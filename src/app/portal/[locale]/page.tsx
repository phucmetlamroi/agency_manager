import { getClientWorkspaces } from '@/actions/client-portal-actions'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { LayoutGrid, ArrowRight } from 'lucide-react'

export default async function PortalWorkspaceSelectPage({
    params
}: {
    params: Promise<{ locale: string }>
}) {
    const { locale } = await params
    const workspaces = await getClientWorkspaces()
    const t = await getTranslations('Portal')

    return (
        <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6">
            <div className="w-full max-w-2xl">
                <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 shadow-[0_0_20px_rgba(99,102,241,0.4)] flex items-center justify-center">
                        <LayoutGrid className="text-white" size={24} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-white tracking-tight">Chọn Workspace</h1>
                        <p className="text-zinc-500">Vui lòng chọn không gian làm việc để tiếp tục</p>
                    </div>
                </div>

                <div className="grid gap-4">
                    {workspaces.length === 0 ? (
                        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-12 text-center">
                            <p className="text-zinc-400 mb-2">Bạn chưa có dữ liệu trong bất kỳ workspace nào.</p>
                            <p className="text-sm text-zinc-600">Vui lòng liên hệ với admin để được hỗ trợ.</p>
                        </div>
                    ) : (
                        workspaces.map(ws => (
                            <Link
                                key={ws.id}
                                href={`/portal/${locale}/${ws.id}/tasks`}
                                className="group bg-zinc-900/40 hover:bg-zinc-900/80 border border-zinc-800 hover:border-indigo-500/50 p-6 rounded-2xl transition-all duration-300 flex items-center justify-between"
                            >
                                <div>
                                    <h3 className="text-xl font-medium text-white group-hover:text-indigo-400 transition-colors">{ws.id}</h3>
                                    <p className="text-sm text-zinc-500">Mở không gian làm việc này &rarr;</p>
                                </div>
                                <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500 group-hover:bg-indigo-500 group-hover:text-white transition-all transform group-hover:translate-x-1">
                                    <ArrowRight size={20} />
                                </div>
                            </Link>
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}
