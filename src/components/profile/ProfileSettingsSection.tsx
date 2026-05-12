'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Settings, Image as ImageIcon, Save, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { updateProfileSettings } from '@/actions/profile-actions'
import { uploadProfileBanner, uploadProfileLogo } from '@/actions/upload-actions'
import DeleteProfileModal from './DeleteProfileModal'

type Props = {
    profileId: string
    initial: {
        name: string
        bannerUrl: string | null
        logoUrl: string | null
    }
}

export default function ProfileSettingsSection({ profileId, initial }: Props) {
    const router = useRouter()
    const [name, setName] = useState(initial.name)
    const [bannerUrl, setBannerUrl] = useState(initial.bannerUrl)
    const [logoUrl, setLogoUrl] = useState(initial.logoUrl)
    const [savingName, setSavingName] = useState(false)
    const [uploadingBanner, setUploadingBanner] = useState(false)
    const [uploadingLogo, setUploadingLogo] = useState(false)
    const [showDeleteModal, setShowDeleteModal] = useState(false)

    const nameChanged = name.trim() !== initial.name && name.trim().length > 0

    async function handleSaveName() {
        if (!nameChanged) return
        setSavingName(true)
        try {
            const result = await updateProfileSettings(profileId, { name: name.trim() })
            if ('error' in result && result.error) {
                toast.error(result.error)
            } else {
                toast.success('Đã cập nhật tên Profile.')
                router.refresh()
            }
        } finally {
            setSavingName(false)
        }
    }

    async function handleUpload(kind: 'banner' | 'logo', file: File) {
        const setLoading = kind === 'banner' ? setUploadingBanner : setUploadingLogo
        const action = kind === 'banner' ? uploadProfileBanner : uploadProfileLogo
        setLoading(true)
        try {
            const formData = new FormData()
            formData.append('file', file)
            const result = await action(profileId, formData)
            if ('error' in result && result.error) {
                toast.error(result.error)
            } else if ('url' in result && result.url) {
                if (kind === 'banner') setBannerUrl(result.url ?? null)
                else setLogoUrl(result.url ?? null)
                toast.success(`Đã cập nhật ${kind === 'banner' ? 'banner' : 'logo'}.`)
                router.refresh()
            }
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="rounded-2xl bg-zinc-950/60 backdrop-blur-xl border border-[rgba(139,92,246,0.15)] overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-white/5">
                <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                    <Settings size={14} /> Profile Settings
                </h3>
            </div>

            {/* Banner */}
            <div className="p-4 space-y-4">
                <div>
                    <label className="text-xs text-zinc-400 font-medium pl-1 block mb-2">Banner</label>
                    <div className="relative rounded-xl overflow-hidden bg-white/[0.04] border border-white/10" style={{ aspectRatio: '3/1' }}>
                        {bannerUrl ? (
                            <img src={bannerUrl} alt="Banner" className="absolute inset-0 w-full h-full object-cover" />
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-zinc-600 text-sm">
                                <ImageIcon size={20} className="mr-2" /> Chưa có banner
                            </div>
                        )}
                        <label className="absolute bottom-2 right-2 px-3 py-1.5 rounded-full bg-zinc-950/80 backdrop-blur-sm text-zinc-200 text-[11px] font-semibold cursor-pointer hover:bg-zinc-900 border border-white/10 flex items-center gap-1.5">
                            {uploadingBanner ? <Loader2 size={11} className="animate-spin" /> : <ImageIcon size={11} />}
                            {uploadingBanner ? 'Đang tải...' : 'Đổi banner'}
                            <input
                                type="file"
                                accept="image/*"
                                disabled={uploadingBanner}
                                onChange={(e) => {
                                    const f = e.target.files?.[0]
                                    if (f) handleUpload('banner', f)
                                }}
                                className="hidden"
                            />
                        </label>
                    </div>
                    <p className="text-[11px] text-zinc-600 mt-1.5 pl-1">Tỷ lệ 3:1, tối ưu 1500x500px. Max 10MB.</p>
                </div>

                {/* Logo */}
                <div>
                    <label className="text-xs text-zinc-400 font-medium pl-1 block mb-2">Logo</label>
                    <div className="flex items-center gap-3">
                        <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-white/[0.04] border border-white/10 flex items-center justify-center shrink-0">
                            {logoUrl ? (
                                <img src={logoUrl} alt="Logo" className="absolute inset-0 w-full h-full object-cover" />
                            ) : (
                                <ImageIcon size={18} className="text-zinc-600" />
                            )}
                        </div>
                        <label className="px-3 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.10] text-zinc-200 text-[12px] font-semibold cursor-pointer border border-white/10 flex items-center gap-1.5">
                            {uploadingLogo ? <Loader2 size={12} className="animate-spin" /> : <ImageIcon size={12} />}
                            {uploadingLogo ? 'Đang tải...' : 'Đổi logo'}
                            <input
                                type="file"
                                accept="image/*"
                                disabled={uploadingLogo}
                                onChange={(e) => {
                                    const f = e.target.files?.[0]
                                    if (f) handleUpload('logo', f)
                                }}
                                className="hidden"
                            />
                        </label>
                    </div>
                    <p className="text-[11px] text-zinc-600 mt-1.5 pl-1">Vuông 512x512px. Max 5MB.</p>
                </div>

                {/* Name */}
                <div>
                    <label className="text-xs text-zinc-400 font-medium pl-1 block mb-2">Tên Profile</label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            maxLength={50}
                            className="flex-1 h-11 rounded-full bg-white/[0.04] border border-[rgba(139,92,246,0.12)] px-[18px] text-[13px] text-zinc-200 outline-none focus:border-violet-500/50"
                        />
                        <button
                            onClick={handleSaveName}
                            disabled={!nameChanged || savingName}
                            className="px-4 py-2 rounded-full bg-violet-600 hover:bg-violet-500 text-white text-[12px] font-semibold disabled:opacity-40 flex items-center gap-1.5"
                        >
                            {savingName ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                            Lưu
                        </button>
                    </div>
                </div>
            </div>

            {/* Danger Zone */}
            <div className="p-4 border-t border-red-500/15 bg-red-500/[0.03]">
                <h4 className="text-[11px] font-bold text-red-300 uppercase tracking-wide flex items-center gap-1.5">
                    <Trash2 size={11} /> Danger Zone
                </h4>
                <p className="text-[12px] text-zinc-400 mt-1.5">
                    Xóa Profile sẽ làm tất cả workspaces + tasks + members bị xóa <strong className="text-red-300">vĩnh viễn sau 30 ngày</strong>. Trong 30 ngày bạn có thể restore từ trang Profile Trash.
                </p>
                <button
                    onClick={() => setShowDeleteModal(true)}
                    className="mt-3 px-4 py-2 rounded-full bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/20 text-[12px] font-semibold flex items-center gap-1.5"
                >
                    <Trash2 size={12} /> Xóa Profile
                </button>
            </div>

            {showDeleteModal && (
                <DeleteProfileModal
                    profileId={profileId}
                    profileName={initial.name}
                    onClose={() => setShowDeleteModal(false)}
                />
            )}
        </div>
    )
}
