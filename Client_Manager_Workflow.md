# WORKFLOW: CLIENT MANAGER (CRM)

This document details the actual operational workflow of the Client Manager (CRM) module within the Agency Manager system. This workflow is designed to optimize client management from initial onboarding to final invoice generation.

---

## PHASE 1: CLIENT ONBOARDING

Every process begins when the Agency secures a new client.

1. **Create Root Client:**
   - The Admin navigates to `/admin/crm`.
   - Clicks `Add Client`.
   - Enters the Company or Individual name (e.g., *Vinhomes*).
   - The system creates a Client Record with `parentId = null`.

2. **Structure Sub-brands (If applicable):**
   - If *Vinhomes* has multiple subdivisions or media channels (e.g., *Ocean Park*, *Smart City*).
   - The Admin clicks `Add Sub-client` directly under the root client.
   - Alternatively, if a client already existed independently, the Admin can **Drag & Drop** that independent client into *Vinhomes* to merge them.
   - The system updates the `parentId` of the Sub-client to point to the Root Client's ID.

---

## PHASE 2: PROJECT ORGANIZATION & DEPOSIT

The client signs the contract and the campaign begins.

1. **Initialize Project:**
   - The Admin visits the client detail page `/admin/crm/[clientId]`.
   - Creates a new Project (e.g., *Lunar New Year Campaign 2026*). This Project is directly assigned to that Client to easily group Tasks later.

2. **Record Deposit:**
   - If the client makes an upfront payment, the Admin/Treasurer updates the `Deposit Balance` for that Client. This balance will automatically be deducted from future invoices.

---

## PHASE 3: OPERATIONS & TRACKING (THE FEEDBACK LOOP)

Throughout the working process, the client's data will be continuously updated via Tasks.

1. **Task Assignment:**
   - When there is a video/design task, the Admin creates a Task and **selects the corresponding Client + Project**.
   - The staff member starts working and submits the deliverable (Status: `Review`).

2. **Log Errors & Feedback (Feedback System):**
   - **Internal Error:** The Admin reviews the submission, finds it unsatisfactory -> Sends an `INTERNAL` type Feedback. The staff member receives a Penalty.
   - **Client Revision:** The Admin sends the file to the Client, the Client requests changes (e.g., change music/color) -> The Admin sends a `CLIENT` type Feedback. This error does **not** penalize the staff, but the system accumulates it to evaluate how "difficult" or "high-friction" the Client is.

---

## PHASE 4: ANALYTICS & FINANCIAL SETTLEMENT (END OF MONTH)

At the end of the cycle (usually month-end or campaign completion), the Admin evaluates performance and collects payment.

1. **Client Analytics:**
   - The Admin goes to `/admin/crm/[clientId]`.
   - The system automatically calculates and displays:
     - **Revenue:** Total money generated from all Tasks of this Client AND their *sub-clients*.
     - **Friction Index:** A high rate of Client Revisions indicates this client consumes a lot of the team's time.
     - **Input Quality:** Evaluates if the client frequently sends messy or unclear briefs.

2. **Aggregated Invoicing:**
   - The status of completed Tasks for this client is currently `UNBILLED`.
   - The Admin clicks the **Create Invoice** button.
   - **Smart Aggregation Logic:** The system scans ALL `UNBILLED` Tasks of the Parent Company **PLUS** ALL `UNBILLED` Tasks of the Subsidiary Companies.
   - It calculates the Subtotal -> Subtracts the `Deposit Balance` -> Outputs the Total Due.
   - The Tasks are then marked as `INVOICED` to prevent duplicate billing next month.
   - An automated email sends the invoice to the Admin/Client.

---
**END OF CRM WORKFLOW.** Data from the CRM continues to flow into the Main Dashboard and the Agency's overall Profit reports.
