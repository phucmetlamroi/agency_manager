/**
 * Simple In-Memory Rate Limiter using a Sliding Log / Token Bucket hybrid approach.
 * Note: Trong môi trường Serverless (Vercel), In-Memory sẽ bị reset mỗi lần cold-start 
 * hoặc phân tán trên các instance. Tuy nhiên, nó vẫn CỰC KỲ hiệu quả để cản phá các 
 * đợt tấn công Brute-force dồn dập (Burst attacks) đánh thẳng vào 1 instance đang nóng.
 */

interface RateLimitStore {
    count: number
    resetTime: number
}

// Global store to persist across hot reloads in Next.js dev
const store = new Map<string, RateLimitStore>()

/**
 * [test-only] Clear the in-memory limiter. NO app-code caller — used solely by
 * the QA harnesses (scripts/test-*.ts) so that re-resolving a share token many
 * times in one fast run doesn't trip the per-IP resolve limit and produce false
 * failures, and so the sub-client cap can be tested independently of its own
 * per-link rate limit. Production behaviour is unchanged.
 */
export function __clearRateLimitStore(): void {
    store.clear()
}

export async function rateLimit(
    identifier: string,
    limit: number = 10,
    windowMs: number = 60 * 1000 // 1 minute default
): Promise<{ success: boolean; headers: Record<string, string> }> {
    const now = Date.now()
    
    // Cleanup expired entries sparsely (optional, prevents memory leak)
    if (Math.random() < 0.1) {
        for (const [key, val] of store.entries()) {
            if (val.resetTime < now) {
                store.delete(key)
            }
        }
    }

    let record = store.get(identifier)

    // First time or expired
    if (!record || record.resetTime < now) {
        record = {
            count: 1,
            resetTime: now + windowMs
        }
        store.set(identifier, record)
        return { 
            success: true, 
            headers: {
                'X-RateLimit-Limit': limit.toString(),
                'X-RateLimit-Remaining': (limit - 1).toString(),
            } 
        }
    }

    // Increment
    record.count += 1
    store.set(identifier, record)

    const isSuccess = record.count <= limit

    return {
        success: isSuccess,
        headers: {
            'X-RateLimit-Limit': limit.toString(),
            'X-RateLimit-Remaining': Math.max(0, limit - record.count).toString(),
            'Retry-After': Math.ceil((record.resetTime - now) / 1000).toString(),
        }
    }
}
