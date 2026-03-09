'use client'

import { Clock, PlayCircle, AlertCircle, RotateCcw, CheckCircle2 } from 'lucide-react'

type StatusConfig = {
    baseColor: string
    neonColor: string
    icon: React.ElementType
}

const statusConfigMap: Record<string, StatusConfig> = {
    'Pending': { baseColor: 'bg-[#0A2E5C]/60', neonColor: 'text-[#00E5FF] border-[#00E5FF]/50 shadow-[0_0_10px_rgba(0,229,255,0.3)]', icon: Clock },
    'In Progress': { baseColor: 'bg-[#320A5C]/60', neonColor: 'text-[#B388FF] border-[#B388FF]/50 shadow-[0_0_10px_rgba(179,136,255,0.3)]', icon: PlayCircle },
    'Action Required': { baseColor: 'bg-[#5C230A]/60', neonColor: 'text-[#FF6F61] border-[#FF6F61]/50 shadow-[0_0_10px_rgba(255,111,97,0.3)]', icon: AlertCircle },
    'Revising': { baseColor: 'bg-[#5C230A]/60', neonColor: 'text-[#FF6F61] border-[#FF6F61]/50 shadow-[0_0_10px_rgba(255,111,97,0.3)]', icon: RotateCcw },
    'Completed': { baseColor: 'bg-[#0A5C2F]/60', neonColor: 'text-[#00FFA3] border-[#00FFA3]/50 shadow-[0_0_10px_rgba(0,255,163,0.3)]', icon: CheckCircle2 }
}

export default function PortalStatusBadge({ status, pulse = false }: { status: string, pulse?: boolean }) {
    const config = statusConfigMap[status] ?? statusConfigMap['Pending']
    const Icon = config.icon

    return (
        <div className={`px-2.5 py-1 rounded-full border flex items-center gap-1.5 shrink-0 backdrop-blur-md ${config.baseColor} ${config.neonColor}`}>
            {pulse ? (
                <span className="relative flex h-2 w-2">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${config.neonColor.split(' ')[0].replace('text-', 'bg-')}`}></span>
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${config.neonColor.split(' ')[0].replace('text-', 'bg-')}`}></span>
                </span>
            ) : (
                <Icon size={12} className="shrink-0" />
            )}
            <span className="text-[10px] uppercase font-bold tracking-widest">{status}</span>
        </div>
    )
}
