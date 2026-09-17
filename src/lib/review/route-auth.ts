// [Review module P1] Route error boundary — one place that turns thrown errors
// into the standard envelope so no /api/review/* route ever leaks a raw 500.
// Handlers still call requireReviewAccess({workspaceId}) themselves (defense in
// depth, once they know the workspace); this wrapper just maps the throw.

import { NextRequest, NextResponse } from 'next/server'
import { ReviewAccessError } from './access'
import { apiError } from './errors'
import { MuxError } from './mux'
import { reviewLog, getRequestId } from './logger'

type Handler<C> = (req: NextRequest, ctx: C) => Promise<NextResponse> | NextResponse

/**
 * Wrap a route handler:
 *   - ReviewAccessError  → 401 UNAUTHORIZED | 403 FORBIDDEN
 *   - MuxError           → 502 UPSTREAM_ERROR (details.provider="mux")
 *   - anything else      → 500 INTERNAL (logged with request id; message not leaked)
 * NextResponse thrown by helpers (parseBody) is returned as-is.
 */
export function withReviewRoute<C = unknown>(handler: Handler<C>): Handler<C> {
    return async (req, ctx) => {
        try {
            return await handler(req, ctx)
        } catch (e) {
            if (e instanceof NextResponse) return e
            if (e instanceof ReviewAccessError) {
                return apiError(e.status, e.status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN', e.message)
            }
            if (e instanceof MuxError) {
                reviewLog('error', 'route.mux_upstream', { path: safePath(req), status: e.status, msg: e.message })
                return apiError(502, 'UPSTREAM_ERROR', 'Lỗi dịch vụ xử lý video.', { provider: 'mux' })
            }
            // [2026-08-05] Kèm một MÃ THAM CHIẾU ngắn vào phản hồi. Trước đây màn hình
            // chỉ hiện "Lỗi hệ thống." — không có gì để đối chiếu với log, nên mỗi lần
            // người dùng báo lỗi là phải đoán. Mã này KHÔNG tiết lộ nội dung lỗi (vẫn
            // giấu chi tiết nội bộ), chỉ đủ để tra đúng dòng log.
            const ref = Math.random().toString(36).slice(2, 8).toUpperCase()
            reviewLog('error', 'route.unhandled', {
                ref,
                path: safePath(req),
                reqId: getRequestId(req),
                error: e instanceof Error ? e.message : String(e),
                stack: e instanceof Error ? e.stack?.split('\n').slice(0, 4).join(' | ') : undefined,
            })
            return apiError(500, 'INTERNAL', `Lỗi hệ thống (mã ${ref}).`, { ref })
        }
    }
}

/**
 * P5: same boundary for GUEST routes (/api/r/*) — English messages, and an
 * internal-auth throw here is a bug (guests never hold a session), so it maps
 * to a generic 500 instead of leaking the internal auth envelope.
 */
export function withShareRoute<C = unknown>(handler: Handler<C>): Handler<C> {
    return async (req, ctx) => {
        try {
            return await handler(req, ctx)
        } catch (e) {
            if (e instanceof NextResponse) return e
            if (e instanceof MuxError) {
                reviewLog('error', 'route.mux_upstream', { path: safePath(req), status: e.status, msg: e.message })
                return apiError(502, 'UPSTREAM_ERROR', 'Video service error. Please try again.', { provider: 'mux' })
            }
            reviewLog('error', 'route.unhandled', {
                path: safePath(req),
                reqId: getRequestId(req),
                error: e instanceof Error ? e.message : String(e),
            })
            return apiError(500, 'INTERNAL', 'Something went wrong. Please try again.')
        }
    }
}

function safePath(req: NextRequest): string {
    try {
        return new URL(req.url).pathname
    } catch {
        return '?'
    }
}
