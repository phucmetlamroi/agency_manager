"use client"

import { useState } from "react"
import { Dialog } from "@/components/ui/dialog"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { motion } from "framer-motion"
import { X, Lock, Play, Loader2, Calendar } from "lucide-react"
import { toast } from "sonner"
import { TaskWithUser } from "@/types/admin"
import { updateTaskStatus } from "@/actions/task-actions"

/**
 * [Sprint P GĐ2] PreStartBlockModal — popup BLOCKING khi user click task ở
 * status `Nhận task` / `Đã nhận task`. User KHÔNG được mở `TaskDetailModal`
 * cho đến khi bấm "Bắt đầu".
 *
 * Spec yêu cầu:
 *  - Chỉ hiện thông tin tối thiểu (tên task + deadline)
 *  - Brief / chi tiết / link tài liệu BỊ ẨN
 *  - Click "Bắt đầu" → status `Đang thực hiện` → onStarted callback
 *    → caller (UserWorkflowTabs) mở TaskDetailModal với chi tiết đầy đủ
 *  - Click "Hủy" → đóng popup, không thay đổi gì
 */
interface Props {
    task: TaskWithUser | null
    isOpen: boolean
    workspaceId: string
    onClose: () => void
    onStarted?: (task: TaskWithUser) => void
}

function formatDeadline(d: Date | string | null | undefined): string {
    if (!d) return "Không có hạn chót"
    const dt = new Date(d)
    if (isNaN(dt.getTime())) return "Không có hạn chót"
    const pad = (n: number) => (n < 10 ? "0" + n : String(n))
    return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`
}

export function PreStartBlockModal({ task, isOpen, workspaceId, onClose, onStarted }: Props) {
    const [starting, setStarting] = useState(false)

    if (!task) return null

    const handleStart = async () => {
        if (starting) return
        setStarting(true)
        try {
            const res = await updateTaskStatus(task.id, "Đang thực hiện", workspaceId)
            if (res?.success) {
                toast.success("Đã bắt đầu task — chúc bạn làm việc hiệu quả!")
                const updatedTask = { ...task, status: "Đang thực hiện" } as TaskWithUser
                onStarted?.(updatedTask)
                onClose()
            } else {
                toast.error(res?.error || "Không thể bắt đầu task. Vui lòng thử lại.")
            }
        } catch {
            toast.error("Không thể bắt đầu task. Vui lòng thử lại.")
        } finally {
            setStarting(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && !starting && onClose()}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay asChild>
                    <motion.div
                        className="fixed inset-0"
                        style={{ zIndex: 9999, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)" }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    />
                </DialogPrimitive.Overlay>

                <DialogPrimitive.Content asChild>
                    <motion.div
                        className="fixed left-1/2 top-1/2 flex flex-col outline-none p-7"
                        style={{
                            zIndex: 9999,
                            width: 480,
                            maxWidth: "calc(100vw - 32px)",
                            borderRadius: 24,
                            background: "rgba(10,10,10,0.95)",
                            border: "1px solid rgba(139,92,246,0.20)",
                            backdropFilter: "blur(24px)",
                            boxShadow: "0 32px 80px rgba(0,0,0,0.70), 0 0 0 1px rgba(139,92,246,0.05)",
                            x: "-50%",
                            y: "-50%",
                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                        }}
                        initial={{ opacity: 0, scale: 0.96, y: "-48%", x: "-50%" }}
                        animate={{ opacity: 1, scale: 1, y: "-50%", x: "-50%" }}
                        exit={{ opacity: 0, scale: 0.96, y: "-48%", x: "-50%" }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    >
                        {/* Close button — top right (disabled while starting) */}
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={starting}
                            aria-label="Đóng"
                            className="absolute top-4 right-4 flex items-center justify-center w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/[0.10] text-zinc-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <X size={16} />
                        </button>

                        {/* Lock icon */}
                        <div className="flex flex-col items-center text-center pt-2">
                            <div
                                className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
                                style={{
                                    background: "rgba(139,92,246,0.12)",
                                    border: "1px solid rgba(139,92,246,0.25)",
                                }}
                            >
                                <Lock className="w-7 h-7 text-violet-300" strokeWidth={1.8} />
                            </div>

                            <h2 className="text-[18px] font-extrabold text-white mb-2 tracking-tight">
                                Bạn cần bắt đầu task này trước
                            </h2>
                            <p className="text-[13px] text-zinc-400 mb-5 max-w-sm leading-relaxed">
                                Chi tiết, brief và tài liệu sẽ chỉ hiển thị sau khi bạn chính
                                thức bấm <span className="text-violet-300 font-semibold">Bắt đầu</span>.
                            </p>
                        </div>

                        {/* Task summary — chỉ tên + deadline */}
                        <div
                            className="rounded-2xl p-4 mb-6"
                            style={{
                                background: "rgba(255,255,255,0.03)",
                                border: "1px solid rgba(139,92,246,0.12)",
                            }}
                        >
                            <p className="text-[11px] uppercase tracking-widest text-zinc-500 mb-2 font-semibold">
                                Task
                            </p>
                            <p className="text-[16px] font-bold text-white mb-3 break-words">
                                {task.title}
                            </p>
                            <div className="flex items-center gap-2 text-[13px] text-zinc-300">
                                <Calendar className="w-4 h-4 text-violet-400" />
                                <span className="text-zinc-500">Deadline:</span>
                                <span className="text-zinc-200 font-medium">{formatDeadline(task.deadline)}</span>
                            </div>
                        </div>

                        {/* CTA buttons */}
                        <div className="flex flex-col gap-2.5">
                            <button
                                type="button"
                                onClick={handleStart}
                                disabled={starting}
                                className="group relative inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full text-white font-bold transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed"
                                style={{
                                    background: "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)",
                                    boxShadow: "0 12px 32px rgba(139,92,246,0.45)",
                                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                                    fontSize: 14,
                                }}
                                onMouseEnter={(e) => {
                                    if (!starting) {
                                        e.currentTarget.style.background =
                                            "linear-gradient(135deg, #9D6FFF 0%, #8B5CF6 100%)"
                                        e.currentTarget.style.boxShadow =
                                            "0 16px 40px rgba(139,92,246,0.60)"
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background =
                                        "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)"
                                    e.currentTarget.style.boxShadow = "0 12px 32px rgba(139,92,246,0.45)"
                                }}
                            >
                                {starting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Đang bắt đầu…
                                    </>
                                ) : (
                                    <>
                                        <Play className="w-4 h-4" strokeWidth={2.5} />
                                        Bắt đầu
                                    </>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={onClose}
                                disabled={starting}
                                className="inline-flex items-center justify-center px-6 py-3 rounded-full text-zinc-400 hover:text-zinc-200 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{
                                    background: "transparent",
                                    border: "1px solid rgba(255,255,255,0.08)",
                                    fontSize: 13,
                                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                                }}
                                onMouseEnter={(e) => {
                                    if (!starting) {
                                        e.currentTarget.style.background = "rgba(255,255,255,0.04)"
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = "transparent"
                                }}
                            >
                                Hủy
                            </button>
                        </div>

                        <p className="text-[11px] text-zinc-600 text-center mt-5 leading-relaxed">
                            Sau khi bấm Bắt đầu, hệ thống sẽ ghi nhận thời điểm bạn nhận task
                            và admin được thông báo.
                        </p>
                    </motion.div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </Dialog>
    )
}
