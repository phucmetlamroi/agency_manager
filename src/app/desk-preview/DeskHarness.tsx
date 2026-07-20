'use client'

/* DEV-ONLY visual harness for The Desk client portal. Mock data + a no-op action
   adapter so the whole room can be previewed without a DB token. Not shipped to
   production (the page gates on NODE_ENV). */

import DeskApp from '@/components/portal/desk/DeskApp'
import type { Deliverable, Invoice, DeliverableActions, DocumentsSnapshot, ClientRequestPortalDTO } from '@/components/portal/calm/types'

const now = Date.now()
const iso = (daysFromNow: number) => new Date(now + daysFromNow * 86400000).toISOString()

function del(p: Partial<Deliverable> & { id: string; title: string; clientStatus: string }): Deliverable {
    return {
        type: 'Short-form reel', status: 'Đang làm', needsYou: false, deadline: iso(5), createdAt: iso(-20), updatedAt: iso(-1),
        productLink: null, references: null, resources: null, collectFilesLink: null, notes_vi: null, notes_en: null,
        duration: '0:45', clientReview: null, clientFeedback: null,
        clientReviewedAt: null, clientId: 1, client: { id: 1, name: 'Meridian Group' }, clientPath: 'Meridian Group',
        project: null, rating: null, assignee: null, manager: 'Ava Lin', jobPriceUSD: 1200, workspaceId: 'w7', workspaceName: 'July 2026',
        reviewUrl: null, ...p,
    }
}

const DELIVERABLES: Deliverable[] = [
    del({ id: 'd1', title: 'Founder story — 60s hero cut', clientStatus: 'Awaiting your review', needsYou: true, deadline: iso(2), duration: '1:02', reviewUrl: '/r/desk-demo-1', client: { id: 1, name: 'Meridian Group' }, clientId: 1 }),
    del({ id: 'd2', title: 'Product launch teaser', clientStatus: 'Ready for your review', needsYou: true, deadline: iso(0), duration: '0:30', reviewUrl: '/r/desk-demo-2', client: { id: 2, name: 'Harbor Coffee' }, clientId: 2 }),
    del({ id: 'd3', title: 'Series A recap — long form', clientStatus: 'In progress', deadline: iso(9), duration: '3:20', jobPriceUSD: 3400 }),
    del({ id: 'd4', title: 'Weekly reel #31', clientStatus: 'In revision', clientReview: 'CHANGES', clientFeedback: 'Tighten the intro and swap the track in the back half.', deadline: iso(4), jobPriceUSD: 800, client: { id: 2, name: 'Harbor Coffee' }, clientId: 2 }),
    del({ id: 'd5', title: 'Brand film — director’s cut', clientStatus: 'Completed', needsYou: false, clientReviewedAt: iso(-3), clientReview: 'APPROVED', deadline: iso(-3), duration: '2:10', jobPriceUSD: 5200, productLink: 'https://example.com/files/brand-film', rating: { creativeQuality: 5, responsiveness: 5, communication: 4, qualitativeFeedback: null } }),
    del({ id: 'd6', title: 'Podcast highlight — ep. 12', clientStatus: 'Received', type: 'Podcast', deadline: iso(12), jobPriceUSD: 600, client: { id: 3, name: 'The Long Table' }, clientId: 3 }),
    del({ id: 'd7', title: 'Event aftermovie', clientStatus: 'In production', deadline: iso(15), duration: '1:30', jobPriceUSD: 2600, client: { id: 3, name: 'The Long Table' }, clientId: 3, workspaceId: 'w6', workspaceName: 'June 2026' }),
    del({ id: 'd8', title: 'Testimonial cutdown', clientStatus: 'Completed', clientReviewedAt: iso(-30), deadline: iso(-30), jobPriceUSD: 900, workspaceId: 'w6', workspaceName: 'June 2026' }),
]

const INVOICES: Invoice[] = [
    { id: 'i1', invoiceNumber: 'INV-2026-041', issueDate: iso(-28), dueDate: iso(-13), totalDue: 4800, status: 'OVERDUE', filePath: null, clientId: 1, items: [{ description: 'Founder story — 60s hero cut', amount: 1200, quantity: 1 }, { description: 'Brand film — director’s cut', amount: 3600, quantity: 1 }], workspaceId: 'w7', workspaceName: 'July 2026' },
    { id: 'i2', invoiceNumber: 'INV-2026-044', issueDate: iso(-6), dueDate: iso(14), totalDue: 6200, status: 'SENT', filePath: null, clientId: 1, items: [{ description: 'Series A recap — long form', amount: 3400, quantity: 1 }, { description: 'Event aftermovie', amount: 2600, quantity: 1 }, { description: 'Weekly reel #31', amount: 200, quantity: 1 }], workspaceId: 'w7', workspaceName: 'July 2026' },
    { id: 'i3', invoiceNumber: 'INV-2026-038', issueDate: iso(-40), dueDate: iso(-25), totalDue: 5200, status: 'PAID', filePath: null, clientId: 1, items: [{ description: 'Brand film — director’s cut', amount: 5200, quantity: 1 }], workspaceId: 'w6', workspaceName: 'June 2026' },
]

const DOCS: DocumentsSnapshot = {
    folders: [
        { id: 'f1', parentId: null, name: 'Brand film — masters', workspaceId: 'w7', clientId: 1, itemCount: 3, totalBytes: '4600000000', kind: 'folder' },
        { id: 'f2', parentId: null, name: 'Social cutdowns', workspaceId: 'w7', clientId: 1, itemCount: 2, totalBytes: '820000000', kind: 'folder' },
    ],
    assets: [
        { id: 'a1', folderId: 'f1', title: 'Brand-Film_ProRes_Master.mov', mediaKind: 'video', workspaceId: 'w7', workspaceName: 'July 2026', clientId: 1, clientName: 'Meridian Group', statusLabel: 'Delivered', reviewUrl: '/r/desk-demo-1', versionCount: 2, currentVersion: { id: 'v1', versionNumber: 2, fileName: 'Brand-Film_ProRes_Master.mov', sizeBytes: '3200000000', durationMs: 130000, width: 3840, height: 2160, createdAt: iso(-3), posterUrl: null, storyboardVttUrl: null, publicCommentCount: 0 }, createdAt: iso(-3) },
        { id: 'a2', folderId: 'f2', title: 'Key-art_final.png', mediaKind: 'image', workspaceId: 'w7', workspaceName: 'July 2026', clientId: 1, clientName: 'Meridian Group', statusLabel: 'Delivered', reviewUrl: null, versionCount: 1, currentVersion: { id: 'v2', versionNumber: 1, fileName: 'Key-art_final.png', sizeBytes: '18000000', durationMs: null, width: 4000, height: 2500, createdAt: iso(-4), posterUrl: null, storyboardVttUrl: null, publicCommentCount: 0 }, createdAt: iso(-4) },
    ],
    summary: { folderCount: 2, assetCount: 2, totalBytes: '5420000000' },
    generatedAt: iso(0),
}

const actions: DeliverableActions = {
    approve: async () => ({ success: true }),
    requestChanges: async () => ({ success: true }),
    rate: async () => ({ success: true }),
    activity: async () => [
        { label: 'A new cut was delivered for your review', who: 'Studio', date: iso(-1) },
        { label: 'Editing started', who: 'Studio', date: iso(-6) },
        { label: 'Request received', who: 'You', date: iso(-20) },
    ],
    getSubmitOptions: async () => ({ workspaces: [{ id: 'w7', label: 'July 2026' }, { id: 'w6', label: 'June 2026' }], brands: [{ id: 1, name: 'Meridian Group' }, { id: 2, name: 'Harbor Coffee' }, { id: 3, name: 'The Long Table' }], clientName: 'Meridian Group' }),
    submitRequest: async () => ({ success: true, requestId: 'r1' }),
    getRequests: async (): Promise<ClientRequestPortalDTO[]> => [
        { id: 'q1', title: 'Q3 brand film — 60s cutdown', status: 'reviewing', statusLabel: 'Under review', submittedAt: iso(-2), reviewedAt: null, desiredType: 'Short form', desiredDeadline: iso(20), videoList: 'Hero cut\nVertical cutdown', notes: 'Warm, cinematic — reference the last brand film.', rawFootage: 'https://drive.example.com/raw', collectFile: null, bRoll: 'https://drive.example.com/broll', refs: 'https://vimeo.com/ref', submitFolder: null, script: null, studioReply: null, linkedTaskId: null, brandName: 'Meridian Group', periodName: 'July 2026' },
        { id: 'q2', title: 'Event aftermovie', status: 'declined', statusLabel: 'Declined', submittedAt: iso(-10), reviewedAt: iso(-8), desiredType: 'Long form', desiredDeadline: iso(-1), videoList: null, notes: null, rawFootage: 'https://drive.example.com/event', collectFile: null, bRoll: null, refs: null, submitFolder: null, script: null, studioReply: 'We can’t hit this date with the current footage set — let’s aim for a September slot and add a second camera. Happy to scope it then.', linkedTaskId: null, brandName: 'Meridian Group', periodName: 'June 2026' },
        { id: 'q3', title: 'Testimonial series — 3 clips', status: 'accepted', statusLabel: 'Accepted', submittedAt: iso(-25), reviewedAt: iso(-24), desiredType: 'Short form', desiredDeadline: iso(-3), videoList: null, notes: null, rawFootage: 'https://drive.example.com/testi', collectFile: null, bRoll: null, refs: null, submitFolder: null, script: null, studioReply: null, linkedTaskId: 'd5', brandName: 'Meridian Group', periodName: 'June 2026' },
    ],
    createSubClient: async () => ({ success: true, clientId: 9, name: 'New channel' }),
    getCommentFeed: async () => [
        { kind: 'event', id: 'e1', authorName: 'Studio', label: 'A cut was delivered', createdAt: iso(-1) },
        { kind: 'comment', id: 'c1', authorName: 'Ava Lin', body: 'Latest cut is up — let us know what you think!', createdAt: iso(-1), isMine: false },
        { kind: 'comment', id: 'c2', authorName: 'You', body: 'Looks great, one small note coming.', createdAt: iso(0), isMine: true },
    ],
    postComment: async () => ({ success: true }),
    reactComment: async () => ({ success: true }),
    notifyGet: async () => null,
    notifyRequest: async () => ({ success: true }),
    notifyVerify: async () => ({ success: true }),
    notifyRemove: async () => ({ success: true }),
    documents: async () => DOCS,
    downloadDocuments: async (ids) => ({ success: true, files: ids.map(id => ({ versionId: id, fileName: id + '.bin', url: '#', expiresAt: iso(0) })) }),
    zipUrl: (folderId) => `#zip-${folderId ?? 'all'}`,
    zipUrlForAssets: (ids) => `#zip-picked-${ids.join('+')}`,
    approveMany: async (ids) => ({ success: true, approved: ids.length, skipped: 0 }),
}

export default function DeskHarness() {
    return (
        <DeskApp
            mode="share"
            actions={actions}
            locale="en"
            accountName="Meridian Group"
            contactName="Amara Cole"
            agencyName="Kẻ Cô Độc Studio"
            initialDeliverables={DELIVERABLES}
            initialInvoices={INVOICES}
            workspaces={[{ id: 'w7', name: 'July 2026' }, { id: 'w6', name: 'June 2026' }]}
        />
    )
}
