// [Review module] Structured one-line JSON logging (KIEN-TRUC §11.1).
// Vercel Runtime Logs friendly: 1 event = 1 line = 1 JSON object.
//
// Required log points (wired per phase): upload initiate/complete/abort
// (sizeBytes, partCount, durationMs), Mux webhook received/claimed/duplicate,
// guest decision, share auth fail, rate-limit hit, purge summary.

type ReviewLogLevel = 'info' | 'warn' | 'error'

export function reviewLog(
    level: ReviewLogLevel,
    event: string,
    ctx: Record<string, unknown> = {},
): void {
    const line = JSON.stringify({
        ts: new Date().toISOString(),
        level,
        mod: 'review',
        event,
        ...ctx,
    })
    if (level === 'error') console.error(line)
    else if (level === 'warn') console.warn(line)
    else console.log(line)
}

/** Request id for correlating a request's log lines (header or fresh). */
export function getRequestId(req: Request): string {
    return req.headers.get('x-request-id') || crypto.randomUUID()
}
