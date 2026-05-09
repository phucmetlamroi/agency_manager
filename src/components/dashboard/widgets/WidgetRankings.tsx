/**
 * WidgetRankings — top-3 podium ranking widget for User dashboard.
 *
 * Reuses existing `Leaderboard` server component (which already renders the
 * exact podium UI matching Figma HOME-USER-VER-1.0). Thin wrapper for
 * semantic clarity in the new user dashboard layout.
 *
 * The Figma frame is 313x328 — Leaderboard already uses h-full so the parent
 * grid cell controls its size.
 */
import Leaderboard from "../Leaderboard"

export default function WidgetRankings({ workspaceId }: { workspaceId: string }) {
    return <Leaderboard workspaceId={workspaceId} />
}
