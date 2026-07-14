// [Review module] Error envelope + zod validation per API-SPEC §0.3.
// Every route handler in /api/review/* and /api/r/* returns THIS shape on
// failure — never a bare string, never a Next default error page.

import { NextResponse } from 'next/server'
import type { ZodSchema } from 'zod'

/** Machine-readable codes (API-SPEC §0.3 table). Extend per endpoint as specced. */
export type ApiErrorCode =
    | 'VALIDATION_ERROR'
    | 'FOLDER_CYCLE'
    | 'CROSS_WORKSPACE'
    | 'UNAUTHORIZED'
    | 'SHARE_PASSWORD_REQUIRED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'SHARE_NOT_FOUND'
    | 'ROW_VERSION_MISMATCH'
    | 'STATE_INVALID'
    | 'ALREADY_IN_TRASH'
    | 'NOT_IN_TRASH'
    | 'SHARE_REVOKED'
    | 'SHARE_EXPIRED'
    | 'UPLOAD_EXPIRED'
    | 'FILE_TOO_LARGE'
    | 'UNSUPPORTED_MEDIA_TYPE'
    | 'RATE_LIMITED'
    // [AUDIT H1/H2] Client sign-off gates on the guest decision route.
    | 'DECISIONS_DISABLED'
    | 'VERIFICATION_REQUIRED'
    | 'INTERNAL'
    | 'UPSTREAM_ERROR'

export interface ApiErrorBody {
    error: {
        code: ApiErrorCode
        message: string
        details?: Record<string, unknown>
    }
}

/** Build the standard error response. Sets Retry-After for RATE_LIMITED. */
export function apiError(
    status: number,
    code: ApiErrorCode,
    message: string,
    details?: Record<string, unknown>,
): NextResponse<ApiErrorBody> {
    const res = NextResponse.json<ApiErrorBody>(
        { error: { code, message, ...(details ? { details } : {}) } },
        { status },
    )
    if (code === 'RATE_LIMITED' && typeof details?.retryAfterSec === 'number') {
        res.headers.set('Retry-After', String(details.retryAfterSec))
    }
    return res
}

/** Success JSON with BigInt-safe serialization (sizeBytes → string, §0.1). */
export function apiJson<T>(data: T, init?: { status?: number }): NextResponse {
    const body = JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
    return new NextResponse(body, {
        status: init?.status ?? 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
    })
}

/** Parse+validate a JSON body against a zod schema. Returns data or the 400 response. */
export async function parseBody<T>(
    req: Request,
    schema: ZodSchema<T>,
    lang: 'vi' | 'en' = 'vi', // guest routes (/api/r/*) pass 'en'
): Promise<{ ok: true; data: T } | { ok: false; res: NextResponse }> {
    let raw: unknown
    try {
        raw = await req.json()
    } catch {
        return {
            ok: false,
            res: apiError(400, 'VALIDATION_ERROR', lang === 'en' ? 'Body must be valid JSON.' : 'Body phải là JSON hợp lệ.'),
        }
    }
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
        return {
            ok: false,
            res: apiError(400, 'VALIDATION_ERROR', lang === 'en' ? 'Invalid input.' : 'Dữ liệu không hợp lệ.', {
                issues: parsed.error.flatten(),
            }),
        }
    }
    return { ok: true, data: parsed.data }
}
