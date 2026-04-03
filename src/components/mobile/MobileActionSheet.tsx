'use client'

import { TaskWithUser } from '@/types/admin'

export default function MobileActionSheet({
    task,
    isOpen,
    onClose,
    onStatusChange,
    onEdit,
    onDelete,
    isAdmin
}: {
    task: TaskWithUser | null,
    isOpen: boolean,
    onClose: () => void,
    onStatusChange: (status: string) => void,
    onEdit: () => void,
    onDelete: () => void,
    isAdmin: boolean
}) {
    if (!isOpen || !task) return null

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>

            {/* Sheet */}
            <div className="relative w-full max-w-md bg-[#1a1a1a] rounded-t-2xl p-6 border-t border-white/10 animate-slide-up pb-10">
                <div className="w-12 h-1 bg-gray-600 rounded-full mx-auto mb-6"></div>

                <h3 className="text-xl font-bold mb-1 truncate">{task.title}</h3>
                <p className="text-sm text-gray-400 mb-6 uppercase tracking-wider">{task.status}</p>

                <div className="flex flex-col gap-3">
                    {/* User Actions */}
                    {!isAdmin && (
                        <>
                            {task.status === 'Nh\u1eadn task' && (
                                <button onClick={() => onStatusChange('\u0110ang th\u1ef1c hi\u1ec7n')} className="w-full py-3 bg-yellow-500 text-black font-bold rounded-xl text-lg shadow-lg shadow-yellow-500/20 active:scale-95 transition-transform">
                                    {"\u25b6 B\u1eaft \u0111\u1ea7u l\u00e0m"}
                                </button>
                            )}
                            {task.status === '\u0110ang th\u1ef1c hi\u1ec7n' && (
                                <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-yellow-500 text-center font-bold">
                                    {"\u25cf \u0110ang th\u1ef1c hi\u1ec7n..."}
                                </div>
                            )}
                            {/* Only Admin can "Approve" or move to Done? Or User can mark as Done? 
                                Currently User cannot mark Done directly in new logic? Wait, user CAN see 'Hoàn tất' badge but logic says Admin moves it?
                                Let's assume User can Nộp Báo Cáo via Edit Form.
                             */}
                            <button onClick={onEdit} className="w-full py-3 bg-gray-800 text-white font-bold rounded-xl border border-white/10 active:scale-95 transition-transform">
                                {"\ud83d\udcdd N\u1ed9p b\u00e0i / Ghi ch\u00fa"}
                            </button>
                        </>
                    )}

                    {/* Admin Actions */}
                    {isAdmin && (
                        <>
                            <button onClick={onEdit} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-600/20 active:scale-95 transition-transform">
                                ✏️ Chỉnh sửa chi tiết
                            </button>

                            <div className="grid grid-cols-2 gap-3">
                                <button onClick={() => onStatusChange('\u0110ang th\u1ef1c hi\u1ec7n')} className="py-3 bg-gray-800 text-yellow-400 font-bold rounded-xl border border-white/10">
                                    {"\u25b6 Resume"}
                                </button>
                                <button onClick={() => onStatusChange('T\u1ea1m ng\u01b0ng')} className="py-3 bg-gray-800 text-gray-400 font-bold rounded-xl border border-white/10">
                                    {"\u23f8 Pause"}
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <button onClick={() => onStatusChange('Revision')} className="py-3 bg-red-500/20 text-red-400 font-bold rounded-xl border border-red-500/20">
                                    {"\u26a0\ufe0f Revision"}
                                </button>
                                <button onClick={() => onStatusChange('Ho\u00e0n t\u1ea5t')} className="py-3 bg-green-600 text-white font-bold rounded-xl shadow-lg shadow-green-600/20">
                                    {"\u2705 Ho\u00e0n t\u1ea5t"}
                                </button>
                            </div>

                            <button onClick={onDelete} className="w-full py-3 bg-red-600/10 text-red-500 font-bold rounded-xl border border-red-500/20 mt-2">
                                {"\ud83d\uddd1\ufe0f X\u00f3a Task"}
                            </button>
                        </>
                    )}

                    <button onClick={onClose} className="w-full py-3 mt-2 text-gray-500 font-bold">
                        {"\u0110\u00f3ng"}
                    </button>
                </div>
            </div>
        </div>
    )
}
