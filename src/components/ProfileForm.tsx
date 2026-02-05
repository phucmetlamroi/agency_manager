"use client"

import { useState } from 'react'
import { updateProfile, changePassword } from '@/actions/profile-actions'
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

export default function ProfileForm({ user }: { user: any }) {
    const [isLoading, setIsLoading] = useState(false)

    // Pass states
    const [currentPass, setCurrentPass] = useState('')
    const [newPass, setNewPass] = useState('')
    const [confirmPass, setConfirmPass] = useState('')
    const [passLoading, setPassLoading] = useState(false)

    async function handleUpdateInfo(formData: FormData) {
        setIsLoading(true)
        const data = {
            nickname: formData.get('nickname') as string,
            email: formData.get('email') as string,
            phoneNumber: formData.get('phoneNumber') as string
        }

        const res = await updateProfile(user.id, data)
        setIsLoading(false)

        if (res.error) {
            toast.error(res.error)
        } else {
            toast.success('Cập nhật thông tin thành công!')
        }
    }

    async function handleChangePass(e: React.FormEvent) {
        e.preventDefault()
        if (newPass !== confirmPass) {
            toast.error('Mật khẩu mới không khớp')
            return
        }
        if (newPass.length < 6) {
            toast.error('Mật khẩu phải từ 6 ký tự')
            return
        }

        setPassLoading(true)

        const res = await changePassword(user.id, currentPass, newPass)
        setPassLoading(false)

        if (res.error) {
            toast.error(res.error)
        } else {
            toast.success('Đổi mật khẩu thành công!')
            setCurrentPass('')
            setNewPass('')
            setConfirmPass('')
        }
    }

    return (
        <div className="space-y-6">
            <Card className="bg-[#1a1a1a] border-[#333]">
                <CardHeader>
                    <CardTitle className="text-white">Thông tin cá nhân</CardTitle>
                    <CardDescription>Quản lý thông tin hiển thị và liên hệ của bạn.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form action={handleUpdateInfo} id="profile-form">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="username" className="text-gray-400">Username</Label>
                                <Input id="username" value={user.username} disabled className="bg-gray-800/50 border-gray-700 text-gray-500" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="nickname" className="text-white">Nickname (Hiển thị)</Label>
                                <Input
                                    id="nickname"
                                    name="nickname"
                                    defaultValue={user.nickname || ''}
                                    className="bg-[#2a2a2a] border-gray-700 text-white focus:ring-purple-500"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email" className="text-white">Email</Label>
                                <Input
                                    id="email"
                                    name="email"
                                    type="email"
                                    defaultValue={user.email || ''}
                                    className="bg-[#2a2a2a] border-gray-700 text-white focus:ring-purple-500"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="phoneNumber" className="text-white">Số điện thoại</Label>
                                <Input
                                    id="phoneNumber"
                                    name="phoneNumber"
                                    type="tel"
                                    defaultValue={user.phoneNumber || ''}
                                    className="bg-[#2a2a2a] border-gray-700 text-white focus:ring-purple-500"
                                />
                            </div>
                        </div>
                    </form>
                </CardContent>
                <CardFooter className="flex justify-end">
                    <Button type="submit" form="profile-form" disabled={isLoading} className="bg-purple-600 hover:bg-purple-500">
                        {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Lưu thay đổi
                    </Button>
                </CardFooter>
            </Card>

            <Card className="bg-[#1a1a1a] border-[#333]">
                <CardHeader>
                    <CardTitle className="text-white">Đổi mật khẩu</CardTitle>
                    <CardDescription>Cập nhật mật khẩu định kỳ để bảo vệ tài khoản.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleChangePass} id="password-form" className="max-w-md space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="currentPass" className="text-white">Mật khẩu hiện tại</Label>
                            <Input
                                id="currentPass"
                                type="password"
                                value={currentPass}
                                onChange={(e) => setCurrentPass(e.target.value)}
                                className="bg-[#2a2a2a] border-gray-700 text-white"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="newPass" className="text-white">Mật khẩu mới</Label>
                            <Input
                                id="newPass"
                                type="password"
                                value={newPass}
                                onChange={(e) => setNewPass(e.target.value)}
                                className="bg-[#2a2a2a] border-gray-700 text-white"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirmPass" className="text-white">Nhập lại mật khẩu mới</Label>
                            <Input
                                id="confirmPass"
                                type="password"
                                value={confirmPass}
                                onChange={(e) => setConfirmPass(e.target.value)}
                                className="bg-[#2a2a2a] border-gray-700 text-white"
                            />
                        </div>
                    </form>
                </CardContent>
                <CardFooter className="flex justify-end">
                    <Button
                        type="submit"
                        form="password-form"
                        disabled={passLoading || !currentPass || !newPass}
                        variant="secondary"
                        className="bg-gray-800 text-white hover:bg-gray-700"
                    >
                        {passLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Đổi mật khẩu
                    </Button>
                </CardFooter>
            </Card>
        </div>
    )
}
