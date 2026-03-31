'use client'

import React, { useState, useTransition } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Search, AlertTriangle, Calendar, Award, CheckCircle2, Trash2, ShieldCheck } from 'lucide-react'
import { format } from 'date-fns'
import Link from 'next/link'
import { toast } from 'sonner'
import { removeErrorLog } from '@/actions/analytics-actions'

interface ErrorItem {
    id: string
    errorCode: string
    errorDescription: string
    frequency: number
    penalty: number
    detectedBy: string
    createdAt: string
}

interface TaskErrorData {
    taskId: string
    taskTitle: string
    clientName: string | null
    projectName: string | null
    latestErrorAt: string
    totalPenalty: number
    errors: ErrorItem[]
}

interface Props {
    staff: any
    performance: any
    errorDetails: TaskErrorData[]
    workspaceId: string
    isUserView?: boolean
}

export default function StaffErrorDetail({ staff, performance, errorDetails, workspaceId, isUserView = false }: Props) {
    const [searchTerm, setSearchTerm] = useState('')
    const [isPending, startTransition] = useTransition()

    const handleDeleteError = (errorId: string) => {
        if (!confirm('Bạn có chắc chắn muốn xóa bản ghi lỗi này không? Thao tác này sẽ hiển thị ngay trong tổng điểm phạt.')) return

        startTransition(async () => {
            const res = await removeErrorLog(workspaceId, errorId)
            if (res.success) {
                toast.success('Đã gỡ lỗi thành công!')
            } else {
                toast.error(res.error || 'Có lỗi xảy ra khi gỡ lỗi')
            }
        })
    }

    const filteredData = errorDetails.filter(t => 
        t.taskTitle.toLowerCase().includes(searchTerm.toLowerCase()) || 
        t.errors.some(e => e.errorDescription.toLowerCase().includes(searchTerm.toLowerCase()))
    )

    return (
        <div className="space-y-6 animate-fade-in pb-12">
            {/* Header / Profile Glass Card */}
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/50 backdrop-blur-xl p-8 shadow-2xl">
                <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                    <Award className="w-48 h-48" />
                </div>
                
                <div className="flex flex-col md:flex-row items-center gap-6 relative z-10">
                    <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-4xl shadow-lg ring-4 ring-zinc-800">
                        {staff.nickname?.[0]?.toUpperCase() || staff.username[0]?.toUpperCase()}
                    </div>
                    
                    <div className="flex-1 text-center md:text-left">
                        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-400">
                            {staff.nickname || staff.username}
                        </h1>
                        <p className="text-zinc-400 mt-1 flex items-center justify-center md:justify-start gap-2">
                            <span>@{staff.username}</span>
                        </p>
                    </div>

                    <div className="flex items-center gap-4 mt-6 md:mt-0">
                        <div className="px-6 py-4 rounded-xl bg-zinc-950/50 border border-white/5 text-center shadow-inner">
                            <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1">Xếp hạng</p>
                            <Badge variant="outline" className={`text-xl px-4 py-1 border-0 ${
                                performance.rank === 'S' ? 'bg-purple-500/20 text-purple-400' :
                                performance.rank === 'A' ? 'bg-blue-500/20 text-blue-400' :
                                performance.rank === 'B' ? 'bg-green-500/20 text-green-400' :
                                performance.rank === 'C' ? 'bg-yellow-500/20 text-yellow-400' :
                                performance.rank === 'N/A' ? 'bg-zinc-500/20 text-zinc-400' :
                                'bg-red-500/20 text-red-400'
                            }`}>
                                Hạng {performance.rank}
                            </Badge>
                        </div>
                        <div className="px-6 py-4 rounded-xl bg-zinc-950/50 border border-white/5 text-center shadow-inner">
                            <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-1">Tổng Lỗi Tháng</p>
                            <p className="text-2xl font-bold text-red-400">-{performance.totalPenalty}đ</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* List and Filters */}
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-400" />
                    Chi Tiết Lỗi Theo Task
                    <Badge variant="outline" className="ml-2 bg-zinc-800 border-zinc-700">{errorDetails.length} Tasks bị lỗi</Badge>
                </h2>
                <div className="relative w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <Input 
                        placeholder="Tìm tên Task hoặc lỗi..." 
                        className="pl-9 bg-zinc-900/50 border-zinc-800"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* Task Error List */}
            {filteredData.length === 0 ? (
                <div className="py-20 text-center rounded-2xl border border-emerald-500/20 bg-emerald-500/5 backdrop-blur-md">
                    {/* Animated shield orb */}
                    <div className="relative mx-auto flex items-center justify-center mb-6 w-32 h-32">
                        {/* Outer glow pulse */}
                        <div className="absolute inset-0 rounded-full bg-emerald-500/15 blur-2xl animate-pulse" />
                        {/* Rotating ring */}
                        <div className="absolute w-28 h-28 rounded-full border-2 border-dashed border-emerald-500/30 animate-spin" style={{ animationDuration: '10s' }} />
                        {/* Inner ring static */}
                        <div className="absolute w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30" />
                        {/* Center icon */}
                        <ShieldCheck className="relative z-10 w-10 h-10 text-emerald-400 drop-shadow-[0_0_16px_rgba(52,211,153,0.8)]" />
                    </div>
                    <h3 className="text-xl font-bold text-emerald-400 mb-2">Không tìm thấy lỗi!</h3>
                    <p className="text-zinc-500 text-sm max-w-xs mx-auto">Nhân viên này chưa bị ghi nhận lỗi nào phù hợp với tìm kiếm của bạn.</p>
                    <div className="flex items-center justify-center gap-2 mt-4 text-xs text-emerald-500/60">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        Duy trì phong độ hoàn hảo!
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    {filteredData.map((taskData) => (
                        <Card key={taskData.taskId} className="border-red-900/20 bg-zinc-900/50 backdrop-blur-sm overflow-hidden hover:border-red-900/50 transition-colors">
                            <CardHeader className="border-b border-red-900/20 bg-red-950/10 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div>
                                    <div className="flex items-center gap-3 mb-1">
                                        <CardTitle className="text-lg">
                                            <Link href={isUserView ? `/${workspaceId}/dashboard/tasks/${taskData.taskId}` : `/${workspaceId}/admin/tasks/${taskData.taskId}`} className="hover:text-blue-400 transition-colors">
                                                {taskData.taskTitle}
                                            </Link>
                                        </CardTitle>
                                        <Badge variant="destructive" className="bg-red-500/10 text-red-500 border-red-500/20">
                                            -{taskData.totalPenalty}đ
                                        </Badge>
                                    </div>
                                    <div className="flex items-center gap-4 text-xs text-zinc-500 font-medium">
                                        {taskData.clientName && <span>Khách: <span className="text-zinc-300">{taskData.clientName}</span></span>}
                                        {taskData.projectName && <span>Dự án: <span className="text-zinc-300">{taskData.projectName}</span></span>}
                                        <span className="flex items-center gap-1">
                                            <Calendar className="w-3 h-3" />
                                            {format(new Date(taskData.latestErrorAt), 'dd/MM/yyyy')}
                                        </span>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="divide-y divide-white/5">
                                    {taskData.errors.map((error) => (
                                        <div key={error.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-4 hover:bg-white/[0.02] transition-colors">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-mono text-xs text-red-400 bg-red-400/10 px-2 py-0.5 rounded">
                                                        {error.errorCode}
                                                    </span>
                                                    <strong className="text-sm text-zinc-200">{error.errorDescription}</strong>
                                                </div>
                                                <p className="text-xs text-zinc-500">
                                                    Ghi nhận bởi <span className="text-indigo-400 font-medium">{error.detectedBy}</span> vào {format(new Date(error.createdAt), 'HH:mm dd/MM')}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-6 sm:justify-end shrink-0">
                                                <div className="text-center">
                                                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Vi phạm</p>
                                                    <p className="text-sm font-bold text-zinc-300">{error.frequency} lần</p>
                                                </div>
                                                <div className="text-center min-w-[3rem]">
                                                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Phạt</p>
                                                    <p className="text-sm font-bold text-red-400">-{error.penalty}</p>
                                                </div>
                                                {!isUserView && (
                                                    <button
                                                        disabled={isPending}
                                                        onClick={() => handleDeleteError(error.id)}
                                                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-colors border border-transparent hover:border-red-500/20 disabled:opacity-50"
                                                        title="Gỡ bỏ lỗi này"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}
