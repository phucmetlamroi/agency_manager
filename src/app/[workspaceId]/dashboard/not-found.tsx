// [kiểm toán 2026-07 · S2-3] 404 trong vỏ nhân viên — sidebar giữ nguyên.
import { WorkspaceNotFound } from '@/components/errors/WorkspaceNotFound'

export default function DashboardNotFound() {
    return <WorkspaceNotFound area="dashboard" />
}
