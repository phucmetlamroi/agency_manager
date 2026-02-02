
import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import FocusNotebook from '@/components/FocusNotebook'

export default async function FocusPage() {
    const session = await getSession()
    if (!session) redirect('/login')

    return (
        <div style={{ height: 'calc(100vh - 100px)', padding: '1rem' }}>
            <FocusNotebook userId={session.user.id} />
        </div>
    )
}
