'use client'

import React, { useState } from 'react'
import { Plus, Edit2, Trash2, Image as ImageIcon, X } from 'lucide-react'
import Image from 'next/image'
import { createProfile, updateProfile, deleteProfile } from '@/actions/admin-profile-actions'

type Profile = {
    id: string;
    name: string;
    bannerUrl: string | null;
    logoUrl: string | null;
}

export default function ProfileManagement({ initialProfiles }: { initialProfiles: Profile[] }) {
    const [profiles, setProfiles] = useState<Profile[]>(initialProfiles)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingProfile, setEditingProfile] = useState<Profile | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const [formData, setFormData] = useState({
        name: '',
        bannerUrl: '',
        logoUrl: ''
    })

    const openCreateModal = () => {
        setEditingProfile(null)
        setFormData({ name: '', bannerUrl: '', logoUrl: '' })
        setError('')
        setIsModalOpen(true)
    }

    const openEditModal = (profile: Profile) => {
        setEditingProfile(profile)
        setFormData({
            name: profile.name,
            bannerUrl: profile.bannerUrl || '',
            logoUrl: profile.logoUrl || ''
        })
        setError('')
        setIsModalOpen(true)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError('')

        try {
            if (editingProfile) {
                const result = await updateProfile(editingProfile.id, formData)
                if (result.success && result.profile) {
                    setProfiles(profiles.map(p => p.id === editingProfile.id ? result.profile : p))
                    setIsModalOpen(false)
                }
            } else {
                const result = await createProfile(formData)
                if (result.success && result.profile) {
                    setProfiles([...profiles, result.profile])
                    setIsModalOpen(false)
                }
            }
        } catch (err: any) {
            setError(err.message || 'Có lỗi xảy ra')
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Bạn có chắc chắn muốn xóa Team "${name}"? Thao tác này chỉ thực hiện được nếu Team không còn User hoặc Workspace nào.`)) {
            return
        }

        try {
            const result = await deleteProfile(id)
            if (result.success) {
                setProfiles(profiles.filter(p => p.id !== id))
            }
        } catch (err: any) {
            alert(err.message || 'Lỗi khi xóa Team')
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-xl font-bold text-white">Quản lý Team (Profiles)</h3>
                    <p className="text-sm text-neutral-400">Tạo và cấu hình không gian làm việc cho các Agency.</p>
                </div>
                <button
                    onClick={openCreateModal}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-medium text-sm"
                >
                    <Plus className="w-4 h-4" />
                    Thêm Team Mới
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {profiles.map(profile => {
                    const bannerSrc = profile.bannerUrl || 'https://images.unsplash.com/photo-1557683316-973673baf926?q=80&w=1000'
                    const logoSrc = profile.logoUrl || null

                    return (
                        <div key={profile.id} className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden hover:border-neutral-700 transition-colors flex flex-col">
                            {/* Banner */}
                            <div className="h-32 w-full relative">
                                <Image src={bannerSrc} alt={profile.name} fill className="object-cover" unoptimized />
                                <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 to-transparent" />
                                
                                {/* Actions */}
                                <div className="absolute top-3 right-3 flex gap-2">
                                    <button 
                                        onClick={() => openEditModal(profile)}
                                        className="p-2 bg-neutral-900/80 hover:bg-neutral-800 text-neutral-300 rounded-lg backdrop-blur-sm border border-neutral-700/50 transition-colors"
                                        title="Chỉnh sửa"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button 
                                        onClick={() => handleDelete(profile.id, profile.name)}
                                        className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg backdrop-blur-sm border border-red-500/20 transition-colors"
                                        title="Xóa"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="p-5 flex-1 flex flex-col">
                                <div className="flex items-center gap-4 -mt-10 mb-3 relative z-10">
                                    {logoSrc ? (
                                        <div className="w-14 h-14 rounded-lg overflow-hidden bg-neutral-800 border-4 border-neutral-900 flex-shrink-0 relative">
                                            <Image src={logoSrc} alt="Logo" fill className="object-cover" unoptimized />
                                        </div>
                                    ) : (
                                        <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 border-4 border-neutral-900 flex items-center justify-center flex-shrink-0">
                                            <span className="text-xl font-bold text-white">{profile.name.charAt(0).toUpperCase()}</span>
                                        </div>
                                    )}
                                </div>
                                
                                <h4 className="text-lg font-bold text-white mb-1">{profile.name}</h4>
                                <div className="text-xs text-neutral-500 font-mono mt-auto">ID: {profile.id}</div>
                            </div>
                        </div>
                    )
                })}

                {profiles.length === 0 && (
                    <div className="col-span-full p-8 border border-dashed border-neutral-800 rounded-xl text-center text-neutral-500">
                        Chưa có Team nào được tạo.
                    </div>
                )}
            </div>

            {/* Modal Create/Edit */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-md w-full overflow-hidden shadow-2xl">
                        <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
                            <h3 className="font-bold text-white">
                                {editingProfile ? 'Chỉnh sửa Team' : 'Tạo Team Mới'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-neutral-400 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <form onSubmit={handleSubmit} className="p-5 space-y-4">
                            {error && (
                                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg">
                                    {error}
                                </div>
                            )}

                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-neutral-300">Tên Team *</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                                    placeholder="Ví dụ: Hustly Team"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-neutral-300">Logo URL (Tùy chọn)</label>
                                <div className="relative">
                                    <div className="absolute left-3 top-2.5 text-neutral-500">
                                        <ImageIcon className="w-4 h-4" />
                                    </div>
                                    <input
                                        type="url"
                                        value={formData.logoUrl}
                                        onChange={(e) => setFormData({...formData, logoUrl: e.target.value})}
                                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-9 pr-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                                        placeholder="https://..."
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-neutral-300">Banner URL (Tùy chọn)</label>
                                <div className="relative">
                                    <div className="absolute left-3 top-2.5 text-neutral-500">
                                        <ImageIcon className="w-4 h-4" />
                                    </div>
                                    <input
                                        type="url"
                                        value={formData.bannerUrl}
                                        onChange={(e) => setFormData({...formData, bannerUrl: e.target.value})}
                                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-9 pr-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                                        placeholder="https://..."
                                    />
                                </div>
                            </div>

                            <div className="pt-4 flex gap-3 justify-end">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 text-sm font-medium text-neutral-400 hover:text-white transition-colors"
                                >
                                    Hủy
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                                >
                                    {loading ? 'Đang xử lý...' : (editingProfile ? 'Lưu Thay Đổi' : 'Tạo Team')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
