'use client'

import { useState } from 'react'
import { updateProfile, changePassword } from '@/actions/profile-actions'

export default function ProfileForm({ user }: { user: any }) {
    const [isLoading, setIsLoading] = useState(false)
    const [message, setMessage] = useState('')

    // Pass states
    const [currentPass, setCurrentPass] = useState('')
    const [newPass, setNewPass] = useState('')
    const [confirmPass, setConfirmPass] = useState('')

    async function handleUpdateInfo(formData: FormData) {
        setIsLoading(true)
        setMessage('')

        const data = {
            nickname: formData.get('nickname') as string,
            email: formData.get('email') as string,
            phoneNumber: formData.get('phoneNumber') as string
        }

        const res = await updateProfile(user.id, data)
        setIsLoading(false)

        if (res.error) {
            setMessage('❌ ' + res.error)
        } else {
            setMessage('✅ Cập nhật thông tin thành công!')
        }
    }

    async function handleChangePass(e: React.FormEvent) {
        e.preventDefault()
        if (newPass !== confirmPass) {
            setMessage('❌ Mật khẩu mới không khớp')
            return
        }
        if (newPass.length < 6) {
            setMessage('❌ Mật khẩu phải từ 6 ký tự')
            return
        }

        setIsLoading(true)
        setMessage('')

        const res = await changePassword(user.id, currentPass, newPass)
        setIsLoading(false)

        if (res.error) {
            setMessage('❌ ' + res.error)
        } else {
            setMessage('✅ Đổi mật khẩu thành công!')
            setCurrentPass('')
            setNewPass('')
            setConfirmPass('')
        }
    }

    return (
        <div className="space-y-8">
            {message && (
                <div className={`p-4 rounded-lg ${message.startsWith('✅') ? 'bg-green-900/50 text-green-200' : 'bg-red-900/50 text-red-200'}`}>
                    {message}
                </div>
            )}

            {/* General Info Form */}
            <form action={handleUpdateInfo} className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Username (Đăng nhập)</label>
                        <input
                            type="text"
                            value={user.username}
                            disabled
                            className="w-full bg-gray-800/50 border border-gray-700 rounded p-2 text-gray-500 cursor-not-allowed"
                        />
                        <p className="text-xs text-gray-500 mt-1">Không thể thay đổi tên đăng nhập</p>
                    </div>

                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Nickname (Tên hiển thị)</label>
                        <input
                            name="nickname"
                            type="text"
                            defaultValue={user.nickname || ''}
                            placeholder="Ví dụ: Editor Pro"
                            className="w-full bg-gray-700 text-white border border-gray-600 rounded p-2 focus:border-purple-500 focus:outline-none"
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Email (Nhận thông báo)</label>
                        <input
                            name="email"
                            type="email"
                            defaultValue={user.email || ''}
                            placeholder="email@example.com"
                            required
                            className="w-full bg-gray-700 text-white border border-gray-600 rounded p-2 focus:border-purple-500 focus:outline-none"
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Số điện thoại</label>
                        <input
                            name="phoneNumber"
                            type="tel"
                            defaultValue={user.phoneNumber || ''}
                            placeholder="0912..."
                            className="w-full bg-gray-700 text-white border border-gray-600 rounded p-2 focus:border-purple-500 focus:outline-none"
                        />
                    </div>
                </div>

                <div className="flex justify-end">
                    <button
                        disabled={isLoading}
                        type="submit"
                        className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2 rounded-lg font-bold transition-all disabled:opacity-50"
                    >
                        {isLoading ? 'Đang lưu...' : 'Lưu thay đổi'}
                    </button>
                </div>
            </form>

            <div className="border-t border-gray-700 pt-6">
                <h3 className="text-lg font-semibold text-purple-300 mb-4">Đổi mật khẩu</h3>
                <form onSubmit={handleChangePass} className="space-y-4 max-w-md">
                    <div>
                        <input
                            type="password"
                            placeholder="Mật khẩu hiện tại"
                            value={currentPass}
                            onChange={(e) => setCurrentPass(e.target.value)}
                            className="w-full bg-gray-700 text-white border border-gray-600 rounded p-2"
                        />
                    </div>
                    <div>
                        <input
                            type="password"
                            placeholder="Mật khẩu mới (Min 6 ký tự)"
                            value={newPass}
                            onChange={(e) => setNewPass(e.target.value)}
                            className="w-full bg-gray-700 text-white border border-gray-600 rounded p-2"
                        />
                    </div>
                    <div>
                        <input
                            type="password"
                            placeholder="Nhập lại mật khẩu mới"
                            value={confirmPass}
                            onChange={(e) => setConfirmPass(e.target.value)}
                            className="w-full bg-gray-700 text-white border border-gray-600 rounded p-2"
                        />
                    </div>
                    <button
                        disabled={isLoading || !currentPass || !newPass}
                        className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded-lg font-bold transition-all disabled:opacity-50 w-full md:w-auto"
                    >
                        Đổi mật khẩu
                    </button>
                </form>
            </div>
        </div>
    )
}
