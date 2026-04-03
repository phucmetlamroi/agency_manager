"use client"

import { useState, useRef, useTransition } from 'react'
import { uploadAvatar } from '@/actions/upload-actions'
import { toast } from 'sonner'
import Image from 'next/image'
import { Loader2, UploadCloud, User, Camera } from 'lucide-react'
import { Button } from "@/components/ui/button"

export default function AvatarUpload({ user }: { user: any }) {
    const [isPending, startTransition] = useTransition()
    const [preview, setPreview] = useState<string | null>(user.avatarUrl || null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return

        if (file.size > 10 * 1024 * 1024) {
            toast.error('Dung lượng ảnh tối đa là 10MB')
            return
        }

        // Show local preview immediately
        const objectUrl = URL.createObjectURL(file)
        setPreview(objectUrl)

        // Auto-upload
        const formData = new FormData()
        formData.append('file', file)

        startTransition(async () => {
            const res = await uploadAvatar(user.id, formData)
            if (res.error) {
                toast.error(res.error)
                // Revert preview on error
                setPreview(user.avatarUrl || null)
            } else {
                toast.success('Đã cập nhật ảnh đại diện! ✨')
            }
        })
    }

    return (
        <div className="flex flex-col items-center gap-4">
            <div 
                className="relative group cursor-pointer"
                onClick={() => !isPending && fileInputRef.current?.click()}
            >
                {/* Outer Ring / Glow */}
                <div className="absolute -inset-1 bg-gradient-to-tr from-indigo-500 to-purple-600 rounded-full blur opacity-25 group-hover:opacity-50 transition duration-500"></div>
                
                {/* Avatar Container */}
                <div className="relative w-32 h-32 md:w-40 md:h-40 rounded-full overflow-hidden border-4 border-zinc-900 bg-zinc-800 shadow-2xl">
                    {preview ? (
                        <Image
                            src={preview}
                            alt="Avatar Preview"
                            fill
                            className="object-cover"
                            unoptimized
                        />
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500 bg-zinc-900">
                            <User className="w-12 h-12 mb-1 opacity-20" />
                            <span className="text-[10px] uppercase tracking-widest font-bold opacity-40">No Image</span>
                        </div>
                    )}

                    {/* Loading Overlay */}
                    {isPending && (
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex flex-col items-center justify-center animate-in fade-in duration-300">
                            <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                            <span className="text-[10px] text-zinc-300 mt-2 font-bold uppercase tracking-tighter">Uploading...</span>
                        </div>
                    )}

                    {/* Hover Overlay */}
                    {!isPending && (
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center backdrop-blur-[2px]">
                            <Camera className="w-8 h-8 text-white mb-1" />
                            <span className="text-[10px] text-white font-bold uppercase tracking-widest">Thay đổi</span>
                        </div>
                    )}
                </div>
                
                {/* Status Indicator */}
                <div className="absolute bottom-2 right-2 w-6 h-6 bg-emerald-500 border-4 border-zinc-950 rounded-full shadow-lg"></div>
            </div>

            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/png, image/jpeg, image/jpg, image/webp"
                onChange={handleFileChange}
            />

            <div className="text-center">
                <h4 className="text-zinc-200 font-bold text-lg">{user.username}</h4>
                <p className="text-zinc-500 text-xs uppercase tracking-widest font-medium mt-0.5">{user.role}</p>
                
                <div className="mt-4 flex items-center justify-center gap-2">
                    <Button 
                        variant="outline" 
                        size="sm"
                        className="bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:text-zinc-200 h-8 text-[11px] font-bold uppercase tracking-wider"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isPending}
                    >
                        <UploadCloud className="w-3.5 h-3.5 mr-2" />
                        Tải ảnh mới
                    </Button>
                </div>
                <p className="text-[10px] text-zinc-600 mt-3 italic">Hỗ trợ JPG, PNG, WebP (Tối đa 10MB)</p>
            </div>
        </div>
    )
}
