/**
 * [Quick Create] Scan Cloud Folder API Route
 *
 * POST /api/integrations/scan-folder
 *
 * Body: { url: string, workspaceId: string }
 *
 * Flow:
 *   1. Verify session + workspace access (MEMBER role)
 *   2. Parse the cloud storage URL into provider + folder identifier
 *   3. Look up the caller's IntegrationToken for that provider
 *   4. Refresh token if expired
 *   5. Scan folder via Dropbox or Google Drive API
 *   6. Return ScannedVideo[] array
 *
 * Returns:
 *   - 200: { videos: ScannedVideo[], provider, count }
 *   - 400: invalid URL / missing params
 *   - 401: unauthenticated / no integration connected
 *   - 403: no workspace access
 *   - 404: folder not found / not accessible
 *   - 429: provider rate limit
 *   - 500: scan failed
 */

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { verifyWorkspaceAccess } from '@/lib/security'
import { parseCloudLink } from '@/lib/cloud-link-parser'
import { scanDropboxFolder, scanGoogleDriveFolder } from '@/lib/cloud-scanner'
import { refreshTokenIfNeeded } from '@/actions/integration-actions'

// Allow up to 60s for large folder scans (default would be 10s on Vercel hobby)
export const maxDuration = 60

export async function POST(req: Request) {
    // ---------------------------------------------------------------------------
    // 1. Validate session
    // ---------------------------------------------------------------------------
    const session = await getSession()
    if (!session?.user?.id) {
        return NextResponse.json(
            { error: 'Unauthorized. Vui lòng đăng nhập lại.' },
            { status: 401 },
        )
    }

    // ---------------------------------------------------------------------------
    // 2. Parse and validate request body
    // ---------------------------------------------------------------------------
    let body: { url?: string; workspaceId?: string }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json(
            { error: 'Invalid JSON body.' },
            { status: 400 },
        )
    }

    const { url, workspaceId } = body
    if (!url || typeof url !== 'string' || !url.trim()) {
        return NextResponse.json(
            { error: 'Thiếu URL folder cloud storage.' },
            { status: 400 },
        )
    }
    if (!workspaceId || typeof workspaceId !== 'string') {
        return NextResponse.json(
            { error: 'Thiếu workspaceId.' },
            { status: 400 },
        )
    }

    // ---------------------------------------------------------------------------
    // 3. Verify workspace access (MEMBER role is enough — scanning is read-only)
    // ---------------------------------------------------------------------------
    try {
        await verifyWorkspaceAccess(workspaceId, 'MEMBER')
    } catch (err: any) {
        if (err?.message?.startsWith('SECURITY_VIOLATION')) {
            return NextResponse.json(
                { error: 'Bạn không có quyền truy cập workspace này.' },
                { status: 403 },
            )
        }
        throw err
    }

    // ---------------------------------------------------------------------------
    // 4. Parse the cloud link
    // ---------------------------------------------------------------------------
    const parsed = parseCloudLink(url)
    if (!parsed) {
        return NextResponse.json(
            {
                error:
                    'URL không hợp lệ. Vui lòng dán link folder Dropbox hoặc Google Drive.',
            },
            { status: 400 },
        )
    }

    // ---------------------------------------------------------------------------
    // 5. Look up the caller's IntegrationToken for that provider
    // ---------------------------------------------------------------------------
    const tokenRow = await prisma.integrationToken.findUnique({
        where: {
            userId_workspaceId_provider: {
                userId: session.user.id,
                workspaceId,
                provider: parsed.provider,
            },
        },
    })

    if (!tokenRow) {
        const providerLabel =
            parsed.provider === 'dropbox' ? 'Dropbox' : 'Google Drive'
        return NextResponse.json(
            {
                error: `Bạn chưa kết nối ${providerLabel}. Vui lòng vào Settings → Connectors để kết nối.`,
                requiresConnection: true,
                provider: parsed.provider,
            },
            { status: 401 },
        )
    }

    // ---------------------------------------------------------------------------
    // 6. Refresh token if needed (transparent — auto-updates DB)
    // ---------------------------------------------------------------------------
    let accessToken: string
    try {
        accessToken = await refreshTokenIfNeeded(tokenRow)
    } catch (err: any) {
        console.error('[scan-folder] Token refresh failed:', err)
        return NextResponse.json(
            {
                error:
                    'Token kết nối đã hết hạn và không thể tự gia hạn. Vui lòng kết nối lại provider trong Settings.',
                requiresConnection: true,
                provider: parsed.provider,
            },
            { status: 401 },
        )
    }

    // ---------------------------------------------------------------------------
    // 7. Scan folder via provider API
    // ---------------------------------------------------------------------------
    try {
        if (parsed.provider === 'dropbox') {
            const videos = await scanDropboxFolder(
                accessToken,
                parsed.folderPath,
                parsed.sharedFolderId,
            )
            return NextResponse.json({
                videos,
                provider: 'dropbox',
                count: videos.length,
            })
        } else {
            // google_drive
            const videos = await scanGoogleDriveFolder(accessToken, parsed.folderId)
            return NextResponse.json({
                videos,
                provider: 'google_drive',
                count: videos.length,
            })
        }
    } catch (err: any) {
        const errMsg = err?.message ?? 'unknown'
        console.error(`[scan-folder] ${parsed.provider} scan failed:`, errMsg)

        // Try to detect specific error types from the message
        if (errMsg.includes('429') || errMsg.toLowerCase().includes('rate')) {
            return NextResponse.json(
                {
                    error:
                        'Provider giới hạn tốc độ. Vui lòng đợi vài phút và thử lại.',
                },
                { status: 429 },
            )
        }
        if (
            errMsg.includes('404') ||
            errMsg.toLowerCase().includes('not_found') ||
            errMsg.toLowerCase().includes('path/not_found')
        ) {
            return NextResponse.json(
                {
                    error:
                        'Không tìm thấy folder. Kiểm tra lại URL hoặc đảm bảo bạn có quyền truy cập folder này.',
                },
                { status: 404 },
            )
        }
        if (errMsg.includes('401') || errMsg.includes('403')) {
            return NextResponse.json(
                {
                    error:
                        'Token không có quyền truy cập folder này. Vui lòng kiểm tra quyền chia sẻ.',
                },
                { status: 403 },
            )
        }

        return NextResponse.json(
            { error: `Lỗi khi scan folder: ${errMsg.slice(0, 200)}` },
            { status: 500 },
        )
    }
}
