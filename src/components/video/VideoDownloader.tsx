"use client"

import { useState } from "react"
import { toast } from "sonner"
import { PlayCircle, Download } from "lucide-react"

export function VideoDownloader() {
    const [url, setUrl] = useState("")
    const [isLoading, setIsLoading] = useState(false)

    const handleDownload = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!url) {
            toast.error("Vui lòng nhập URL hợp lệ")
            return
        }

        try {
            setIsLoading(true)
            toast.loading("Đang phân tích URL và khởi tạo luồng tải...", { id: "download-toast" })

            const response = await fetch('/api/download', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url })
            })

            if (!response.ok) {
                let errorMessage = "Lỗi khi tải video"
                try {
                    const errorData = await response.json()
                    errorMessage = errorData.error || errorMessage
                } catch (e) {
                    // If not JSON, use status text or a generic message
                    errorMessage = `Server Error: ${response.status} ${response.statusText}`
                }
                throw new Error(errorMessage)
            }

            toast.loading("Bắt đầu stream dữ liệu về máy...", { id: "download-toast" })

            // Get filename from header if possible
            const contentDisposition = response.headers.get('Content-Disposition')
            let filename = 'downloaded_video.mp4'
            if (contentDisposition && contentDisposition.includes('filename=')) {
                const match = contentDisposition.match(/filename="?([^"]+)"?/)
                if (match && match[1]) {
                    filename = match[1]
                }
            }

            // Create a blob from the streaming response
            const blob = await response.blob()
            const downloadUrl = window.URL.createObjectURL(blob)

            // Trigger download
            const a = document.createElement('a')
            a.href = downloadUrl
            a.download = filename
            document.body.appendChild(a)
            a.click()
            window.URL.revokeObjectURL(downloadUrl)
            document.body.removeChild(a)

            toast.success("Tải hoàn tất!", { id: "download-toast" })
            setUrl("")

        } catch (error: any) {
            console.error("Download Error:", error)
            toast.error(error.message || "Không thể tải video, vui lòng thử lại Link khác", { id: "download-toast" })
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="glass-panel border-none ring-0 bg-transparent p-6 flex flex-col justify-center h-full relative overflow-hidden group">
            {/* Background Glow */}
            <div className="absolute -right-10 -top-10 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-all duration-500 pointer-events-none"></div>

            <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                    <Download className="h-4 w-4" />
                </div>
                <h3 className="text-white font-bold text-lg">Quick Download</h3>
            </div>

            <p className="text-xs text-tremor-content-subtle mb-4">
                Tải video không logo tốc độ cao trực tiếp từ YouTube, TikTok, IG...
            </p>

            <form onSubmit={handleDownload} className="flex flex-col gap-3 mt-auto">
                <input
                    type="url"
                    placeholder="Dán link video vào đây..."
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={isLoading}
                    className="w-full bg-zinc-900/50 border border-white/10 rounded-lg px-4 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                />
                <button
                    type="submit"
                    disabled={isLoading || !url}
                    className="w-full bg-white/10 hover:bg-white/20 text-white font-bold py-2 rounded-lg text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-white/5"
                >
                    {isLoading ? (
                        <>
                            <div className="animate-spin h-4 w-4 border-2 border-white/20 border-t-white rounded-full"></div>
                            Đang xử lý...
                        </>
                    ) : (
                        <>
                            <PlayCircle className="h-4 w-4" />
                            Tải Ngay
                        </>
                    )}
                </button>
            </form>

            {/* Supported Platforms Icons */}
            <div className="flex items-center justify-center gap-3 mt-4 opacity-30 grayscale">
                <span className="text-[10px] font-mono tracking-widest">YT - TT - FB - IG</span>
            </div>
        </div>
    )
}
