
import { cookies } from 'next/headers'
import { decrypt } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import ProfileForm from '@/components/ProfileForm'
import PaymentQrUpload from '@/components/profile/PaymentQrUpload'

export default async function ProfilePage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get('session')

    if (!sessionCookie) redirect('/login')

    const session = await decrypt(sessionCookie.value)
    if (!session?.user?.id) redirect('/login')

    const user = await prisma.user.findUnique({
        where: { id: session.user.id }
    })

    if (!user) redirect('/login')

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-8">
            <h1 className="text-2xl font-bold mb-6 text-white flex items-center gap-2">
                <span>👤</span> Personal Information
            </h1>

            <div className="glass-panel p-6 mb-8">
                <h2 className="text-xl font-semibold mb-4 text-purple-300">General Settings</h2>
                <ProfileForm user={user} />
            </div>

            <div className="glass-panel p-6">
                <PaymentQrUpload user={user} />
            </div>
        </div>
    )
}
