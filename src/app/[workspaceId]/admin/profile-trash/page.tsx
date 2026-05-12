import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getMyTrashedProfiles } from '@/actions/profile-actions'
import ProfileTrashClient from '@/components/profile/ProfileTrashClient'

/**
 * [Sprint Z+1] Profile Trash — list soft-deleted profiles user owns.
 * Restore button per profile. Countdown to hard-delete.
 */
export default async function ProfileTrashPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    const session = await getSession()
    if (!session) redirect('/login')

    const { profiles } = await getMyTrashedProfiles()

    return (
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ marginBottom: '2rem' }}>
                <h2 className="title-gradient" style={{ marginBottom: 4 }}>Profile Trash</h2>
                <p style={{ color: '#71717A', fontSize: 13 }}>
                    Profiles đã xóa — có thể restore trong 30 ngày trước khi tự động xóa vĩnh viễn.
                </p>
            </div>
            <ProfileTrashClient workspaceId={workspaceId} profiles={profiles} />
        </div>
    )
}
