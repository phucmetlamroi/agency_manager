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
import {
    scanDropboxFolder,
    scanGoogleDriveFolder,
    recursiveScanFolder,
} from '@/lib/cloud-scanner'
import { classifyScan } from '@/lib/scan-classifier'
import { refreshTokenIfNeeded } from '@/actions/integration-actions'
// [Velox v4] Multi-Hook Map deep-scan engine — runs side-by-side with v3,
// opt-in via `?v=4`. See FEATURE_REQUIREMENTS_VELOX_MULTIHOOK_MAP_v4.md.
import { runEngineV4 } from '@/lib/velox/v4-engine'
import { rawTreeToScanInput } from '@/lib/velox/v4-adapter'

// [Velox Deep Scan v3.1] Bumped 60→90s for recursive depth-4 scans on large
// folders (some clients have 30+ DJI files at root + nested broll subfolders).
// Sequential traversal + 500-file cap should keep us under the limit.
export const maxDuration = 90

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
    //
    // [Velox Deep Scan v3.1 — PR4 flip] API versioning:
    //   - default (no ?v param)  → V3 Deep Scan (recursiveScanFolder + classifyScan)
    //   - ?v=3 explicit          → same as default
    //   - ?v=4 explicit          → V4 Multi-Hook Map engine
    //                              (rawTreeToScanInput → runEngineV4)
    //   - ?v=1 explicit          → V1 flat scan (escape hatch)
    //
    // V3 response also includes a flat `videos[]` field (= mainItems flattened
    // back to ScannedVideo shape) so any V1 caller keeps working transparently.
    // V4 returns a different envelope (`VeloxScanResult`) — callers opt in by
    // setting `?v=4` and switching their parser.
    // ---------------------------------------------------------------------------
    const url0 = new URL(req.url)
    const apiVersion = url0.searchParams.get('v')
    const useV4 = apiVersion === '4'
    const useV3 = !useV4 && apiVersion !== '1'

    try {
        if (useV4) {
            // ─── V4 Multi-Hook Map path ─────────────────────────────────────
            const rootName =
                parsed.provider === 'dropbox'
                    ? (parsed.folderPath?.split('/').filter(Boolean).pop() ??
                        parsed.sharedFolderId ?? 'root')
                    : 'root'

            const tree =
                parsed.provider === 'dropbox'
                    ? await recursiveScanFolder({
                        provider: 'dropbox',
                        accessToken,
                        folderIdentifier: parsed.folderPath,
                        sharedLinkUrl: parsed.sharedLinkUrl,
                        sharedFolderId: parsed.sharedFolderId,
                        rootName,
                    })
                    : await recursiveScanFolder({
                        provider: 'google_drive',
                        accessToken,
                        folderIdentifier: parsed.folderId,
                        rootName,
                    })

            const scanInput = rawTreeToScanInput(
                tree,
                parsed.provider === 'dropbox' ? 'dropbox' : 'gdrive',
                rootName,
                // clientId can be threaded through later via body — leaving
                // undefined now so the base config is used.
            )
            const { result } = runEngineV4(scanInput)
            // Stamp the timestamp here (engine itself stays deterministic for
            // snapshot tests).
            result.scannedAt = new Date().toISOString()

            return NextResponse.json({
                ...result,
                provider: parsed.provider,
                apiVersion: 'v4',
            })
        }

        if (useV3) {
            // ─── V3 Deep Scan path ──────────────────────────────────────────
            const rootName =
                parsed.provider === 'dropbox'
                    ? (parsed.folderPath?.split('/').filter(Boolean).pop() ??
                        parsed.sharedFolderId ?? 'root')
                    : 'root'

            const tree =
                parsed.provider === 'dropbox'
                    ? await recursiveScanFolder({
                        provider: 'dropbox',
                        accessToken,
                        folderIdentifier: parsed.folderPath,
                        sharedLinkUrl: parsed.sharedLinkUrl,
                        sharedFolderId: parsed.sharedFolderId,
                        rootName,
                    })
                    : await recursiveScanFolder({
                        provider: 'google_drive',
                        accessToken,
                        folderIdentifier: parsed.folderId,
                        rootName,
                    })

            const result = classifyScan(tree)

            return NextResponse.json({
                ...result,
                provider: parsed.provider,
                count: result.videos.length,
                apiVersion: 'v3',
            })
        }

        // ─── V1 flat scan path (default, backward compat) ──────────────────
        if (parsed.provider === 'dropbox') {
            const videos = await scanDropboxFolder(
                accessToken,
                parsed.folderPath,
                parsed.sharedFolderId,
                parsed.sharedLinkUrl,
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
