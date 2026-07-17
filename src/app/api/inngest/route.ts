// [Review module] Inngest serve endpoint — hosts every review/* function.
// Inngest verifies its own requests with INNGEST_SIGNING_KEY; middleware
// already excludes /api entirely, so no session interferes.

import { serve } from 'inngest/next'
import { inngest, reviewFunctions } from '@/lib/review/inngest'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// [color-fix] The `ensure-color-tags` step (reviewProcessUpload) STREAMS an untagged video through
// ffmpeg (R2 URL → retag → R2, no /tmp) within a SINGLE step invocation, so this endpoint needs the
// max headroom. 800s is the Pro/Enterprise ceiling with Fluid Compute (default-on). The step also
// self-caps by size + a soft deadline and always falls back to the original, so a lower platform
// limit just degrades safely.
export const maxDuration = 800

export const { GET, POST, PUT } = serve({
    client: inngest,
    functions: reviewFunctions,
})
