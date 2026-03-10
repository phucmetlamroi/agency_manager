import { getAvailableProfiles, selectProfile } from '@/actions/profile-actions'
import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import { Lock, LogOut } from 'lucide-react'
import Link from 'next/link'
import ProfileActionClient from './ProfileActionClient' // We will create this

export default async function ProfileSelectionPage() {
    const session = await getSession()
    if (!session?.user) {
        redirect('/login')
    }

    // Attempt Fast-track for CLIENT
    if (session.user.role === 'CLIENT') {
        const availableProfiles = await getAvailableProfiles()
        if (availableProfiles.length === 1) {
            await selectProfile(availableProfiles[0].id)
            redirect('/portal')
        }
    }

    const availableProfiles = await getAvailableProfiles()
    
    // For UI demonstration we'll also show locked profiles if user is not ADMIN.
    // Actually, availableProfiles only returns what they *can* access. 
    // To show locked ones, we could fetch all profiles and mark them locked.
    // Let's modify logic here slightly to fetch all if we want the "locked" visual effect.
    
    // Since getAvailableProfiles only returns authorized ones, let's just show those for now, 
    // or fetch from an internal API if we want to show everything. 
    // Let's fetch all profiles directly here to show the locked/unlocked visual effect as requested:
    // "Áp dụng hiệu ứng grayscale, backdrop-filter đối với các Card Profile mà người dùng không có quyền."
    
    let allProfiles = []
    try {
        const { prisma } = await import('@/lib/db')
        allProfiles = await prisma.profile.findMany()
    } catch(e) {
        // Fallback if db fails
        allProfiles = availableProfiles 
    }

    const allowedProfileIds = availableProfiles.map((p: any) => p.id)

    return (
        <div className="min-h-screen bg-neutral-950 text-white p-8 flex flex-col items-center justify-center">
            
            <div className="absolute top-8 right-8">
                <Link href="/api/auth/logout" className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors">
                    <LogOut className="w-5 h-5" />
                    Đăng xuất
                </Link>
            </div>

            <div className="max-w-5xl w-full text-center mb-12">
                <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent mb-4">
                    Chọn Không Gian Làm Việc
                </h1>
                <p className="text-neutral-400 text-lg">
                    Hệ thống nhận diện bạn thuộc về các Team dưới đây. Vui lòng chọn một để tiếp tục.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl w-full">
                {allProfiles.map((profile) => {
                    const isAllowed = allowedProfileIds.includes(profile.id)
                    // If no banner, use a nice gradient fallback
                    const bannerSrc = profile.bannerUrl || 'https://images.unsplash.com/photo-1557683316-973673baf926?q=80&w=1000&auto=format&fit=crop'
                    const logoSrc = profile.logoUrl || null

                    return (
                        <ProfileActionClient 
                            key={profile.id} 
                            profileId={profile.id} 
                            isAllowed={isAllowed} 
                            role={session.user.role}
                        >
                            <div className={`relative rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-900 transition-all duration-300 w-full h-[300px] flex flex-col
                                ${isAllowed ? 'hover:scale-105 hover:shadow-2xl hover:shadow-blue-500/20 cursor-pointer' : 'grayscale opacity-60 cursor-not-allowed'}
                            `}>
                                {/* Banner Image */}
                                <div className="h-40 w-full relative">
                                    <Image 
                                        src={bannerSrc} 
                                        alt={profile.name} 
                                        fill 
                                        className="object-cover"
                                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                                        unoptimized
                                    />
                                    {/* Gradient overlay */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 to-transparent" />
                                </div>

                                {/* Content */}
                                <div className="p-6 relative flex-grow flex flex-col justify-between">
                                    <div className="flex items-center gap-4 -mt-12 mb-4 relative z-10">
                                        {logoSrc ? (
                                            <div className="w-16 h-16 rounded-xl overflow-hidden bg-neutral-800 border-4 border-neutral-900 flex-shrink-0 relative">
                                                <Image src={logoSrc} alt="Logo" fill className="object-cover" unoptimized />
                                            </div>
                                        ) : (
                                            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 border-4 border-neutral-900 flex items-center justify-center flex-shrink-0 shadow-lg">
                                                <span className="text-2xl font-bold text-white">{profile.name.charAt(0).toUpperCase()}</span>
                                            </div>
                                        )}
                                        <h2 className="text-2xl font-bold text-white truncate mt-6">{profile.name}</h2>
                                    </div>
                                    
                                    <div className="text-sm text-neutral-400">
                                        ID: <span className="font-mono text-xs opacity-75">{profile.id.split('-')[0]}</span>
                                    </div>
                                </div>

                                {/* Locked Overlay */}
                                {!isAllowed && (
                                    <div className="absolute inset-0 bg-neutral-950/40 backdrop-blur-sm flex items-center justify-center z-20">
                                        <div className="bg-neutral-900/80 p-4 rounded-full border border-neutral-700">
                                            <Lock className="w-8 h-8 text-neutral-400" />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </ProfileActionClient>
                    )
                })}
            </div>
        </div>
    )
}
