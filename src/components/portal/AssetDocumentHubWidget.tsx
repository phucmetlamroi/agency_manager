'use client'

import { useTranslations } from 'next-intl'
import { motion } from 'framer-motion'
import { FolderGit2, FileVideo, FileText, ExternalLink } from 'lucide-react'

type Task = {
    id: string
    title: string
    productLink?: string | null
    [key: string]: any
}

function getLinkIcon(url: string) {
    if (url.includes('drive')) return FolderGit2
    if (url.includes('doc')) return FileText
    return FileVideo
}

export default function AssetDocumentHubWidget({ tasks }: { tasks: Task[] }) {
    const t = useTranslations('Portal')

    const completedAssets = tasks
        .filter(t => t.productLink)
        .slice(0, 4)

    return (
        <div className="relative bg-zinc-950/60 backdrop-blur-2xl border border-white/[0.06] shadow-xl shadow-black/40 rounded-3xl p-6 h-full flex flex-col overflow-hidden">
            {/* Ambient glow */}
            <div className="absolute -bottom-16 -right-16 w-40 h-40 bg-amber-500/[0.03] rounded-full blur-3xl pointer-events-none" />

            <div className="flex items-center gap-3 mb-6 relative z-10">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/15 to-yellow-600/5 flex items-center justify-center border border-amber-500/20 shadow-lg shadow-amber-500/5">
                    <FolderGit2 size={18} className="text-amber-400" />
                </div>
                <div>
                    <h2 className="text-white font-semibold">Asset Hub</h2>
                    <p className="text-zinc-500 text-xs">Recent deliveries</p>
                </div>
                {completedAssets.length > 0 && (
                    <span className="ml-auto text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full">
                        {completedAssets.length}
                    </span>
                )}
            </div>

            <div className="flex-1 grid grid-cols-2 gap-2.5 relative z-10">
                {completedAssets.length > 0 ? completedAssets.map((asset, i) => {
                    const Icon = getLinkIcon(asset.productLink!)
                    return (
                        <motion.a
                            key={asset.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.06, duration: 0.2 }}
                            href={asset.productLink!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group/asset relative bg-zinc-900/40 hover:bg-zinc-900/70 border border-white/[0.04] hover:border-amber-500/20 rounded-2xl p-4 flex flex-col items-center justify-center gap-2.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-amber-500/5"
                        >
                            <div className="w-10 h-10 rounded-xl bg-amber-500/[0.08] border border-amber-500/15 flex items-center justify-center text-amber-400 group-hover/asset:scale-110 group-hover/asset:bg-amber-500/15 transition-all duration-200">
                                <Icon size={18} />
                            </div>
                            <span className="text-[11px] text-zinc-300 font-medium line-clamp-2 w-full text-center leading-tight">
                                {asset.title}
                            </span>
                            <ExternalLink size={10} className="absolute top-3 right-3 text-zinc-700 group-hover/asset:text-amber-400 transition-colors" />
                        </motion.a>
                    )
                }) : (
                    <div className="col-span-2 flex flex-col items-center justify-center text-zinc-600 text-xs bg-zinc-900/20 rounded-2xl border border-dashed border-white/[0.04] py-8">
                        <FolderGit2 size={24} className="mb-2 opacity-20" />
                        No assets delivered yet
                    </div>
                )}
            </div>
        </div>
    )
}
