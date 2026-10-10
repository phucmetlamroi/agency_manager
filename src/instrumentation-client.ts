/**
 * Vercel BotID — passive bot detection initialization (replaces Cloudflare Turnstile).
 *
 * Next.js 16 (>= 15.3) auto-loads this file on client hydration. BotID collects
 * passive signals (no widget UI, no CAPTCHA) và attach headers vào requests đến
 * các path được protect. Server validate qua `checkBotId()`.
 *
 * Recommended placement: top-level src/instrumentation-client.ts để Next.js
 * detect tự động (alternative: <BotIdClient/> trong layout — nhưng kém performance
 * hơn cho Next 15.3+).
 */

import { initBotId } from 'botid/client/core'

// The BotID client depends on rewrites injected by withBotId(). Those rewrites
// only exist on Vercel, so keep the instrumentation inert when self-hosted.
if (process.env.NEXT_PUBLIC_BOTID_ENABLED === '1') {
    initBotId({
        protect: [
            // Signup endpoint — match phạm vi cũ của Cloudflare Turnstile
            { path: '/api/auth/signup', method: 'POST' },
        ],
    })
}
