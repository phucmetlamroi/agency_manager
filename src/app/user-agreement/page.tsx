'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { acceptTermsAction } from '@/actions/tos-actions'
import { Button } from '@/components/ui/button'
import { CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import UserAgreementContent from '@/components/UserAgreementContent'

export default function UserAgreementPage() {
    const [hasReadToBottom, setHasReadToBottom] = useState(false)
    const [isPending, startTransition] = useTransition()
    const observerTarget = useRef<HTMLDivElement>(null)

    useEffect(() => {
        // Prevent body scroll on mobile if needed, though the absolute full-screen handles most cases
        document.body.style.overflow = 'hidden'

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setHasReadToBottom(true)
                }
            },
            { threshold: 1.0 }
        )

        if (observerTarget.current) {
            observer.observe(observerTarget.current)
        }

        return () => {
            document.body.style.overflow = 'unset'
            observer.disconnect()
        }
    }, [])

    const handleAccept = () => {
        startTransition(async () => {
            try {
                const res = await acceptTermsAction()
                if (res?.success) {
                    toast.success('Ký kết thỏa thuận thành công!')
                    // Wait a tiny bit so the toast is visible
                    setTimeout(() => {
                        window.location.href = '/profile'
                    }, 500)
                } else {
                    toast.error('Có lỗi xảy ra, vui lòng thử lại sau.')
                }
            } catch (error) {
                // If it's an actual error (not a redirect which we removed from the action anyway)
                console.error(error)
                toast.error('Có lỗi xảy ra, vui lòng thử lại sau.')
            }
        })
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 md:p-8">
            <div className="w-full max-w-3xl flex flex-col glass-panel shadow-2xl relative animate-in fade-in zoom-in-95 duration-500" style={{ maxHeight: '90vh' }}>
                
                {/* Header */}
                <div className="shrink-0 p-6 border-b border-zinc-800/50 flex flex-col items-center text-center">
                    <div className="w-16 h-16 rounded-full bg-indigo-500/20 flex items-center justify-center mb-4">
                        <ShieldCheck className="w-8 h-8 text-indigo-400" />
                    </div>
                    <h1 className="text-2xl font-bold title-gradient">Nội Quy & Thỏa Thuận Hệ Thống</h1>
                    <p className="text-zinc-400 mt-2 text-sm max-w-lg">
                        Bạn vui lòng cuộn xuống đọc và hiểu rõ các điều khoản vi phạm lỗi (Error Rating System) chuẩn bị được áp dụng trước khi truy cập hệ thống.
                    </p>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar text-zinc-300 text-sm md:text-base leading-relaxed space-y-6">
                    <UserAgreementContent />
                    
                    {/* Observer target to unlock button */}
                    <div ref={observerTarget} className="h-4 w-full opacity-0" />
                </div>

                {/* Footer / Action */}
                <div className="shrink-0 p-4 md:p-6 border-t border-zinc-800/50 bg-black/20 flex flex-col gap-3">
                    {!hasReadToBottom && (
                        <p className="text-xs text-center text-zinc-500 animate-pulse">
                            Vui lòng cuộn xuống cuối trang để mở khóa thỏa thuận
                        </p>
                    )}
                    <Button 
                        onClick={handleAccept} 
                        disabled={!hasReadToBottom || isPending}
                        className={`w-full h-12 text-base font-semibold tracking-wide transition-all duration-300 ${
                            hasReadToBottom 
                            ? 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 shadow-[0_0_20px_rgba(99,102,241,0.4)]' 
                            : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                        }`}
                    >
                        {isPending ? (
                            <span className="flex items-center gap-2">Đang thiết lập hồ sơ...</span>
                        ) : (
                            <span className="flex items-center gap-2">
                                {hasReadToBottom ? <CheckCircle2 className="w-5 h-5" /> : null}
                                TÔI ĐÃ HIỂU VÀ ĐỒNG Ý VỚI NỘI QUY
                            </span>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    )
}
