// [Review module] Inngest serve endpoint — hosts every review/* function.
// Inngest verifies its own requests with INNGEST_SIGNING_KEY; middleware
// already excludes /api entirely, so no session interferes.

import { serve } from 'inngest/next'
import { inngest, reviewFunctions } from '@/lib/review/inngest'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// [color-fix] The `ensure-color-tags` step (reviewProcessUpload) downloads → ffmpeg re-tags → re-uploads
// an untagged video within a SINGLE step invocation, so this endpoint needs headroom above the default.
// 300s covers a few-hundred-MB file (requires a Vercel plan that allows it; the step self-caps by size +
// a soft deadline and always falls back to the original, so a shorter platform limit degrades safely).
export const maxDuration = 300

export const { GET, POST, PUT } = serve({
    client: inngest,
    functions: reviewFunctions,
})
