/**
 * [Username Handle] One-shot migration script.
 *
 * For each user, set `usernameSetByUser = true` if their current username
 * already matches the new strict pattern (3-30 chars, has letter + digit +
 * special, ASCII only). All other users keep `usernameSetByUser = false`
 * (default) so they get blocked by UsernameMigrationModal on next login.
 *
 * Run: `npx tsx scripts/migrate-usernames-mark-needs-update.ts [--dry-run]`
 * Idempotent — safe to re-run.
 */

import { PrismaClient } from '@prisma/client'
import {
    USERNAME_REGEX,
    hasVietnameseDiacritics,
} from '../src/lib/username-validation'

const prisma = new PrismaClient()
const DRY_RUN = process.argv.includes('--dry-run')

async function main() {
    console.log(`\n[Username Migration] ${DRY_RUN ? 'DRY RUN' : 'EXECUTING'}\n`)
    console.log('='.repeat(70))

    const allUsers = await prisma.user.findMany({
        select: {
            id: true,
            username: true,
            email: true,
            displayName: true,
            usernameSetByUser: true,
        },
    })

    let alreadyMarked = 0
    let willMark = 0
    let needsMigrationLater = 0
    const examples = { will_mark: [] as string[], needs_modal: [] as string[] }

    for (const u of allUsers) {
        const matchesNewPattern = USERNAME_REGEX.test(u.username)
        const isEmailLike = u.username.includes('@') || u.username === u.email
        const hasDiacritic = hasVietnameseDiacritics(u.username)
        const isClean = matchesNewPattern && !isEmailLike && !hasDiacritic

        if (u.usernameSetByUser) {
            alreadyMarked++
            continue
        }

        if (isClean) {
            // Username already matches new rules — mark as set
            willMark++
            if (examples.will_mark.length < 5) {
                examples.will_mark.push(
                    `${u.username} (${u.displayName ?? '(no displayName)'})`,
                )
            }
            if (!DRY_RUN) {
                await prisma.user.update({
                    where: { id: u.id },
                    data: { usernameSetByUser: true },
                })
            }
        } else {
            needsMigrationLater++
            if (examples.needs_modal.length < 5) {
                examples.needs_modal.push(
                    `${u.username} (${u.displayName ?? '(no displayName)'}) — ${
                        hasDiacritic ? 'has diacritic' : isEmailLike ? 'email-like' : 'pattern mismatch'
                    }`,
                )
            }
        }
    }

    console.log(`Total users: ${allUsers.length}`)
    console.log(`  Already marked (usernameSetByUser=true): ${alreadyMarked}`)
    console.log(`  Will mark NOW (already valid): ${willMark}`)
    console.log(`  Need modal on next login: ${needsMigrationLater}`)
    console.log('-'.repeat(70))

    if (examples.will_mark.length > 0) {
        console.log(`\nExamples — already valid (will set usernameSetByUser=true):`)
        examples.will_mark.forEach((x) => console.log(`  ✓ ${x}`))
    }

    if (examples.needs_modal.length > 0) {
        console.log(`\nExamples — will see migration modal on next login:`)
        examples.needs_modal.forEach((x) => console.log(`  ⚠️  ${x}`))
    }

    console.log()
    if (DRY_RUN) {
        console.log('🟡 DRY RUN — no changes made. Re-run without --dry-run to execute.\n')
    } else {
        console.log('✅ Migration complete.\n')
    }
}

main()
    .catch((e) => {
        console.error('Error:', e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
