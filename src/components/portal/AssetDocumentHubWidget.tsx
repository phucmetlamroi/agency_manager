'use client'

import { useTranslations } from 'next-intl'
import { FolderGit2, FileVideo, FileText, Download } from 'lucide-react'

type Task = {
    id: string
    title: string
    productLink?: string | null
    [key: string]: any
}

export default function AssetDocumentHubWidget({ tasks }: { tasks: Task[] }) {
    const t = useTranslations('Portal')

    // Filter tasks that have product links
    const completedAssets = tasks
        .filter(t => t.productLink)
        .slice(0, 4)

    return (
        <div className="bg-zinc-950/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 h-full flex flex-col group hover:-translate-y-1 transition-transform duration-300">
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
                    <FolderGit2 size={20} className="text-purple-400" />
                </div>
                <div>
                    <h2 className="text-white font-medium">Asset Hub</h2>
                    <p className="text-zinc-500 text-xs">Recent deliveries</p>
                </div>
            </div>

            <div className="flex-1 grid grid-cols-2 gap-3">
                {completedAssets.length > 0 ? completedAssets.map(asset => (
                    <a
                        key={asset.id}
                        href={asset.productLink!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-zinc-900/50 hover:bg-zinc-800 border border-white/5 rounded-2xl p-4 flex flex-col items-center justify-center gap-3 transition-colors text-center group/btn"
                    >
                        <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400 group-hover/btn:scale-110 transition-transform">
                            {asset.productLink?.includes('drive') ? <FolderGit2 size={18} /> :
                                asset.productLink?.includes('doc') ? <FileText size={18} /> :
                                    <FileVideo size={18} />}
                        </div>
                        <span className="text-xs text-zinc-300 font-medium line-clamp-2 w-full px-1">{asset.title}</span>
                    </a>
                )) : (
                    <div className="col-span-2 flex flex-col items-center justify-center text-zinc-500 text-xs italic bg-zinc-900/20 rounded-2xl border border-dashed border-white/5 py-8">
                        <FolderGit2 size={24} className="mb-2 opacity-20" />
                        No assets delivered yet
                    </div>
                )}
            </div>
        </div>
    )
}
