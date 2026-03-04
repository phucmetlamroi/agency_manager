"use client"

import { useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Download, CloudDownload, FileVideo, FileAudio, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"

export function AdminVideoDownloader() {
    const [open, setOpen] = useState(false)
    const [url, setUrl] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [format, setFormat] = useState<'best' | 'audio'>('best')

    const validateUrl = (str: string) => {
        try { new URL(str); return true; } catch (_) { return false; }
    }

    const startDownload = async () => {
        if (!validateUrl(url)) {
            toast.error("Vui lòng nhập URL hợp lệ")
            return
        }

        try {
            setIsLoading(true)
            toast.loading("Khởi tạo luồng tải an toàn...", { id: "admin-download" })

            const response = await fetch('/api/vdownloader', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, formatType: format })
            })

            if (!response.ok) {
                let errorMessage = "Lỗi khi tải video"
                try {
                    const data = await response.json()
                    errorMessage = data.error || errorMessage
                } catch (e) {
                    errorMessage = `HTTP ${response.status}`
                }
                throw new Error(errorMessage)
            }

            toast.loading("Đang stream dữ liệu về hệ thống...", { id: "admin-download" })

            const contentDisposition = response.headers.get('Content-Disposition')
            let filename = format === 'audio' ? 'downloadTask.mp3' : 'downloadTask.mp4'
            if (contentDisposition && contentDisposition.includes('filename=')) {
                const match = contentDisposition.match(/filename="?([^"]+)"?/)
                if (match && match[1]) filename = match[1]
            }

            const blob = await response.blob()
            const downloadUrl = window.URL.createObjectURL(blob)

            const a = document.createElement('a')
            a.href = downloadUrl
            a.download = filename
            document.body.appendChild(a)
            a.click()
            window.URL.revokeObjectURL(downloadUrl)
            document.body.removeChild(a)

            toast.success("Trích xuất phương tiện thành công!", { id: "admin-download" })
            setUrl("")
            setOpen(false)
        } catch (error: any) {
            toast.error(error.message || "Truy xuất thất bại.", { id: "admin-download" })
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button className="relative w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 hover:bg-white/5 border border-transparent hover:border-white/10 group">
                    <CloudDownload className="w-5 h-5 text-zinc-400 group-hover:text-zinc-100 transition-colors" />
                    {/* Subtle outer glow */}
                    <div className="absolute inset-0 rounded-full bg-blue-500/0 group-hover:bg-blue-500/10 blur-md transition-all duration-300" />
                </button>
            </PopoverTrigger>

            <AnimatePresence>
                {open && (
                    <PopoverContent
                        align="end"
                        sideOffset={8}
                        className="w-80 p-0 border-none bg-transparent shadow-none"
                        asChild
                    >
                        <motion.div
                            initial={{ opacity: 0, y: -10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -10, scale: 0.95 }}
                            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                            style={{
                                backgroundColor: "rgba(9, 9, 11, 0.7)", // zinc-950
                                backdropFilter: "blur(24px)",
                                WebkitBackdropFilter: "blur(24px)",
                                boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.1), inset 0 -1px 0 rgba(255, 255, 255, 0.05), 0 12px 40px rgba(0, 0, 0, 0.5)",
                                border: "1px solid rgba(255, 255, 255, 0.08)",
                                borderRadius: "16px",
                            }}
                            className="overflow-hidden"
                        >
                            {/* Header */}
                            <div className="px-4 py-3 border-b border-white/5 bg-white/5">
                                <h4 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                                    <Download className="w-4 h-4 text-blue-400" />
                                    Terminal Tải Phương Tiện
                                </h4>
                            </div>

                            {/* Body */}
                            <div className="p-4 space-y-4">
                                <input
                                    type="url"
                                    placeholder="🔗 URL (YouTube, TikTok...)"
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    disabled={isLoading}
                                    className="w-full bg-zinc-950/50 border border-white/10 hover:border-white/20 focus:border-blue-500/50 rounded-lg px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none transition-all"
                                />

                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setFormat('best')}
                                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-all border ${format === 'best'
                                                ? 'bg-zinc-800 text-zinc-100 border-white/10 shadow-sm'
                                                : 'bg-transparent text-zinc-500 hover:text-zinc-300 border-transparent hover:bg-white/5'
                                            }`}
                                    >
                                        <FileVideo className="w-4 h-4" /> Video Cao
                                    </button>
                                    <button
                                        onClick={() => setFormat('audio')}
                                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-all border ${format === 'audio'
                                                ? 'bg-zinc-800 text-zinc-100 border-white/10 shadow-sm'
                                                : 'bg-transparent text-zinc-500 hover:text-zinc-300 border-transparent hover:bg-white/5'
                                            }`}
                                    >
                                        <FileAudio className="w-4 h-4" /> Bản MP3
                                    </button>
                                </div>

                                <button
                                    onClick={startDownload}
                                    disabled={isLoading || !url}
                                    className="w-full bg-zinc-100 hover:bg-white focus:ring-2 focus:ring-zinc-100/50 text-zinc-950 font-semibold py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isLoading ? (
                                        <><Loader2 className="w-4 h-4 animate-spin" /> Kết nối luồng...</>
                                    ) : (
                                        "Tiến Hành Trích Xuất"
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    </PopoverContent>
                )}
            </AnimatePresence>
        </Popover>
    )
}
