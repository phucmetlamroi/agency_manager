'use client'

import { useState, useTransition } from 'react'
import { createAgency } from '@/actions/agency-actions'
import { toast } from 'sonner'
import { Loader2, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function CreateAgencyForm({ users }: { users: any[] }) {
    const [isOpen, setIsOpen] = useState(false)
    const [name, setName] = useState('')
    const [code, setCode] = useState('')
    const [ownerId, setOwnerId] = useState('')
    const [isPending, startTransition] = useTransition()
    const router = useRouter()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!name || !code) return

        startTransition(async () => {
            const res = await createAgency({
                name,
                code,
                ownerId: ownerId || undefined
            })

            if (res.success) {
                toast.success('Đã tạo Đại lý thành công')
                setIsOpen(false)
                setName('')
                setCode('')
                setOwnerId('')
                router.refresh()
            } else {
                toast.error(res.error || 'Lỗi khi tạo Đại lý')
            }
        })
    }

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg font-bold shadow-lg shadow-blue-500/20 transition-all"
            >
                <Plus size={18} />
                Thêm Đại Lý Mới
            </button>
        )
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 shadow-2xl">
                <h3 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent mb-6">
                    Thêm Đại Lý Mới
                </h3>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">Tên Đại Lý / Agency Name</label>
                        <input
                            required
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="VD: Top Media Agency"
                            className="w-full bg-[#111] border border-white/10 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">Mã Đại Lý / Code (Duy nhất)</label>
                        <input
                            required
                            type="text"
                            value={code}
                            onChange={(e) => setCode(e.target.value.toUpperCase())}
                            placeholder="VD: TOP01"
                            maxLength={10}
                            className="w-full bg-[#111] border border-white/10 rounded-lg px-4 py-3 text-white font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">Chủ sở hữu / Owner (Optional)</label>
                        <select
                            value={ownerId}
                            onChange={(e) => setOwnerId(e.target.value)}
                            className="w-full bg-[#111] border border-white/10 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                        >
                            <option value="">-- Chưa chọn chủ sở hữu --</option>
                            {users.map(u => (
                                <option key={u.id} value={u.id}>
                                    {u.nickname || u.username} ({u.username})
                                </option>
                            ))}
                        </select>
                        <p className="text-[10px] text-gray-500 mt-1">User được chọn sẽ trở thành Agency Admin.</p>
                    </div>

                    <div className="flex gap-3 mt-6">
                        <button
                            type="button"
                            onClick={() => setIsOpen(false)}
                            className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg font-medium transition-colors"
                        >
                            Hủy
                        </button>
                        <button
                            type="submit"
                            disabled={isPending}
                            className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg font-bold flex items-center justify-center gap-2 shadowed-btn"
                        >
                            {isPending ? <Loader2 className="animate-spin w-4 h-4" /> : 'Tạo Đại Lý'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
