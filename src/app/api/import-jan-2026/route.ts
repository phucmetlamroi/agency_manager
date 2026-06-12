import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * [Canonical Clients 2026-06] FROZEN — this one-off Jan-2026 Excel importer
 * pre-dates profile-scoped clients: it created Client rows keyed by
 * workspaceId, which would mint exactly the per-workspace duplicates the
 * canonical migration (scripts/migrate-clients-to-profile-scope.ts) just
 * merged. The import already ran in production; the original implementation
 * lives in git history (pre-2026-06-13) if it's ever needed as a reference.
 */
export async function GET() {
    return NextResponse.json(
        { error: 'Importer frozen — clients are profile-scoped now. See scripts/migrate-clients-to-profile-scope.ts.' },
        { status: 410 },
    )
}
