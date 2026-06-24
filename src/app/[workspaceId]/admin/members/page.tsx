import { redirect } from 'next/navigation'

/**
 * [Merge: one membership menu] The per-workspace "Members" page was merged into the
 * org-level membership page ("Thành viên" = ProfileAccess). Org-wide model: a member of
 * the organization is a member of every workspace, so there is a single roster + invite path.
 *
 * This route now just redirects — keeps old bookmarks, the mobile nav link, and every
 * revalidatePath('/[workspaceId]/admin/members') target working without a 404.
 */
export default async function AdminMembersPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    redirect(`/${workspaceId}/admin/profile-members`)
}
