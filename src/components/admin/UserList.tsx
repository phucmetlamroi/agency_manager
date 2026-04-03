'use client'

import RoleSwitcher from '@/components/RoleSwitcher'
import ResetPasswordButton from '@/components/ResetPasswordButton'
import DeleteUserButton from '@/components/DeleteUserButton'
import TreasurerToggle from '@/components/TreasurerToggle'
import { createUser } from '@/actions/create-user'
import ProfileSwitcher from '@/components/admin/ProfileSwitcher'
import PendingCrossTeamRequests from '@/components/admin/PendingCrossTeamRequests'
import CrossTeamManager from '@/components/admin/CrossTeamManager'
import { UserPlus, Mail, AlertTriangle, Phone, Shield, Crown, Medal, PlusCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

type Props = {
    users: any[]
    currentUser: any
    profiles?: any[]
    incomingRequests?: any[]
    workspaceId: string
}

export default function UserList({ users, currentUser, profiles, incomingRequests, workspaceId }: Props) {
    return (
        <div className="space-y-6">
            {/* ADD USER FORM (GLASSMORPHISM PRO MAX) */}
            <div className="bg-zinc-950/50 backdrop-blur-xl border border-white/10 rounded-3xl p-6 lg:p-8 shadow-2xl relative overflow-hidden group">
                {/* Ambient Glow */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -z-10 group-hover:bg-indigo-500/20 transition-colors duration-700" />
                
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2.5">
                    <UserPlus className="w-5 h-5 text-indigo-400" strokeWidth={1.5} />
                    Thêm tài khoản mới
                </h3>
                
                <form action={async (formData) => {
                    await createUser(formData, workspaceId)
                }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                    
                    <div className="lg:col-span-1">
                        <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Username</label>
                        <input name="username" required placeholder="Nhập tên đăng nhập..."
                            className="w-full bg-zinc-900/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-inner" />
                    </div>
                    
                    <div className="lg:col-span-1">
                        <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Password</label>
                        <input name="password" required type="password" placeholder="Mật khẩu..."
                            className="w-full bg-zinc-900/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-inner" />
                    </div>
                    
                    <div className="lg:col-span-1">
                        <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Role</label>
                        <select name="role" 
                            className="w-full bg-zinc-900/60 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-inner appearance-none cursor-pointer">
                            <option value="USER">User</option>
                            <option value="ADMIN">Admin</option>
                            <option value="CLIENT">Client</option>
                        </select>
                    </div>

                    {currentUser?.username === 'admin' && profiles && profiles.length > 0 && (
                        <div className="lg:col-span-1">
                            <label className="block text-[11px] font-bold text-indigo-400 uppercase tracking-wider mb-2 flex items-center gap-1.5 shadow-[0_0_10px_rgba(99,102,241,0.2)]">
                                <Shield className="w-3.5 h-3.5" strokeWidth={2} /> Team Profile
                            </label>
                            <select name="profileId" required 
                                className="w-full bg-indigo-950/30 border border-indigo-500/30 rounded-xl px-4 py-3 text-sm text-indigo-200 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/40 transition-all shadow-inner appearance-none cursor-pointer">
                                <option value="" className="bg-zinc-900">-- Cấp phái Team --</option>
                                {profiles.map(p => (
                                    <option key={p.id} value={p.id} className="bg-zinc-900">{p.name}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    
                    <div className="lg:col-span-1">
                        <button type="submit" 
                            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl px-4 py-3 text-sm flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-indigo-500/25 active:scale-[0.98] border border-indigo-500/50">
                            <PlusCircle className="w-4 h-4" strokeWidth={2} />
                            Thêm User
                        </button>
                    </div>
                </form>
            </div>

            {/* HIỂN THỊ YÊU CẦU CROSS TEAM */}
            {incomingRequests && incomingRequests.length > 0 && (
                <PendingCrossTeamRequests requests={incomingRequests} workspaceId={workspaceId} />
            )}

            {/* BENTO GRID USER LIST */}
            <div className="space-y-4">
                {users.map((u, i) => {
                    const isSuperAdminRow = u.username === 'admin'
                    const displayName = u.nickname || u.username

                    return (
                        <div key={u.id} 
                            className="bg-zinc-900/40 border border-white/5 hover:border-white/10 rounded-2xl p-5 flex flex-col xl:flex-row gap-6 transition-all shadow-sm hover:shadow-md hover:bg-zinc-900/50 relative overflow-hidden group">
                            
                            {/* Glow Effect cho Super Admin hoặc Users đặc biệt */}
                            {isSuperAdminRow && <div className="absolute top-0 left-0 w-1 h-full bg-violet-500 shadow-[0_0_15px_rgba(139,92,246,0.5)]" />}
                            {u.isTreasurer && !isSuperAdminRow && <div className="absolute top-0 left-0 w-1 h-full bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)]" />}

                            {/* Avatar Column */}
                            <div className="shrink-0 flex items-center justify-center">
                                <Avatar className="h-12 w-12 md:h-16 md:w-16 border-2 border-white/5 ring-1 ring-white/10 shadow-2xl relative">
                                    <AvatarImage src={u.avatarUrl || `https://avatar.vercel.sh/${u.username}`} className="object-cover" />
                                    <AvatarFallback className="bg-zinc-800 text-zinc-200 text-lg font-bold">{u.username[0].toUpperCase()}</AvatarFallback>
                                </Avatar>
                            </div>

                            {/* Column 1: Core Info (Name, Nickname, ID) - Width Fixed/Grow */}
                            <div className="flex-1 xl:max-w-[300px] flex flex-col justify-center">
                                <div className="flex items-center gap-2.5 flex-wrap mb-1">
                                    <h4 className="text-zinc-100 font-bold text-lg">{displayName}</h4>
                                    
                                    {isSuperAdminRow && (
                                        <span className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-[10px] font-black uppercase px-2 py-0.5 rounded flex items-center gap-1 shadow-lg shadow-violet-900/30">
                                            <Crown className="w-3 h-3" strokeWidth={2} /> SUPER ADMIN
                                        </span>
                                    )}
                                    
                                    {u.isTreasurer && !isSuperAdminRow && (
                                        <span className="bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[10px] font-black uppercase px-2 py-0.5 rounded flex items-center gap-1">
                                            <Medal className="w-3 h-3" strokeWidth={2} /> THỦ QUỸ
                                        </span>
                                    )}
                                </div>
                                
                                {u.nickname && (
                                    <div className="text-sm text-zinc-500 font-medium mb-2">@{u.username}</div>
                                )}
                                
                                <div className="text-[10px] font-mono text-zinc-600/80 uppercase tracking-widest mt-auto">
                                    ID: {u.id.substring(0, 8)}
                                </div>
                            </div>

                            {/* Column 2: Contact Info */}
                            <div className="flex-1 xl:max-w-[280px] flex flex-col justify-center gap-3 border-t xl:border-t-0 xl:border-l border-white/5 pt-4 xl:pt-0 xl:pl-6">
                                {/* Email */}
                                {u.email ? (
                                    <div className="flex items-center gap-2.5 text-sm text-zinc-300">
                                        <div className="w-7 h-7 rounded-lg bg-zinc-800/80 border border-white/5 flex items-center justify-center shrink-0">
                                            <Mail className="w-3.5 h-3.5 text-zinc-400" strokeWidth={1.5} />
                                        </div>
                                        <span className="truncate">{u.email}</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2.5 text-[13px] text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-lg w-max">
                                        <AlertTriangle className="w-3.5 h-3.5" strokeWidth={2} />
                                        <span className="font-semibold tracking-wide">Chưa có Email</span>
                                    </div>
                                )}

                                {/* Phone */}
                                {u.phoneNumber ? (
                                    <div className="flex items-center gap-2.5 text-sm text-zinc-400">
                                        <div className="w-7 h-7 rounded-lg bg-zinc-800/80 border border-white/5 flex items-center justify-center shrink-0">
                                            <Phone className="w-3.5 h-3.5 text-zinc-500" strokeWidth={1.5} />
                                        </div>
                                        <span>{u.phoneNumber}</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2.5 text-xs text-zinc-600 italic px-1">
                                        Chưa có số điện thoại.
                                    </div>
                                )}
                            </div>

                            {/* Column 3: Roles & Access Management */}
                            <div className="flex-[2] flex flex-col justify-center border-t xl:border-t-0 xl:border-l border-white/5 pt-4 xl:pt-0 xl:pl-6">
                                {!isSuperAdminRow ? (
                                    <div className="flex flex-col gap-3">
                                        <div className="flex items-center gap-3 flex-wrap">
                                            <RoleSwitcher userId={u.id} initialRole={u.role} workspaceId={workspaceId} />
                                            {currentUser?.username === 'admin' && u.role === 'ADMIN' && (
                                                <TreasurerToggle userId={u.id} isTreasurer={u.isTreasurer} workspaceId={workspaceId} />
                                            )}
                                        </div>
                                        
                                        {currentUser?.username === 'admin' && profiles && profiles.length > 0 && (
                                            <div className="max-w-[300px]">
                                                <ProfileSwitcher userId={u.id} currentProfileId={u.profileId} profiles={profiles} workspaceId={workspaceId} />
                                            </div>
                                        )}

                                        <div className="w-full">
                                            <CrossTeamManager 
                                                userId={u.id} 
                                                currentProfileId={u.profileId} 
                                                profiles={profiles || []} 
                                                accesses={u.profileAccesses || []} 
                                                requests={u.accessRequests || []} 
                                                workspaceId={workspaceId} 
                                                isSuperAdmin={currentUser?.username === 'admin'}
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex h-full items-center">
                                        <div className="flex items-center gap-2 text-zinc-600 text-sm bg-zinc-900/50 px-4 py-2 rounded-xl border border-white/5">
                                            <Shield className="w-4 h-4" strokeWidth={1.5} /> Secured SuperAdmin Account
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Column 4: Actions (Reset Pass, Delete) */}
                            <div className="flex flex-row xl:flex-col items-center justify-center gap-2 border-t xl:border-t-0 xl:border-l border-white/5 pt-4 xl:pt-0 xl:pl-6 xl:ml-auto shrink-0 w-full xl:w-auto">
                                {(!isSuperAdminRow || currentUser?.username === 'admin') && (
                                    <ResetPasswordButton userId={u.id} username={u.username} workspaceId={workspaceId} />
                                )}
                                {!isSuperAdminRow && (
                                    <DeleteUserButton userId={u.id} workspaceId={workspaceId} />
                                )}
                            </div>
                        </div>
                    )
                })}
                
                {users.length === 0 && (
                    <div className="text-center py-12 text-zinc-500 border border-dashed border-white/10 rounded-3xl bg-zinc-900/20 relative overflow-hidden group">
                        <UserPlus className="w-8 h-8 mx-auto mb-3 opacity-20 group-hover:opacity-40 transition-opacity" strokeWidth={1.5} />
                        Chưa có nhân viên nào. Khởi tạo tài khoản đầu tiên ngay.
                    </div>
                )}
            </div>
        </div>
    )
}
