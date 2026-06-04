# SITEMAP: CLIENT MANAGER (CRM)

Below is the detailed diagram of the interface structure and navigation flow of the Client Manager module in the system.

```text
/[workspaceId]/admin/crm  (Client Manager Home)
 │
 ├── 1. Client List (Displayed as a Hierarchical Tree)
 │    ├── Root Client (Parent Client)
 │    │    └── Sub-client (Subsidiary / Brand)
 │    │
 │    ├── 1.1 List Actions:
 │    │    ├── Drag & Drop: Merge an independent client to become a sub-client.
 │    │    ├── "Add Sub-client" Button: Directly create a child brand.
 │    │    ├── "Unmerge" Button: Extract a sub-client to become an independent Root Client.
 │    │    ├── "Edit Name" Button.
 │    │    └── "Delete" Button (Only succeeds if the client has no transaction data).
 │    │
 │    └── 1.2 "Create New Client" Modal
 │         └── Name Input Form (Creates a new independent Root Client).
 │
 └── /[workspaceId]/admin/crm/[clientId]  (Client Detail Page)
      │
      ├── 1. Client Analytics Dashboard
      │    ├── Total Revenue.
      │    ├── Friction Index.
      │    ├── Input Quality Score.
      │    ├── Payment Rating.
      │    ├── On-time Rate.
      │    └── Client Revision Rate.
      │
      ├── 2. Projects Section
      │    ├── List of Projects associated with this client.
      │    └── "Create Project" Button.
      │
      ├── 3. Feedback Box
      │    ├── List of Feedback from the client (CLIENT type).
      │    └── List of Internal Feedback evaluating the client (INTERNAL type).
      │
      ├── 4. Task History
      │    └── List of ALL Tasks done for the client (including Tasks of their Sub-clients).
      │
      └── 5. Billing & Invoices
           ├── Current Deposit Balance status.
           ├── History of Invoices issued to this client.
           └── "Create Invoice" Button (Smart aggregation feature: Groups ALL unbilled tasks from Parent + Child companies).
```
