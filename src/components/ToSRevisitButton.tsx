'use client'

import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import UserAgreementContent from './UserAgreementContent'

export default function ToSRevisitButton({ 
    role, 
    hasAccepted 
}: { 
    role: string; 
    hasAccepted: boolean 
}) {
    // Admin always sees it. User only if they accepted. Others (Client) never.
    const isVisible = role === 'ADMIN' || (role === 'USER' && hasAccepted);
    
    if (!isVisible) return null

    return (
        <div className="fixed bottom-6 right-6 z-[100]">
            <Dialog>
                <DialogTrigger asChild>
                    <button 
                        className="group relative flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg transition-all duration-300 hover:bg-indigo-500 hover:shadow-indigo-500/40 hover:scale-110 active:scale-95"
                        title="Xem lại thỏa thuận người dùng"
                    >
                        <ShieldCheck className="h-6 w-6 transition-transform group-hover:rotate-12" />
                        
                        {/* Tooltip-like label on hover */}
                        <span className="absolute right-full mr-3 whitespace-nowrap rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 pointer-events-none shadow-xl border border-white/5">
                            Nội quy & Thỏa thuận
                        </span>
                    </button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col glass-panel border-white/10 p-0 sm:rounded-2xl bg-zinc-950/95 backdrop-blur-xl">
                    <DialogHeader className="p-6 border-b border-white/5 shrink-0 flex flex-row items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center">
                            <ShieldCheck className="h-5 w-5 text-indigo-400" />
                        </div>
                        <div>
                            <DialogTitle className="text-xl font-bold text-white">Nội Quy & Thỏa Thuận Hệ Thống</DialogTitle>
                            <p className="text-xs text-zinc-500">Thông tin về quy trình làm việc và hệ thống tính điểm lỗi.</p>
                        </div>
                    </DialogHeader>
                    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                        <UserAgreementContent />
                    </div>
                    <div className="p-4 border-t border-white/5 bg-zinc-900/30 text-center shrink-0">
                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold flex items-center justify-center gap-2">
                             Bạn đã ký kết thỏa thuận này.
                        </p>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
