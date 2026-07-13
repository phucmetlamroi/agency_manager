'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

export async function toggleMobileView(forceMobile: boolean) {
    const cookieStore = await cookies()
    // Store preference for 1 year
    cookieStore.set('view-mode', forceMobile ? 'mobile' : 'desktop', {
        maxAge: 365 * 24 * 60 * 60,
        path: '/'
    })
    revalidatePath('/', 'layout')
}

// [Giao diện 2 · Mission Control] Persist which admin UI the user prefers.
// 'mc'    → auto-land /admin on the Mission Control board (opt-in, desktop only).
// 'admin' → the default Giao diện 1 experience (also used to CLEAR an 'mc' opt-in,
//           so the MC "← Giao diện 1" control can escape the auto-land redirect loop).
// Mirrors the `view-mode` precedent above. Gated `=== 'mc'` on read, so anyone who
// never toggled is byte-for-byte unaffected.
export async function setUiPref(pref: 'mc' | 'admin') {
    const cookieStore = await cookies()
    cookieStore.set('ui-pref', pref, {
        maxAge: 365 * 24 * 60 * 60,
        path: '/',
    })
}
