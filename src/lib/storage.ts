/**
 * [Hosting-portable public image storage]
 *
 * Single upload entry point used by upload-actions.ts. Picks the storage backend
 * by environment so the SAME build runs on Vercel (current) and Railway / self-host
 * (cheaper) with zero code change — only env vars differ. This is a deliberate
 * zero-downtime migration seam: current Vercel deploys keep using Vercel Blob, and a
 * Railway deploy uses Supabase Storage (no new account — the app already holds
 * NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for realtime).
 *
 * Backend selection:
 *   - STORAGE_DRIVER === 'supabase'  → Supabase Storage (force)
 *   - STORAGE_DRIVER === 'vercel-blob' → Vercel Blob (force)
 *   - else: Vercel Blob if BLOB_READ_WRITE_TOKEN is set (Vercel), otherwise Supabase
 *     if its env is present. This makes Vercel the default ONLY while its token exists.
 *
 * Supabase bucket: SUPABASE_STORAGE_BUCKET (default 'public-uploads'). The bucket must
 * be PUBLIC (uploaded URLs are stored on User/Profile rows and served directly).
 */

const SUPABASE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'public-uploads'

function pickDriver(): 'supabase' | 'vercel-blob' {
    const forced = process.env.STORAGE_DRIVER
    if (forced === 'supabase' || forced === 'vercel-blob') return forced
    // Auto: prefer Vercel Blob while its token exists (current prod); else Supabase.
    if (process.env.BLOB_READ_WRITE_TOKEN) return 'vercel-blob'
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return 'supabase'
    // Last resort — keep the historical default so a misconfig fails loudly in put().
    return 'vercel-blob'
}

/**
 * Upload a public image and return its served URL. `filename` is the object key
 * (e.g. `avatar-<userId>-<ts>.webp`); callers pass an already-optimized buffer.
 */
export async function uploadPublicImage(
    filename: string,
    body: Buffer,
    contentType: string,
): Promise<{ url: string }> {
    const driver = pickDriver()

    if (driver === 'supabase') {
        const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!supaUrl || !supaKey) {
            throw new Error('Supabase storage not configured (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).')
        }
        const { createClient } = await import('@supabase/supabase-js')
        const supabase = createClient(supaUrl, supaKey, { auth: { persistSession: false } })
        const { error } = await supabase.storage.from(SUPABASE_BUCKET).upload(filename, body, {
            contentType,
            upsert: true,
            cacheControl: '31536000',
        })
        if (error) throw new Error(`Supabase storage upload failed: ${error.message}`)
        const { data } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(filename)
        return { url: data.publicUrl }
    }

    // Vercel Blob (current production default).
    const { put } = await import('@vercel/blob')
    const blob = await put(filename, body, { access: 'public', contentType })
    return { url: blob.url }
}
