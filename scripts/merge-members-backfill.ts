/**
 * [Merge members → ProfileAccess] Backfill for the membership-system merge.
 *
 * The org-level "Thành viên" page (ProfileAccess) is now the single membership/invite surface.
 * This ensures every user who currently has workspace access ALSO has a ProfileAccess row for
 * that workspace's profile, so they appear in the unified roster + are assignable + keep access.
 *
 * Pass 1 — create missing ProfileAccess:
 *   For each (user, profile) where the user has a WorkspaceMember in one of the profile's
 *   workspaces but NO ProfileAccess for that profile → create ProfileAccess(role='USER').
 *   - role is ALWAYS 'USER'. NEVER creates a 2nd OWNER; a workspace OWNER/ADMIN keeps their
 *     elevated PER-WORKSPACE role via the existing WorkspaceMember override + security.ts.
 *   - skips CLIENT / LOCKED users (view-only / banned must never become internal members).
 *   - grantedAt backdated to the earliest joinedAt (irrelevant to USER access, kept for audit).
 *
 * Pass 2 — retire stale invitations:
 *   PENDING WorkspaceInvitation rows whose invitee ALREADY has ProfileAccess to that profile
 *   (e.g. the baojaco "đang chờ" that never cleared) → mark EXPIRED. Genuine pending invites for
 *   non-members are left untouched.
 *
 * Idempotent + re-runnable. DEFAULT = dry-run (read-only preview). Pass --apply to write.
 *
 * Usage:
 *   npx tsx scripts/merge-members-backfill.ts            # dry-run (read-only)
 *   npx tsx scripts/merge-members-backfill.ts --apply    # write
 */
import fs from 'fs'

// tsx doesn't auto-load .env and @prisma/client doesn't either — load it so DATABASE_URL resolves.
try {
  const env = fs.readFileSync('.env', 'utf8')
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
} catch { /* env already in shell */ }

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

async function main() {
  console.log(`=== Merge members → ProfileAccess backfill ${APPLY ? '(APPLY)' : '(DRY-RUN)'} ===\n`)

  // ── Pass 1: ProfileAccess(USER) for WorkspaceMember users missing it ──
  const wm = await prisma.workspaceMember.findMany({
    select: {
      userId: true,
      joinedAt: true,
      workspace: { select: { profileId: true } },
      user: { select: { role: true, username: true, nickname: true } },
    },
  })

  // group by (userId, profileId), keep earliest joinedAt + a label
  const need = new Map<string, { userId: string; profileId: string; earliest: Date; label: string }>()
  for (const m of wm) {
    const pid = m.workspace?.profileId
    if (!pid) continue
    if (m.user.role === 'CLIENT' || m.user.role === 'LOCKED') continue // never elevate view-only/banned
    const key = `${m.userId}::${pid}`
    const t = m.joinedAt ?? new Date()
    const cur = need.get(key)
    if (!cur) need.set(key, { userId: m.userId, profileId: pid, earliest: t, label: m.user.nickname ?? m.user.username })
    else if (t < cur.earliest) cur.earliest = t
  }

  let created = 0
  let present = 0
  for (const v of need.values()) {
    const exists = await prisma.profileAccess.findUnique({
      where: { userId_profileId: { userId: v.userId, profileId: v.profileId } },
      select: { role: true },
    })
    if (exists) { present++; continue }
    console.log(`+ ProfileAccess(USER)  ${v.label}  →  profile ${v.profileId.slice(0, 8)}  (grantedAt ${v.earliest.toISOString().slice(0, 10)})`)
    if (APPLY) {
      await prisma.profileAccess
        .create({ data: { userId: v.userId, profileId: v.profileId, role: 'USER', grantedAt: v.earliest } })
        .catch((e: any) => { if (e?.code !== 'P2002') throw e }) // P2002 = concurrent create, fine
    }
    created++
  }
  console.log(`\nPass 1: ${created} ProfileAccess(USER) ${APPLY ? 'created' : 'to create'}, ${present} already present.\n`)

  // ── Pass 2: retire stale PENDING workspace invitations for users who are already members ──
  const pending = await prisma.workspaceInvitation.findMany({
    where: { status: 'PENDING' },
    select: { id: true, invitedUserId: true, workspace: { select: { profileId: true } } },
  })
  let retired = 0
  for (const inv of pending) {
    const pid = inv.workspace?.profileId
    if (!pid) continue
    const pa = await prisma.profileAccess.findUnique({
      where: { userId_profileId: { userId: inv.invitedUserId, profileId: pid } },
      select: { role: true },
    })
    if (!pa) continue // genuine pending for a non-member — leave it
    console.log(`~ retire PENDING invite ${inv.id.slice(0, 8)} (invitee already a member of profile ${pid.slice(0, 8)})`)
    if (APPLY) {
      await prisma.workspaceInvitation.updateMany({
        where: { id: inv.id, status: 'PENDING' },
        data: { status: 'EXPIRED', respondedAt: new Date() },
      })
    }
    retired++
  }
  console.log(`Pass 2: ${retired} stale PENDING invitations ${APPLY ? 'retired' : 'to retire'}.`)

  console.log(`\n${APPLY ? '✅ Applied.' : '💡 Dry-run. Re-run with --apply to write.'}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
