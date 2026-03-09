'use client'

import { useTranslations } from 'next-intl'
import { Rocket, FileSignature, Receipt, Headset } from 'lucide-react'

export default function PortalActionCenter() {
    const t = useTranslations('Portal')

    return (
        <div className="bg-zinc-950/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 h-full flex flex-col group hover:-translate-y-1 transition-transform duration-300">
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-pink-500/10 flex items-center justify-center border border-pink-500/20">
                    <Rocket size={20} className="text-pink-400" />
                </div>
                <div>
                    <h2 className="text-white font-medium">Action Center</h2>
                    <p className="text-zinc-500 text-xs">Quick shortcuts</p>
                </div>
            </div>

            <div className="flex-1 grid grid-cols-1 gap-3">
                <button className="flex items-center gap-4 bg-zinc-900/50 hover:bg-zinc-800 border border-white/5 p-4 rounded-2xl transition-colors text-left group/btn">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center group-hover/btn:scale-110 transition-transform">
                        <FileSignature size={18} className="text-emerald-400" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-white group-hover/btn:text-emerald-400 transition-colors">Approve Designs</p>
                        <p className="text-[10px] text-zinc-500">Awaiting your sign-off</p>
                    </div>
                </button>

                <button className="flex items-center gap-4 bg-zinc-900/50 hover:bg-zinc-800 border border-white/5 p-4 rounded-2xl transition-colors text-left group/btn">
                    <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center group-hover/btn:scale-110 transition-transform">
                        <Receipt size={18} className="text-amber-400" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-white group-hover/btn:text-amber-400 transition-colors">Pay Invoice</p>
                        <p className="text-[10px] text-zinc-500">1 pending payment</p>
                    </div>
                </button>
            </div>
        </div>
    )
}
