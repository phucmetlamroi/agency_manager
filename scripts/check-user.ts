/**
 * Read-only: does a user account exist for an email/handle anywhere in the WHOLE
 * system, and why isn't it showing in the staff-invite search?
 *
 * The invite search (searchInviteCandidates) is PROFILE-SCOPED — it only returns
 * people already in your profile (home profile = this profile, or they have
 * ProfileAccess to it). Anyone outside your team (incl. a brand-new account or a
 * different team) correctly shows "Không tìm thấy" and is invited via email. This
 * script bypasses that scope to tell you the ground truth.
 *
 *   npx tsx scripts/check-user.ts --email nhatdase181657@fpt.edu.vn
 *   npx tsx scripts/check-user.ts --q nhatda          # partial across email/username/name
 */
import { PrismaClient } from '@prisma/client'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

if (!process.env.DATABASE_URL) {
    try {
        const envPath = resolve(process.cwd(), '.env')
        if (existsSync(envPath)) {
            for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
                const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
                if (!m) continue
                let v = m[2].trim()
                if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
                if (process.env[m[1]] === undefined) process.env[m[1]] = v
            }
        }
    } catch { /* best-effort */ }
}

const prisma = new PrismaClient()
function argVal(flag: string): string | null {
    const i = process.argv.indexOf(flag)
    return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : null
}

const USER_SELECT = {
    id: true,
    username: true,
    displayName: true,
    email: true,
    role: true,
    profileId: true,
    createdAt: true,
    profileAccesses: { select: { profileId: true, role: true } },
} as const

async function printUser(u: any) {
    console.log(`  • #${u.id}  @${u.username}  "${u.displayName ?? ''}"  <${u.email ?? 'no-email'}>`)
    console.log(`      role=${u.role}  homeProfile=${u.profileId ?? 'NONE'}  created=${new Date(u.createdAt).toISOString().slice(0, 10)}`)
    if (u.profileAccesses?.length) {
        console.log(`      profile access: ${u.profileAccesses.map((p: any) => `${p.profileId.slice(0, 8)}…(${p.role})`).join(', ')}`)
    } else {
        console.log(`      profile access: (none) — not a member of ANY profile`)
    }
}

async function main() {
    const email = argVal('--email')
    const q = argVal('--q')
    const needle = (email || q || '').trim()
    if (!needle) {
        console.log('\nUsage:\n  --email <full email>     exact email lookup + pending invitations\n  --q <substring>          partial match across email / username / displayName\n')
        return
    }

    console.log(`\n══════ User lookup (whole system) · "${needle}" ══════\n`)

    if (email) {
        const exact = await prisma.user.findFirst({
            where: { email: { equals: email, mode: 'insensitive' } },
            select: USER_SELECT,
        })
        if (exact) {
            console.log(`EXACT email match — an account EXISTS for ${email}:`)
            await printUser(exact)
        } else {
            console.log(`NO account has the exact email ${email}.`)
        }

        // Pending workspace invitations already sent to this email.
        const invites = await prisma.workspaceInvitation.findMany({
            where: { invitedEmail: { equals: email, mode: 'insensitive' } },
            select: { id: true, invitedEmail: true, status: true, role: true, workspaceId: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
        })
        if (invites.length) {
            console.log(`\nPending/past invitations to this email: ${invites.length}`)
            for (const i of invites) {
                console.log(`  • [${i.status}] role=${i.role} workspace=${i.workspaceId?.slice(0, 8)}… sent=${new Date(i.createdAt).toISOString().slice(0, 10)}`)
            }
        } else {
            console.log(`\nNo invitation has ever been sent to this email.`)
        }
    }

    // Fuzzy match (catches typos / different casing across all three fields).
    const partial = await prisma.user.findMany({
        where: {
            OR: [
                { email: { contains: needle, mode: 'insensitive' } },
                { username: { contains: needle, mode: 'insensitive' } },
                { displayName: { contains: needle, mode: 'insensitive' } },
            ],
        },
        select: USER_SELECT,
        take: 25,
        orderBy: { createdAt: 'desc' },
    })
    console.log(`\nFuzzy matches (email/username/name contains "${needle}"): ${partial.length}`)
    for (const u of partial) await printUser(u)

    console.log(`\nInterpretation:`)
    console.log(`  - 0 exact + 0 fuzzy  → the email is NOT in the system (wrong email, or they never signed up). Use "Mời qua email" to send an invite; if they can't accept, the address is likely wrong.`)
    console.log(`  - account exists but its homeProfile / profile access does NOT include the profile you're inviting into → that's why the in-app search hid it. Use "Mời qua email" to bring them into your profile.`)
    console.log(``)
}

main()
    .then(() => prisma.$disconnect())
    .catch((e) => { console.error(e); return prisma.$disconnect().finally(() => process.exit(1)) })
