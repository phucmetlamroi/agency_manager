'use client'

import { useState } from 'react'
import { createClient } from '@/actions/crm-actions'

export default function CreateSubClientButton({ parentId, parentName }: { parentId: number, parentName: string }) {
    const [isOpen, setIsOpen] = useState(false)
    const [name, setName] = useState('')
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            const res = await createClient({
                name,
                parentId
            })
            if (res.success) {
                setIsOpen(false)
                setName('')
                window.location.reload() // Refresh to show new sub-client
            } else {
                alert('Tạo thất bại')
            }
        } catch (error) {
            console.error(error)
        } finally {
            setLoading(false)
        }
    }

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="px-3 py-1 bg-purple-600/20 text-purple-400 hover:bg-purple-600/40 text-xs font-bold rounded border border-purple-600/50 flex items-center gap-2"
            >
                <span>➕ Thêm Brand / Client con</span>
            </button>

            {isOpen && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-[#1a1a1a] p-6 rounded-xl w-full max-w-sm border border-purple-500/30 shadow-2xl">
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-lg font-bold text-white">Thêm Khách hàng mới</h3>
                            <button onClick={() => setIsOpen(false)} className="text-gray-500 hover:text-white">✕</button>
                        </div>

                        <div className="mb-4 text-sm text-gray-400">
                            Bạn đang thêm Brand/Dự án con cho Partner: <br />
                            <strong className="text-purple-400 text-base">{parentName}</strong>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs text-gray-500 mb-1 uppercase font-bold">Tên Brand / Dự án</label>
                                <input
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder="VD: Shop Thời Trang A..."
                                    className="w-full p-3 bg-black/40 border border-gray-700 rounded-lg text-white focus:border-purple-500 outline-none"
                                    autoFocus
                                    required
                                />
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setIsOpen(false)}
                                    className="flex-1 py-2 text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg font-medium"
                                >
                                    Đóng
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold shadow-lg shadow-purple-900/50 disabled:opacity-50"
                                >
                                    {loading ? 'Đang tạo...' : 'Xác nhận tạo'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    )
}
