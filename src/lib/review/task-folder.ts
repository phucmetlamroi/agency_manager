// [Review module P1.5] Auto-create the folder tree for a task-drawer upload
// (API-SPEC §6.1 step 3): root → [Client] → [Brand?] → [Video]. Each level is
// find-or-created by a deterministic `systemKey` (unique in the schema), which is
// race-safe (two editors uploading at once converge on the same rows) and
// rename-tolerant (matched by key, not by display name). This is the schema's
// idempotency mechanism in place of the spec's (parentId, lower(name)) index.

import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { buildSystemKey, slugifyBrand } from './upload-helpers'
import type { ParsedTaskVideo } from './parse-task-context'

export interface BreadcrumbItem {
    id: string
    name: string
}

interface FolderRef {
    id: string
    path: string
    depth: number
    name: string
}

async function ensureFolder(args: {
    workspaceId: string
    parent: FolderRef | null
    name: string
    systemKey: string
    clientId?: string | null
    taskId?: string | null
    createdById?: string | null
    /** [QA 2026-07-18] Behaviour when the DB's partial unique index
     *  UNIQUE ("parentId", lower("name")) WHERE "deletedAt" IS NULL AND "parentId" IS NOT NULL
     *  rejects the create because a LIVE sibling already owns this (parent, name) under a
     *  DIFFERENT systemKey:
     *    'adopt'  (default) → reuse that sibling. Right for the CLIENT/BRAND levels, where the
     *              name refers to the SAME entity (e.g. the "APR" client folder was first minted
     *              with a slug clientKey, now the task resolves a real/duplicate clientId → new
     *              systemKey, same name).
     *    'suffix' → mint a DISTINCT "name (2)"/"(3)"… folder. Right for the per-task VIDEO leaf:
     *              two different tasks that parse to the same video name must NOT share a folder,
     *              or the follow-on per-folder asset-name index (folderId, lower(name)) would just
     *              collide next. */
    onNameCollision?: 'adopt' | 'suffix'
}): Promise<FolderRef> {
    const found = await prisma.reviewFolder.findUnique({ where: { systemKey: args.systemKey } })
    if (found) return { id: found.id, path: found.path, depth: found.depth, name: found.name }

    const isP2002 = (e: unknown): e is Prisma.PrismaClientKnownRequestError =>
        e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'

    // create + path patch in ONE tx: the row becomes visible only after commit with its final
    // materialized path (never the placeholder '/'). A concurrent create blocks on the unique
    // systemKey index until this commits, then gets P2002 → refetches the correct-path row.
    const createRow = (name: string): Promise<FolderRef> =>
        prisma.$transaction(async (tx) => {
            const created = await tx.reviewFolder.create({
                data: {
                    workspaceId: args.workspaceId,
                    parentId: args.parent?.id ?? null,
                    name,
                    path: '/', // materialized path needs the row id → patched right after (same tx)
                    depth: args.parent ? args.parent.depth + 1 : 0,
                    systemKey: args.systemKey,
                    clientId: args.clientId ?? null,
                    taskId: args.taskId ?? null,
                    createdById: args.createdById ?? null,
                },
            })
            const path = args.parent ? `${args.parent.path}${created.id}/` : `/${created.id}/`
            await tx.reviewFolder.update({ where: { id: created.id }, data: { path } })
            return { id: created.id, path, depth: created.depth, name: created.name }
        })

    try {
        return await createRow(args.name)
    } catch (e) {
        if (!isP2002(e)) throw e
        // (a) Lost a create race on the unique systemKey → adopt the winner's row.
        const bySystemKey = await prisma.reviewFolder.findUnique({ where: { systemKey: args.systemKey } })
        if (bySystemKey) return { id: bySystemKey.id, path: bySystemKey.path, depth: bySystemKey.depth, name: bySystemKey.name }

        // (b) Otherwise the P2002 is the (parentId, lower(name)) name collision — resolve per mode.
        if ((args.onNameCollision ?? 'adopt') === 'adopt') {
            const byName = await prisma.reviewFolder.findFirst({
                where: {
                    workspaceId: args.workspaceId,
                    parentId: args.parent?.id ?? null,
                    deletedAt: null,
                    name: { equals: args.name, mode: 'insensitive' },
                },
                orderBy: { createdAt: 'asc' },
                select: { id: true, path: true, depth: true, name: true },
            })
            if (byName) return byName
            throw e
        }

        // 'suffix': mint a distinct folder so two tasks with the same video name stay separate.
        // systemKey remains task-scoped, so this task's own retries still resolve by systemKey above.
        for (let n = 2; n <= 200; n++) {
            try {
                return await createRow(`${args.name} (${n})`)
            } catch (e2) {
                if (!isP2002(e2)) throw e2
                // A concurrent instance of THIS task may have won the systemKey → adopt it.
                const raced = await prisma.reviewFolder.findUnique({ where: { systemKey: args.systemKey } })
                if (raced) return { id: raced.id, path: raced.path, depth: raced.depth, name: raced.name }
                // else this suffix is taken by yet another sibling → try the next number.
            }
        }
        throw e
    }
}

/**
 * Resolve/create root → client → [brand] → video for a task upload.
 * `clientId` is the review-scalar string form of the task's client (or null).
 * Returns the leaf (video) folder + the breadcrumb for the UI "saved to …" toast.
 */
export async function ensureTaskFolderPath(args: {
    workspaceId: string
    rootName: string
    taskId: string
    clientId: string | null
    parsed: ParsedTaskVideo
    createdById: string
}): Promise<{ videoFolder: FolderRef; breadcrumb: BreadcrumbItem[] }> {
    const { workspaceId, rootName, taskId, clientId, parsed, createdById } = args
    // Stable client identity: the real clientId when present, else a slug of the parsed name.
    const clientKey = clientId ?? slugifyBrand(parsed.client)
    const breadcrumb: BreadcrumbItem[] = []

    const root = await ensureFolder({
        workspaceId,
        parent: null,
        name: rootName || 'Team',
        systemKey: buildSystemKey({ workspaceId }),
        createdById,
    })
    breadcrumb.push({ id: root.id, name: root.name })

    const client = await ensureFolder({
        workspaceId,
        parent: root,
        name: parsed.client,
        systemKey: buildSystemKey({ workspaceId, clientId: clientKey }),
        clientId,
        createdById,
    })
    breadcrumb.push({ id: client.id, name: client.name })

    let parent = client
    let brandKey: string | null = null
    if (parsed.brand) {
        brandKey = slugifyBrand(parsed.brand)
        const brand = await ensureFolder({
            workspaceId,
            parent: client,
            name: parsed.brand,
            systemKey: buildSystemKey({ workspaceId, clientId: clientKey, brandKey }),
            clientId,
            createdById,
        })
        breadcrumb.push({ id: brand.id, name: brand.name })
        parent = brand
    }

    // The video level is per (task, video-name): the task's own deliverable folder.
    const videoSystemKey = `${buildSystemKey({ workspaceId, clientId: clientKey, brandKey, taskId })}:video:${slugifyBrand(parsed.video)}`
    const video = await ensureFolder({
        workspaceId,
        parent,
        name: parsed.video,
        systemKey: videoSystemKey,
        clientId,
        taskId,
        createdById,
        // Per-task leaf: if another task already owns this video name under the same client/brand,
        // mint a distinct "name (2)" folder instead of sharing (which would collide on the asset index).
        onNameCollision: 'suffix',
    })
    breadcrumb.push({ id: video.id, name: video.name })

    return { videoFolder: video, breadcrumb }
}
