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
import PortalApp from '@/components/portal/calm/PortalApp'
import {
    approveDeliverableViaToken,
    requestChangesViaToken,
    submitRatingViaToken,
    getActivityViaToken,
} from '@/actions/share-portal-actions'
import type { Deliverable, Invoice, Workspace, DeliverableActions } from '@/components/portal/calm/types'

export default function SharePortalClient({ token, clientName, profileName, deliverables, invoices, workspaces }: {
    token: string
    clientName: string
    profileName: string
    deliverables: Deliverable[]
    invoices: Invoice[]
    workspaces: Workspace[]
}) {
    const actions: DeliverableActions = useMemo(() => ({
        approve: (taskId) => approveDeliverableViaToken(token, taskId),
        requestChanges: (taskId, notes) => requestChangesViaToken(token, taskId, notes),
        rate: (taskId, cq, rs, cm, fb) => submitRatingViaToken(token, taskId, cq, rs, cm, fb),
        activity: (taskId) => getActivityViaToken(token, taskId),
    }), [token])

    return (
        <PortalApp
            mode="share"
            actions={actions}
            workspaceId="" /* share link spans all workspaces — unused in share mode */
            locale="en"
            currentUserId=""
            accountName={clientName}
            contactName={clientName}
            agencyName={profileName}
            initialDeliverables={deliverables}
            initialInvoices={invoices}
            workspaces={workspaces}
        />
    )
}
