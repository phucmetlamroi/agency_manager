// [Review module] Inngest serve endpoint — hosts every review/* function.
// Inngest verifies its own requests with INNGEST_SIGNING_KEY; middleware
// already excludes /api entirely, so no session interferes.

import { serve } from 'inngest/next'
import { inngest, reviewFunctions } from '@/lib/review/inngest'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const { GET, POST, PUT } = serve({
    client: inngest,
    functions: reviewFunctions,
})
