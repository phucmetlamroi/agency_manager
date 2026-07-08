/**
 * [FR-11 verify] READ-ONLY check that the FR-11 additive schema is present on the target DB:
 *   - GuestEmailVerification table
 *   - GuestSubscription table
 *   - GuestSession.emailVerifiedAt column
 *
 * NO WRITES — only count()/findFirst(). Uses the app's Accelerate PrismaClient (same DATABASE_URL as
 * the app), so run it in the environment whose DATABASE_URL is the prod Accelerate URL. It PRINTS the
 * DB host so you can CONFIRM which database you are pointed at before trusting the result.
 *
 * Usage (with the app's DATABASE_URL in the environment / .env):
 *   npx tsx scripts/verify-fr11-prod.ts
 */
import { PrismaClient } from '@prisma/client'

function dbHost(): string {
    try {
        const u = process.env.DATABASE_URL || ''
        return u ? new URL(u).host : '(DATABASE_URL not set)'
    } catch {
        return '(unparseable DATABASE_URL)'
    }
}

async function check(label: string, fn: () => Promise<unknown>): Promise<boolean> {
    try {
        await fn()
        console.log(`  ✅ ${label}`)
        return true
    } catch (e) {
        const msg = e instanceof Error ? e.message.split('\n')[0] : String(e)
        console.log(`  ❌ ${label} — ${msg}`)
        return false
    }
}

async function main() {
    const prisma = new PrismaClient()
    console.log(`\n[verify-fr11] DB host: ${dbHost()}  (READ-ONLY — no writes)\n`)

    const ok1 = await check('GuestEmailVerification table', () => prisma.guestEmailVerification.count())
    const ok2 = await check('GuestSubscription table', () => prisma.guestSubscription.count())
    const ok3 = await check('GuestSession.emailVerifiedAt column', () =>
        prisma.guestSession.findFirst({ select: { emailVerifiedAt: true } }),
    )

    console.log(
        `\n${ok1 && ok2 && ok3 ? 'FR-11 is FULLY present on this DB. ✅' : 'FR-11 is MISSING or partial — see ❌ above.'}\n`,
    )
    await prisma.$disconnect()
}

main().catch((e) => {
    console.error('[verify-fr11] ERROR:', e)
    process.exit(1)
})
