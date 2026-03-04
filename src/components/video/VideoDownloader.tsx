"use client"

import { useState, useCallback } from "react"
import { useParams } from "next/navigation"
import { toast } from "sonner"
import { PlayCircle, Download, FileAudio, FileVideo, UploadCloud, CheckCircle2 } from "lucide-react"

export function VideoDownloader() {
    const params = useParams()
    const workspaceId = params?.workspaceId as string
    const [url, setUrl] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const [format, setFormat] = useState<'best' | 'audio'>('best')

    const validateUrl = (str: string) => {
        try {
            new URL(str);
            return true;
        } catch (_) {
            return false;
        }
    }

    const startDownload = async (targetUrl: string, targetFormat: string) => {
        if (!validateUrl(targetUrl)) {
            toast.error("Vui lòng nhập URL hợp lệ")
            return
        }

        try {
            setIsLoading(true)
            toast.loading("Đang thiết lập luồng tải...", { id: "download-toast" })

            const response = await fetch('/api/vdownloader', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: targetUrl, formatType: targetFormat, workspaceId })
            })

            if (!response.ok) {
                let errorMessage = "Lỗi khi tải video"
                try {
                    const errorData = await response.json()
                    errorMessage = errorData.error || errorMessage
                } catch (e) {
                    errorMessage = `Server Error: ${response.status} ${response.statusText}`
                }
                throw new Error(errorMessage)
            }

            toast.loading("Đường truyền đã được thiết lập, quá trình tải đang diễn ra trong nền...", { id: "download-toast" })

            const contentDisposition = response.headers.get('Content-Disposition')
            let filename = targetFormat === 'audio' ? 'downloadAudio.mp3' : 'downloadVideo.mp4'

            if (contentDisposition) {
                // Handling filename*=UTF-8''... (Standard for international chars)
                const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
                if (utf8Match && utf8Match[1]) {
                    filename = decodeURIComponent(utf8Match[1]);
                } else {
                    // Fallback to standard filename=
                    const standardMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
                    if (standardMatch && standardMatch[1]) {
                        filename = decodeURIComponent(standardMatch[1]);
                    }
                }
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

            toast.success("Tải hoàn tất!", { id: "download-toast" })
            setUrl("")

        } catch (error: any) {
            console.error("Download Error:", error)
            toast.error(error.message || "Tải thất bại, hãy kiểm tra lại URL.", { id: "download-toast" })
        } finally {
            setIsLoading(false)
        }
    }

    const handleDownload = (e: React.FormEvent) => {
        e.preventDefault()
        startDownload(url, format)
    }

    // Drag and Drop handlers
    const onDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(true)
    }, [])
    const onDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
    }, [])
    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
        const droppedText = e.dataTransfer.getData("text")
        if (droppedText && validateUrl(droppedText)) {
            setUrl(droppedText)
            // Optionally auto start?
            // startDownload(droppedText, format)
        } else {
            toast.error("Vui lòng kéo thả Text/URL hợp lệ")
        }
    }, [format])


    return (
        <div
            className="relative overflow-hidden rounded-2xl p-6 h-full flex flex-col justify-between"
            style={{
                backgroundColor: "rgba(9, 9, 11, 0.4)", // zinc-950 transparent
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.1), inset 0 -1px 0 rgba(255, 255, 255, 0.02), 0 8px 32px rgba(0, 0, 0, 0.4)",
                border: "1px solid rgba(255, 255, 255, 0.05)"
            }}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
        >
            {/* Ambient Background Glow */}
            <div className="absolute -right-20 -top-20 w-48 h-48 bg-blue-500/10 rounded-full blur-[80px] pointer-events-none"></div>
            <div className="absolute -left-20 -bottom-20 w-48 h-48 bg-purple-500/10 rounded-full blur-[80px] pointer-events-none"></div>

            {/* Liquid Fill / Progress Overlay implicitly active during download */}
            {isLoading && (
                <div className="absolute inset-0 bg-gradient-to-t from-blue-500/10 to-transparent animate-pulse pointer-events-none" />
            )}

            {/* Header */}
            <div className="flex items-center gap-3 relative z-10 mb-5">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center text-blue-400 shadow-inner border border-white/5">
                    <Download className="h-5 w-5" />
                </div>
                <div>
                    <h3 className="text-zinc-100 font-semibold tracking-wide">Trích Xuất Phương Tiện</h3>
                    <p className="text-xs text-zinc-500">Universal Downloader</p>
                </div>
            </div>

            {/* Dropzone Area & Input */}
            <div
                className={`flex-1 flex flex-col justify-center items-center rounded-xl border-2 border-dashed transition-all duration-300 relative z-10 p-4 mb-4 ${isDragging ? 'border-blue-500/50 bg-blue-500/5 backdrop-blur-sm' : 'border-zinc-800/50 bg-zinc-900/20'
                    }`}
            >
                {isDragging ? (
                    <div className="flex flex-col items-center gap-2 text-blue-400">
                        <UploadCloud className="h-8 w-8 animate-bounce" />
                        <span className="text-sm font-medium">Thả URL vào đây</span>
                    </div>
                ) : (
                    <input
                        type="url"
                        placeholder="Dán link Video (YouTube, TikTok, IG...)"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        disabled={isLoading}
                        className="w-full bg-transparent border-none text-center text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:ring-0"
                    />
                )}
            </div>

            {/* Footer Controls */}
            <div className="flex items-center justify-between gap-3 relative z-10">
                {/* Format Toggle */}
                <div className="flex items-center bg-zinc-900/50 rounded-lg p-1 border border-zinc-800/50">
                    <button
                        type="button"
                        onClick={() => setFormat('best')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${format === 'best' ? 'bg-zinc-800 text-zinc-200 shadow-sm' : 'text-zinc-500 hover:text-zinc-400'
                            }`}
                    >
                        <FileVideo className="w-3.5 h-3.5" /> Video
                    </button>
                    <button
                        type="button"
                        onClick={() => setFormat('audio')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${format === 'audio' ? 'bg-zinc-800 text-zinc-200 shadow-sm' : 'text-zinc-500 hover:text-zinc-400'
                            }`}
                    >
                        <FileAudio className="w-3.5 h-3.5" /> Audio
                    </button>
                </div>

                {/* Download Button */}
                <button
                    onClick={handleDownload}
                    disabled={isLoading || !url}
                    className="flex-1 overflow-hidden relative group bg-zinc-100 hover:bg-white text-zinc-950 font-bold py-2.5 px-4 rounded-lg text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_25px_rgba(255,255,255,0.2)]"
                >
                    {isLoading ? (
                        <>
                            <div className="animate-spin h-4 w-4 border-2 border-zinc-950/20 border-t-zinc-950 rounded-full"></div>
                            Vùi lòng chờ...
                        </>
                    ) : (
                        <>
                            <span className="relative z-10 flex items-center gap-2">Tải ngay <Download className="w-4 h-4 ml-1" /></span>
                        </>
                    )}
                </button>
            </div>
        </div>
    )
}
