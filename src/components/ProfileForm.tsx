"use client"

import { useState } from 'react'
import { updateProfile, changePassword } from '@/actions/profile-actions'
import { toast } from 'sonner'
import { Loader2, User, Mail, Phone, Lock, Eye, EyeOff, Save, KeyRound, AtSign } from 'lucide-react'
import { useParams } from 'next/navigation'

// ── Reusable Glassmorphism Input ──────────────────────────
function GlassInput({ id, name, label, icon: Icon, type = 'text', value, defaultValue, onChange, disabled, placeholder }: {
    id: string; name?: string; label: string; icon: any; type?: string;
    value?: string; defaultValue?: string; onChange?: (e: any) => void; disabled?: boolean; placeholder?: string
}) {
    const [showPass, setShowPass] = useState(false)
    const isPassword = type === 'password'
    const inputType = isPassword ? (showPass ? 'text' : 'password') : type

    return (
        <div>
            <label htmlFor={id} className="block text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">{label}</label>
            <div className="relative">
                <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                <input
                    id={id} name={name} type={inputType}
                    defaultValue={defaultValue} value={value} onChange={onChange}
                    disabled={disabled} placeholder={placeholder}
                    className={`w-full pl-10 pr-${isPassword ? '10' : '4'} py-2.5 rounded-xl text-sm border bg-zinc-900/60 text-zinc-200 placeholder:text-zinc-700 focus:outline-none focus:border-indigo-500/50 focus:bg-zinc-900 transition-all duration-200 ${
                        disabled ? 'border-white/5 text-zinc-600 cursor-not-allowed' : 'border-white/8 hover:border-white/15'
                    }`}
                />
                {isPassword && (
                    <button type="button" onClick={() => setShowPass(!showPass)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300 transition-colors">
                        {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                )}
            </div>
        </div>
    )
}

// ── Section Card ──────────────────────────────────────────
function SettingsCard({ icon: Icon, title, description, accentColor = 'indigo', children, footer }: {
    icon: any; title: string; description: string; accentColor?: string; children: React.ReactNode; footer?: React.ReactNode
}) {
    const colorMap: Record<string, { border: string; bg: string; text: string; glow: string }> = {
        indigo: { border: 'border-indigo-500/20', bg: 'bg-indigo-500/5', text: 'text-indigo-400', glow: 'bg-indigo-500/6' },
        amber: { border: 'border-amber-500/20', bg: 'bg-amber-500/5', text: 'text-amber-400', glow: 'bg-amber-500/6' },
    }
    const c = colorMap[accentColor] || colorMap.indigo

    return (
        <div className={`relative overflow-hidden rounded-2xl border ${c.border} ${c.bg} backdrop-blur-md shadow-xl shadow-black/30`}>
            <div className={`absolute -top-12 -right-12 w-40 h-40 ${c.glow} blur-3xl rounded-full pointer-events-none`} />
            <div className="relative z-10">
                {/* Header */}
                <div className={`px-6 py-4 border-b border-white/5 flex items-center gap-3`}>
                    <div className={`w-8 h-8 rounded-lg ${c.bg} border ${c.border} flex items-center justify-center`}>
                        <Icon className={`w-4 h-4 ${c.text}`} />
                    </div>
                    <div>
                        <h3 className="font-bold text-zinc-200 text-sm">{title}</h3>
                        <p className="text-zinc-600 text-xs">{description}</p>
                    </div>
                </div>
                {/* Content */}
                <div className="px-6 py-5 space-y-4">{children}</div>
                {/* Footer */}
                {footer && (
                    <div className="px-6 pb-5 flex justify-end">{footer}</div>
                )}
            </div>
        </div>
    )
}

// ── Main Component ────────────────────────────────────────
export default function ProfileForm({ user }: { user: any }) {
    const { workspaceId } = useParams()
    const workspaceIdStr = workspaceId as string
    const [isLoading, setIsLoading] = useState(false)

    // Password states (logic unchanged)
    const [currentPass, setCurrentPass] = useState('')
    const [newPass, setNewPass] = useState('')
    const [confirmPass, setConfirmPass] = useState('')
    const [passLoading, setPassLoading] = useState(false)

    // ── Handlers (logic unchanged) ────────────────────────
    async function handleUpdateInfo(formData: FormData) {
        setIsLoading(true)
        const data = {
            nickname: formData.get('nickname') as string,
            email: formData.get('email') as string,
            phoneNumber: formData.get('phoneNumber') as string
        }
        const res = await updateProfile(user.id, data, workspaceIdStr)
        setIsLoading(false)
        if (res.error) toast.error(res.error)
        else toast.success('Đã cập nhật thông tin thành công!')
    }

    async function handleChangePass(e: React.FormEvent) {
        e.preventDefault()
        if (newPass !== confirmPass) { toast.error('Mật khẩu mới không khớp'); return }
        if (newPass.length < 6) { toast.error('Mật khẩu phải có ít nhất 6 ký tự'); return }
        setPassLoading(true)
        const res = await changePassword(user.id, currentPass, newPass, workspaceIdStr)
        setPassLoading(false)
        if (res.error) toast.error(res.error)
        else {
            toast.success('Đổi mật khẩu thành công!')
            setCurrentPass(''); setNewPass(''); setConfirmPass('')
        }
    }

    // ── Render ────────────────────────────────────────────
    return (
        <div className="space-y-5">
            {/* ─── Profile Info Card ─────────────────────── */}
            <SettingsCard
                icon={User}
                title="Thông tin cá nhân"
                description="Quản lý thông tin hiển thị và liên hệ của bạn."
                accentColor="indigo"
                footer={
                    <button type="submit" form="profile-form" disabled={isLoading}
                        className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-500 hover:brightness-110 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-lg shadow-indigo-500/20 transition-all active:scale-[0.98]">
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Lưu thay đổi
                    </button>
                }
            >
                <form action={handleUpdateInfo} id="profile-form">
                    <div className="grid gap-4 md:grid-cols-2">
                        <GlassInput id="username" label="Username" icon={AtSign} value={user.username} disabled />
                        <GlassInput id="nickname" name="nickname" label="Nickname (Tên hiển thị)" icon={User} defaultValue={user.nickname || ''} placeholder="Nhập tên hiển thị..." />
                        <GlassInput id="email" name="email" label="Email" icon={Mail} type="email" defaultValue={user.email || ''} placeholder="email@example.com" />
                        <GlassInput id="phoneNumber" name="phoneNumber" label="Số điện thoại" icon={Phone} type="tel" defaultValue={user.phoneNumber || ''} placeholder="0912 345 678" />
                    </div>
                </form>
            </SettingsCard>

            {/* ─── Change Password Card ──────────────────── */}
            <SettingsCard
                icon={KeyRound}
                title="Đổi mật khẩu"
                description="Cập nhật mật khẩu thường xuyên để bảo vệ tài khoản."
                accentColor="amber"
                footer={
                    <button type="submit" form="password-form"
                        disabled={passLoading || !currentPass || !newPass}
                        className="flex items-center gap-2 px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 font-bold text-sm rounded-xl border border-white/10 transition-all active:scale-[0.98]">
                        {passLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                        Đổi mật khẩu
                    </button>
                }
            >
                <form onSubmit={handleChangePass} id="password-form" className="space-y-4">
                    <GlassInput id="currentPass" label="Mật khẩu hiện tại" icon={Lock} type="password" value={currentPass} onChange={(e: any) => setCurrentPass(e.target.value)} />
                    <div className="grid md:grid-cols-2 gap-4">
                        <GlassInput id="newPass" label="Mật khẩu mới" icon={Lock} type="password" value={newPass} onChange={(e: any) => setNewPass(e.target.value)} />
                        <GlassInput id="confirmPass" label="Xác nhận mật khẩu" icon={Lock} type="password" value={confirmPass} onChange={(e: any) => setConfirmPass(e.target.value)} />
                    </div>
                </form>
            </SettingsCard>
        </div>
    )
}
