'use client'

import { useState, useRef, useTransition } from 'react'
import { uploadPaymentQr } from '@/actions/upload-actions'
import { toast } from 'sonner'
import Image from 'next/image'
import { Loader2, UploadCloud, CreditCard } from 'lucide-react'

export default function PaymentQrUpload({ user }: { user: any }) {
    const [isPending, startTransition] = useTransition()
    const [isProcessing, setIsProcessing] = useState(false)
    const [preview, setPreview] = useState<string | null>(user.paymentQrUrl || null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    // We need to store the processed file to upload it later
    const [processedFile, setProcessedFile] = useState<File | null>(null)

    async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return

        // 1. Client Validation
        if (file.size > 10 * 1024 * 1024) { // Increased limit for raw screenshots handling
            toast.error('File quá lớn! Vui lòng chọn ảnh < 10MB')
            return
        }

        // 2. Smart Crop Processing
        setIsProcessing(true)
        try {
            const { smartCropQr } = await import('@/lib/smart-qr') // Dynamic import to save bundle size
            const croppedFile = await smartCropQr(file)

            setProcessedFile(croppedFile)

            // Preview
            const objectUrl = URL.createObjectURL(croppedFile)
            setPreview(objectUrl)

            if (croppedFile !== file) {
                toast.success('Đã tự động cắt ảnh QR!')
            }
        } catch (error) {
            console.error('Smart crop failed', error)
            // Fallback to original
            setProcessedFile(file)
            setPreview(URL.createObjectURL(file))
        } finally {
            setIsProcessing(false)
        }
    }

    async function handleSubmit(formData: FormData) {
        // If we have a processed file, we must use it instead of the form's default file
        if (processedFile) {
            formData.set('file', processedFile)
        }

        startTransition(async () => {
            const res = await uploadPaymentQr(user.id, formData)
            if (res.error) {
                toast.error(res.error)
            } else {
                toast.success('Đã cập nhật QR nhận lương!')
            }
        })
    }

    return (
        <div className="bg-white/5 border border-white/10 rounded-xl p-6 backdrop-blur-sm">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-green-400" />
                Thông Tin Nhận Lương
            </h3>

            <form action={handleSubmit} className="space-y-4">
                {/* QR Upload Area */}
                <div
                    className="border-2 border-dashed border-gray-600 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 hover:bg-white/5 transition-all group"
                    onClick={() => fileInputRef.current?.click()}
                >
                    <input
                        type="file"
                        name="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="image/png, image/jpeg, image/jpg"
                        onChange={handleFileChange}
                    />

                    {preview ? (
                        <div className="relative w-48 h-48">
                            <Image
                                src={preview}
                                alt="QR Preview"
                                fill
                                className="object-contain rounded-lg"
                            />
                            {isPending && (
                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
                                    <Loader2 className="w-8 h-8 animate-spin text-white" />
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-center">
                            <div className="w-12 h-12 bg-gray-700/50 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                                <UploadCloud className="w-6 h-6 text-gray-400" />
                            </div>
                            <p className="text-sm text-gray-300 font-medium">Bấm để tải ảnh QR</p>
                            <p className="text-xs text-gray-500 mt-1">Hỗ trợ JPG, PNG (Max 4MB)</p>
                        </div>
                    )}
                </div>

                {/* Info Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs text-gray-400 mb-1 block">Ngân hàng</label>
                        <input
                            name="bankName"
                            defaultValue={user.paymentBankName || ''}
                            placeholder="Vietcombank, Techcombank..."
                            className="w-full bg-black/20 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-400 mb-1 block">Số tài khoản</label>
                        <input
                            name="accountNum"
                            defaultValue={user.paymentAccountNum || ''}
                            placeholder="0123456789"
                            className="w-full bg-black/20 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 outline-none font-mono"
                        />
                    </div>
                </div>

                <div className="flex justify-end pt-2">
                    <button
                        disabled={isPending}
                        className="px-6 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold rounded-lg hover:shadow-lg hover:brightness-110 transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                        {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                        {isPending ? 'Đang xử lý tối ưu ảnh...' : 'Lưu thông tin'}
                    </button>
                </div>
            </form>
        </div>
    )
}
