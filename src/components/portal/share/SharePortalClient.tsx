'use client'

/**
 * [Canonical Clients] Client orchestrator for the PUBLIC share-link portal.
 * Builds the token-bound action adapter (DeliverableActions) and renders the
 * same calm PortalApp the account portal used — mode='share' hides
 * session-only chrome (switcher, logout, locale).
 *
 * The token never leaves this closure except inside the server-action calls;
 * it is NOT rendered into the DOM.
 */

import { useMemo } from 'react'
import DeskApp from '@/components/portal/desk/DeskApp'
import {
    approveDeliverableViaToken,
    requestChangesViaToken,
    submitRatingViaToken,
    getActivityViaToken,
    getSubmitOptionsViaToken,
    submitClientRequestViaToken,
    getClientRequestsViaToken,
    createSubClientViaToken,
    getCommentFeedViaToken,
    postCommentViaToken,
    toggleReactionViaToken,
    getPortalNotifyEmail,
    requestPortalNotifyEmail,
    verifyPortalNotifyEmail,
    removePortalNotifyEmail,
    ensureScreeningIdentity,
} from '@/actions/share-portal-actions'
import { downloadDocumentsViaToken, getDocumentsViaToken } from '@/actions/share-document-actions'
import type { Deliverable, Invoice, Workspace, DeliverableActions } from '@/components/portal/calm/types'

export default function SharePortalClient({ token, clientName, profileName, brandLogoUrl = null, brandAccent = null, deliverables, invoices, workspaces }: {
    token: string
    clientName: string
    profileName: string
    /** [Trial P3 — white-label] agency logo + accent for the portal lockup. */
    brandLogoUrl?: string | null
    brandAccent?: string | null
    deliverables: Deliverable[]
    invoices: Invoice[]
    workspaces: Workspace[]
}) {
    const actions: DeliverableActions = useMemo(() => ({
        approve: (taskId) => approveDeliverableViaToken(token, taskId),
        requestChanges: (taskId, notes) => requestChangesViaToken(token, taskId, notes),
        rate: (taskId, cq, rs, cm, fb) => submitRatingViaToken(token, taskId, cq, rs, cm, fb),
        activity: (taskId) => getActivityViaToken(token, taskId),
        getSubmitOptions: () => getSubmitOptionsViaToken(token),
        submitRequest: (input) => submitClientRequestViaToken(token, input),
        getRequests: () => getClientRequestsViaToken(token),
        createSubClient: (input) => createSubClientViaToken(token, input),
        getCommentFeed: (taskId) => getCommentFeedViaToken(token, taskId),
        postComment: (taskId, body, parentId) => postCommentViaToken(token, taskId, body, parentId),
        reactComment: (commentId, emoji) => toggleReactionViaToken(token, commentId, emoji),
        notifyGet: () => getPortalNotifyEmail(token),
        notifyRequest: (email) => requestPortalNotifyEmail(token, email),
        notifyVerify: (code) => verifyPortalNotifyEmail(token, code),
        notifyRemove: () => removePortalNotifyEmail(token),
        documents: () => getDocumentsViaToken(token),
        downloadDocuments: (versionIds) => downloadDocumentsViaToken(token, versionIds),
        // The route re-resolves this token server-side and re-checks the invoice id
        // against the SAME client/workspace scope as getShareSnapshot, so the URL is
        // no more powerful than the ledger the client is already looking at.
        // Carry the portal's verified identity into the screening room. The slug is the
        // only thing that leaves this closure; the token stays here and is re-resolved
        // server-side, which also re-checks the video belongs to this client.
        prepareScreening: async (reviewUrl) => {
            const slug = reviewUrl.split('/r/')[1]?.split(/[/?#]/)[0]
            if (slug) await ensureScreeningIdentity(token, slug)
        },
        invoicePdfUrl: (invoiceId) =>
            `/api/share/${encodeURIComponent(token)}/invoices/${encodeURIComponent(invoiceId)}/pdf`,
        // [Client bulk download] One .zip for a whole folder — or the whole library when
        // folderId is null. The route re-resolves this token and rebuilds the SAME snapshot
        // the Library is showing, so it can only ever bundle files already on screen.
        zipUrl: (folderId) =>
            `/api/share/${encodeURIComponent(token)}/download-zip` +
            (folderId ? `?folderId=${encodeURIComponent(folderId)}` : ''),
    }), [token])

    return (
        <DeskApp
            mode="share"
            actions={actions}
            locale="en"
            accountName={clientName}
            contactName={clientName}
            agencyName={profileName}
            brandLogoUrl={brandLogoUrl}
            brandAccent={brandAccent}
            initialDeliverables={deliverables}
            initialInvoices={invoices}
            workspaces={workspaces}
        />
    )
}
