'use client'

import * as React from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Calendar } from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

export default function MonthPicker() {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    // Determine current selected month
    const currentMonthParam = searchParams.get('month')

    // Generate the last 3 months
    const now = new Date()
    const months = []

    for (let i = 0; i < 3; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const year = d.getFullYear()
        const month = String(d.getMonth() + 1).padStart(2, '0')
        const value = `${year}-${month}`

        let label = `Tháng ${d.getMonth() + 1}/${year}`
        if (i === 0) label += ' (Hiện tại)'

        months.push({ value, label })
    }

    const activeMonth = months.find(m => m.value === currentMonthParam) || months[0]

    const handleMonthChange = (value: string) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('month', value)
        // Soft navigation keeping state in URL
        router.replace(`${pathname}?${params.toString()}`)
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    className="flex items-center gap-2 bg-zinc-900/50 border-zinc-700/50 hover:bg-zinc-800 text-zinc-200 shadow-sm transition-all focus:ring-0 focus-visible:ring-0"
                >
                    <Calendar className="w-4 h-4 text-indigo-400" />
                    <span className="font-medium">{activeMonth.label}</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[200px] bg-zinc-900 border-zinc-800 shadow-xl">
                {months.map((m) => (
                    <DropdownMenuItem
                        key={m.value}
                        onClick={() => handleMonthChange(m.value)}
                        className={`cursor-pointer flex items-center justify-between py-2 px-3 ${activeMonth.value === m.value ? 'bg-indigo-500/10 text-indigo-400 font-bold' : 'text-zinc-300 focus:bg-zinc-800'
                            }`}
                    >
                        {m.label}
                        {activeMonth.value === m.value && <div className="w-2 h-2 rounded-full bg-indigo-500" />}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
