"use client"

import { useState, useRef, useTransition } from 'react'
import { uploadPaymentQr } from '@/actions/upload-actions'
import { toast } from 'sonner'
import Image from 'next/image'
import { Loader2, UploadCloud, CreditCard } from 'lucide-react'
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function PaymentQrUpload({ user }: { user: any }) {
    const [isPending, startTransition] = useTransition()
    const [isProcessing, setIsProcessing] = useState(false)
    const [preview, setPreview] = useState<string | null>(user.paymentQrUrl || null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [processedFile, setProcessedFile] = useState<File | null>(null)

    async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return

        if (file.size > 10 * 1024 * 1024) {
            toast.error('File quá lớn! Vui lòng chọn ảnh < 10MB')
            return
        }

        setIsProcessing(true)
        try {
            const { smartCropQr } = await import('@/lib/smart-qr')
            const croppedFile = await smartCropQr(file)
            setProcessedFile(croppedFile)
            const objectUrl = URL.createObjectURL(croppedFile)
            setPreview(objectUrl)

            if (croppedFile !== file) {
                toast.success('Đã tìm thấy & Cắt QR thành công! ✨')
            } else {
                toast.info('Không tìm thấy QR trong ảnh. Đã giữ nguyên ảnh gốc.')
            }
        } catch (error) {
            console.error('Smart crop failed', error)
            setProcessedFile(file)
            setPreview(URL.createObjectURL(file))
        } finally {
            setIsProcessing(false)
        }
    }

    async function handleSubmit(formData: FormData) {
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
        <Card className="bg-[#1a1a1a] border-[#333]">
            <CardHeader>
                <div className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-green-400" />
                    <CardTitle className="text-white">Thông Tin Nhận Lương</CardTitle>
                </div>
                <CardDescription>Cập nhật QR và tài khoản ngân hàng để nhận lương tự động.</CardDescription>
            </CardHeader>
            <CardContent>
                <form action={handleSubmit} id="payment-form" className="space-y-6">
                    {/* QR Upload Area */}
                    <div
                        className="border-2 border-dashed border-gray-700 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-gray-500 hover:bg-white/5 transition-all group min-h-[200px]"
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
                                <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                                    <UploadCloud className="w-6 h-6 text-gray-400" />
                                </div>
                                <p className="text-sm text-gray-300 font-medium">Bấm để tải ảnh QR</p>
                                <p className="text-xs text-gray-500 mt-1">JPG, PNG (Max 10MB)</p>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-gray-400">Ngân hàng</Label>
                            <Input
                                name="bankName"
                                defaultValue={user.paymentBankName || ''}
                                placeholder="Vietcombank, Techcombank..."
                                className="bg-[#2a2a2a] border-gray-700 text-white"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-gray-400">Số tài khoản</Label>
                            <Input
                                name="accountNum"
                                defaultValue={user.paymentAccountNum || ''}
                                placeholder="0123456789"
                                className="bg-[#2a2a2a] border-gray-700 text-white font-mono"
                            />
                        </div>
                    </div>
                </form>
            </CardContent>
            <CardFooter className="flex justify-end">
                <Button type="submit" form="payment-form" disabled={isPending} className="bg-gradient-to-r from-green-500 to-emerald-600 border-0 hover:brightness-110">
                    {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {isPending ? 'Đang xử lý...' : 'Lưu thông tin'}
                </Button>
            </CardFooter>
        </Card>
    )
}
