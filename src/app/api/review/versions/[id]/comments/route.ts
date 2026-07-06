// [Review module P4.1] GET (list + polling delta) / POST (create + reply) comments
// on one version (API-SPEC §4.1–4.2).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { withReviewRoute } from '@/lib/review/route-auth'
import { apiJson, parseBody } from '@/lib/review/errors'
import { listComments, createComment, createCommentSchema, type ListCommentsOpts } from '@/lib/review/comments'

type Ctx = { params: Promise<{ id: string }> }

export const GET = withReviewRoute<Ctx>(async (req: NextRequest, { params }) => {
    const { id } = await params
    const sp = new URL(req.url).searchParams
    const opts: ListCommentsOpts = {}
    const since = sp.get('since')
    if (since) opts.since = since
    const sort = sp.get('sort')
    if (sort === 'newest' || sort === 'timecode') opts.sort = sort
    const filter = sp.get('filter')
    if (filter === 'unresolved' || filter === 'internal' || filter === 'public' || filter === 'mine') opts.filter = filter
    const authorId = sp.get('authorId')
    if (authorId) opts.authorId = authorId
    const q = sp.get('q')
    if (q) opts.q = q
    return apiJson(await listComments(id, opts))
})

export const POST = withReviewRoute<Ctx>(async (req: NextRequest, { params }) => {
    const { id } = await params
    const parsed = await parseBody(req, createCommentSchema)
    if (!parsed.ok) return parsed.res
    return apiJson(await createComment(id, parsed.data), { status: 201 })
})
