'use client'

import { useState } from 'react'
import { createClient } from '@/actions/crm-actions'

type Client = {
    id: number
    name: string
    subsidiaries?: Client[]
}

export default function CreateClientButton({ partners }: { partners: Client[] }) {
    const [isOpen, setIsOpen] = useState(false)
    const [name, setName] = useState('')
    const [parentId, setParentId] = useState<number | ''>('')
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            const res = await createClient({
                name,
                parentId: parentId ? Number(parentId) : undefined
            })
            if (res.success) {
                setIsOpen(false)
                setName('')
                setParentId('')
                // Usually we'd show a toast here
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
                className="btn btn-primary text-sm px-3 py-1"
                style={{ background: '#7c3aed', color: 'white', border: 'none' }}
            >
                + Thêm Khách
            </button>

            {isOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-[#1a1a1a] p-6 rounded-lg w-full max-w-sm border border-gray-700 shadow-xl">
                        <h3 className="text-lg font-bold mb-4 text-white">Thêm Khách hàng Mới</h3>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Tên khách hàng</label>
                                <input
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder="Ví dụ: Cameraman A, Shop X..."
                                    className="w-full p-2 bg-[#2a2a2a] border border-[#444] rounded text-white"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs text-gray-400 mb-1">Là con của (Optional)</label>
                                <select
                                    value={parentId}
                                    onChange={e => setParentId(Number(e.target.value) || '')}
                                    className="w-full p-2 bg-[#2a2a2a] border border-[#444] rounded text-white"
                                >
                                    <option value="">-- Là Đối tác (Cấp 1) --</option>
                                    {partners.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                                <p className="text-[10px] text-gray-500 mt-1">
                                    Để trống nếu đây là Partner (Agency/Cameraman).
                                    Chọn Partner nếu đây là End-Client.
                                </p>
                            </div>

                            <div className="flex justify-end gap-2 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsOpen(false)}
                                    className="px-3 py-1 text-gray-400 hover:text-white"
                                >
                                    Hủy
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded disabled:opacity-50"
                                >
                                    {loading ? 'Đang tạo...' : 'Tạo mới'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    )
}
