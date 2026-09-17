// [kiểm toán 2026-07 · S2-3] 404 trong vỏ quản trị — sidebar giữ nguyên.
import { WorkspaceNotFound } from '@/components/errors/WorkspaceNotFound'

export default function AdminNotFound() {
    return <WorkspaceNotFound area="admin" />
}
