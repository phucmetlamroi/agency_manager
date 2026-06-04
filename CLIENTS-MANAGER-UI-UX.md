# CLIENTS MANAGER (CRM) — Tài liệu Chức năng · Thao tác · Nút bấm · Luồng · Thiết kế

> Module **Quản lý Khách hàng** của AgencyManager. Tài liệu này mô tả đầy đủ: chức năng, mọi nút bấm/thao tác, luồng hoạt động, mô hình dữ liệu, hệ thiết kế và **danh sách toàn bộ file UX/UI** của phần này.
> Cập nhật theo source tại nhánh `claude/cranky-austin`.

---

## 1. Tổng quan

ClientManager (đặt tên nội bộ là **CRM**) là nơi admin quản lý **Đối tác / Khách hàng (Partner)**, các **Brand/Client con (Subsidiary)** và các **Chỉ số hiệu suất** (doanh thu, số task, độ ma sát, trạng thái). Mỗi khách hàng liên kết tới **Task**, **Project**, **Invoice (hoá đơn)** và **Rating (đánh giá)**.

Đặc trưng chính:
- **Phân cấp 2 tầng**: Khách hàng gốc (root, `parentId = null`) → nhiều Brand con (subsidiary).
- **Gộp / Tách** khách hàng bằng **kéo–thả** (drag-merge) và nút tách.
- **Trang chi tiết** dạng analytics: KPI, biểu đồ phân bổ, ratings, danh sách task & hoá đơn.
- **Xuất hoá đơn** (Invoice) cho khách hàng kèm bản xem trước có thể chỉnh sửa + PDF.

---

## 2. Vị trí & Điều hướng

| Mục | Giá trị |
|---|---|
| **Tên menu** | "Clients Manager" |
| **Icon menu** | `Smile` (lucide) |
| **Quyền thấy menu** | `ADMIN`, `USER` (cấu hình tại `AppSidebar.tsx`) |
| **URL danh sách** | `/{workspaceId}/admin/crm` |
| **URL chi tiết** | `/{workspaceId}/admin/crm/{clientId}` |
| **Khung bao** | `AdminShell` (sidebar + topbar) qua `src/app/[workspaceId]/admin/layout.tsx` |

**Lưu ý quyền:** Các server action CRM chỉ kiểm tra **đăng nhập + phạm vi workspace/profile** (`getSession` → `sessionProfileId` → `getWorkspacePrisma`). **Không** có gate riêng theo vai trò (ADMIN/treasurer) ở tầng action — kiểm soát chủ yếu bằng scope workspace + ẩn/hiện menu.

---

## 3. Mô hình dữ liệu (Prisma `Client`)

```prisma
model Client {
  id             Int        @id @default(autoincrement())
  name           String
  parentId       Int?       // self-relation: null = gốc, có giá trị = brand con
  aiScore        Decimal    @default(0)
  frictionIndex  Decimal    @default(0)
  inputQuality   Int        @default(3)   // 1..5
  paymentRating  Int        @default(3)   // 1..5
  tier           ClientTier @default(standard) // DIAMOND/GOLD/SILVER/WARNING/standard
  depositBalance Decimal    @default(0)   // số dư ký quỹ (dùng khi xuất hoá đơn)
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt

  parent         Client?    @relation("ClientHierarchy", fields: [parentId], references: [id], onDelete: Cascade)
  subsidiaries   Client[]   @relation("ClientHierarchy")
  tasks          Task[]
  projects       Project[]
  invoices       Invoice[]
  portalUsers    User[]     @relation("ClientPortalUser") // tài khoản client portal (User.clientId)
  pricingRules   PricingRule[]
  workspaceId    String?    // scope multi-tenant theo workspace
  profileId      String?    // scope theo profile (team/agency)
}
```

**Quan hệ chính**
- `Client 1—N Client` (cây phân cấp 2 tầng qua `parentId`, xoá cha → cascade xoá con).
- `Client 1—N Task / Project / Invoice`.
- `Client N—1 Workspace` và `N—1 Profile` (đa-tenant).
- `Client 1—N User` (tài khoản client portal, qua `User.clientId` — FK tường minh).

---

## 4. Kiến trúc & Luồng tổng thể

```
/{workspaceId}/admin/crm  (Server page)
   └─ getClients(workspaceId)               → root clients + subsidiaries{tasks,projects} + tasks + projects
   └─ <CreateClientButton>                  (modal thêm khách)
   └─ <ClientList>  (client component)      → bảng + search + drag-merge + expand + CRUD

/{workspaceId}/admin/crm/[id]  (Server page)
   └─ client.findUnique(include subsidiaries{tasks}, tasks{rating}, invoices, projects)
   └─ ratings (globalPrisma.rating theo tài khoản client)
   └─ <CreateSubClientButton>  (chỉ khi là khách gốc)
   └─ <ClientAnalytics>  (client component)  → KPI + ratings + chart + tasks + <ClientInvoicesTable> + <InvoiceModal>
```

Mọi mutation đi qua **server actions** trong `src/actions/crm-actions.ts`, kết thúc bằng `revalidatePath('/{workspaceId}/admin/crm')` để làm mới UI.

---

## 5. TRANG DANH SÁCH — `/{workspaceId}/admin/crm`

### 5.1. Bố cục (`page.tsx`)
1. **Header**: ô icon `Building2` (indigo) + tiêu đề **"Quản lý Khách hàng"** + phụ đề *"Hệ thống quản lý Đối tác, Brand con và Chỉ số Hiệu suất."* + **badge đếm** `{N} Clients` (pill indigo).
2. **Card bảng** (`rounded-2xl bg-zinc-900 border-white/8`):
   - Card header: icon `Users` + **"Danh sách Khách hàng"** + nút **`+ Thêm Khách`** (`<CreateClientButton>`).
   - Thân: **`<ClientList>`**.

### 5.2. `ClientList` — bảng khách hàng (file lõi)
- **Thanh tìm kiếm**: input "Tìm khách hàng..." (icon `Search`), lọc realtime theo **tên khách + tên brand con**.
- **Banner gộp** (chỉ khi đang kéo): *"Kéo và thả vào một khách hàng chính khác để gộp…"* (nhấp nháy).
- **6 cột** (grid `2.2fr 0.8fr 0.6fr 0.7fr 0.8fr 60px`): **Client · Revenue · Tasks · Friction · Status · Actions**.

**Chỉ số tính trên mỗi dòng** (gộp task của khách + brand con):
| Cột | Cách tính |
|---|---|
| **Revenue** | `Σ task.jobPriceUSD` → hiển thị `$X` (USD, monospace) |
| **Tasks** | tổng số task (own + subsidiaries; task con được gắn tiền tố `[TênBrand]`) |
| **Friction** | `round(số task chưa "Hoàn tất" / tổng task × 100)%` — màu: **xanh ≤15%**, **amber 15–30%**, **đỏ >30%** |
| **Status** | `INACTIVE` (0 task) · `ACTIVE` (còn task chưa xong) · `PENDING` (tất cả đã "Hoàn tất") |

**Bảng NÚT / THAO TÁC trên mỗi dòng**
| Nút / Vùng | Icon | Handler | Tác dụng |
|---|---|---|---|
| Kéo (drag handle, chỉ khách gốc) | `GripVertical` | `onDragStart/Over/Drop` | Kéo dòng để **gộp** vào khách gốc khác → `mergeClientIntoParent` |
| Mở rộng | `ChevronRight` (xoay 90°) | `setIsExpanded` | Hiện task gần đây + danh sách brand con |
| Tên khách (click) | — | `onEdit(client)` | Mở modal đổi tên |
| Sửa tên | `Pencil` | `onEdit(client)` | Mở modal đổi tên |
| Chi tiết | `ExternalLink` | `Link → /admin/crm/{id}` | Sang trang chi tiết |
| Tách ra (**chỉ brand con**) | `Link2Off` | `handleUnmerge` → `unmergeClient` | Tách brand con thành khách độc lập (xác nhận cảnh báo) |
| Xoá | `Trash2` | `handleDelete` → `deleteClient` | Xoá khách hàng (xác nhận nguy hiểm) |

**Modal đổi tên** (Radix `Dialog`): tiêu đề "Đổi tên khách hàng" · field **"Tên mới"** (`Input`) · nút **Hủy** / **Lưu thay đổi** → `updateClient`. Validate: tên không được rỗng.

**Khối mở rộng (expand)**
- **"Recent Videos (Aggregated)"**: tối đa **5 task** gần đây (tên + badge trạng thái: *Hoàn tất* = xanh, còn lại = amber), dư thì *"…còn N video nữa"*.
- **"Brands / Subsidiaries"**: liệt kê các brand con (dòng `ClientItem` lồng, thụt lề trái, nền indigo nhạt, avatar nhỏ 28px, có nút **Tách ra** + **Xoá**, **không** kéo được).
- Rỗng → *"Trống"*.

**Tương tác kéo–thả (drag-merge)**: chỉ **khách gốc** kéo được & là đích thả. Thả A lên B → A thành brand con của B. Có chặn an toàn: không gộp vào chính nó, không gộp khi A/B đã là brand con. Hiệu ứng: dòng đang kéo mờ (opacity .4) + viền tím; đích thả nền/viền indigo.

---

## 6. TRANG CHI TIẾT — `/{workspaceId}/admin/crm/[id]`

### 6.1. Bố cục (`[id]/page.tsx`)
- **Header**: tiêu đề **"Chi tiết Hồ sơ Khách hàng"** + nút **`➕ Thêm Brand / Client con`** (`<CreateSubClientButton>`, **chỉ hiện khi khách là gốc**).
- Thân: **`<ClientAnalytics>`** (fetch: subsidiaries{tasks}, tasks{rating} (20), invoices (20), projects + ratings).

### 6.2. `ClientAnalytics` — dashboard chi tiết khách
1. **Hero banner**: tên khách (lớn) + **badge Tier** (`DIAMOND` cyan / `GOLD` vàng / `SILVER` xám / `WARNING` đỏ nhấp nháy) + badge ID + badge **số dư ký quỹ** (emerald) + nút **`Tạo Hóa đơn (Invoice)`** (icon `FileText`) → mở `InvoiceModal`.
2. **3 thẻ KPI**: **Tổng số Task** · **Điểm Trung Bình** (rating, sao) · **Dự án con** (số subsidiary).
3. **Ratings** (nếu có): danh sách feedback của khách — tên task, editor, nhận xét, điểm (ST/PH/GT), ngày.
4. **Biểu đồ phân bổ** (donut): phân bổ task theo brand con (6 màu) + chú thích; rỗng → empty state.
5. **Bảng task gần đây**: cột Task · Brand · Trạng thái · Giá (₫) — tối đa 8.
6. **Bảng hoá đơn**: `<ClientInvoicesTable>`.

**Style thẻ** (GlassCard): `bg-zinc-900/40 backdrop-blur-xl border-white/10 rounded-2xl` + gradient indigo/purple khi hover.

---

## 7. TẠO KHÁCH HÀNG

### 7.1. `CreateClientButton` (trang danh sách)
- **Nút trigger**: **`+ Thêm Khách`** (gradient tím→indigo).
- **Modal**: field **Tên khách hàng** (`Input`, bắt buộc) + **"Là con của (Optional)"** (`Select` chọn khách gốc) → nút **Hủy** / **Tạo mới** → `createClient({ name, parentId? })` → toast.

### 7.2. `CreateSubClientButton` (trang chi tiết, chỉ khách gốc)
- **Nút trigger**: **`➕ Thêm Brand / Client con`** (tím).
- **Modal**: field **Tên Brand / Dự án** (`Input`) → **Đóng** / **Xác nhận tạo** → `createClient({ name, parentId })` (gắn cha tự động) → reload.

---

## 8. HOÁ ĐƠN (liên kết khách hàng)

### 8.1. `InvoiceModal` — tạo hoá đơn (modal lớn, ~1400px, 2 cột)
- **Cột trái (cấu hình)**: chọn **task chưa xuất hoá đơn** (nhóm theo brand, checkbox) + **thêm hạng mục thủ công**; cấu hình **Thuế %**, **Trả trước $**, **Payment Link**, **Gộp theo Brand**, **Dùng Deposit** (nếu có ký quỹ); chọn **Hồ sơ thanh toán** (+ quản lý billing profile).
- **Cột phải (xem trước, chỉnh sửa trực tiếp)**: tên agency, tiêu đề, số hoá đơn, Bill To, địa chỉ, ngày phát hành/đến hạn, **bảng hạng mục** (sửa/xoá, tự tính thành tiền), **thông tin thanh toán** (ngân hàng/STK), **tổng cộng** (tạm tính, thuế, giảm trừ ký quỹ/trả trước, tổng phải trả).
- **Nút chính**: **`Xuất & Lưu`** → validate (đã chọn profile, có hạng mục) → `createInvoiceRecord` → gọi `/api/invoices/generate` (PDF) → tải file.

### 8.2. `ClientInvoicesTable` — lịch sử hoá đơn (nhúng trong ClientAnalytics)
- Cột: **Invoice # · Date · Amount · Status (VOID/PAID/SENT) · Actions**.
- Nút **Download** (`Download`) → tải PDF từ `/api/invoices/{id}/download`.
- Nút **Void** (`Ban`) → xác nhận → `voidInvoice` (hoàn task về *unbilled* + hoàn ký quỹ) → refresh.
- Rỗng → *"No invoices found."*

---

## 9. `ClientSelector` (dùng ở nơi khác)
Dropdown 2 tầng **chọn Partner → chọn Brand con** — dùng khi gắn khách hàng vào task (ngoài trang CRM). Tải partner qua `getClients`, đổi partner → nạp subsidiaries; trả về id khách được chọn qua `onSelect`.

---

## 10. Server Actions (`src/actions/crm-actions.ts`)

| Hàm | Tham số | Tác dụng | Quyền |
|---|---|---|---|
| `getClients` | `(workspaceId)` | Lấy khách **gốc** (`parentId=null`) + include subsidiaries{projects,tasks}, projects, tasks; sort `createdAt desc` | session + scope workspace/profile |
| `createClient` | `({ name, parentId? }, workspaceId)` | Tạo khách (gốc nếu không có parentId) | nt |
| `updateClient` | `(id, { name }, workspaceId)` | Đổi tên khách | nt |
| `deleteClient` | `(id, workspaceId)` | Xoá khách (cascade task/project/invoice/brand con) | nt |
| `mergeClientIntoParent` | `(childId, parentId, workspaceId)` | Gộp khách gốc A thành brand con của B (chặn nếu đã là con) | nt |
| `unmergeClient` | `(clientId, workspaceId)` | Tách brand con thành khách gốc (`parentId=null`) | nt |
| `createProject` | `({ name, clientId, code? }, workspaceId)` | Tạo project gắn khách | nt |
| `createFeedback` | *(stub)* | Đã gỡ (Feedback bị đơn giản hoá khỏi workflow) | — |

*(Hoá đơn dùng `src/actions/invoice-actions.ts`: `getUnbilledTasks`, `getBillingProfiles`, `createBillingProfile`, `createInvoiceRecord`, `voidInvoice` + API `/api/invoices/generate`, `/api/invoices/{id}/download`. Client portal dùng `src/actions/client-portal-actions.ts`.)*

---

## 11. Luồng thao tác (step-by-step)

**Tạo khách**: `+ Thêm Khách` → nhập tên (+ cha tuỳ chọn) → `createClient` → `revalidatePath` → bảng cập nhật + toast.
**Sửa tên**: click tên/`Pencil` → modal → `updateClient` → cập nhật.
**Xoá**: `Trash2` → xác nhận nguy hiểm → `deleteClient` (cascade) → cập nhật; lỗi nếu ràng buộc → toast đỏ.
**Xem chi tiết**: `ExternalLink` → `/admin/crm/{id}` → `ClientAnalytics`.
**Gộp**: kéo khách gốc A thả lên khách gốc B → `mergeClientIntoParent` → A thành brand con của B.
**Tách**: ở brand con bấm `Link2Off` → xác nhận → `unmergeClient` → thành khách gốc.
**Thêm brand con**: trang chi tiết khách gốc → `➕ Thêm Brand` → `createClient(parentId)`.
**Xuất hoá đơn**: chi tiết → `Tạo Hóa đơn` → chọn task/cấu hình → `Xuất & Lưu` → lưu DB + PDF.

---

## 12. Hệ thiết kế (hiện trạng)

> ⚠️ **Lưu ý nhất quán**: Phần CRM hiện dùng **tông INDIGO/ZINC cũ** (`#6366f1`, `#a5b4fc`, `bg-zinc-900`, status emerald/amber/red) **khác** với tông **TÍM-MONO** (`#8B5CF6`/`#D8B4FE`, thẻ `#0A0A0A` viền tím, `rounded-[26px]`) đã áp cho Dashboard/Payroll. Nếu muốn đồng bộ, đây là phần nên redesign tiếp.

| Thành phần | Style hiện tại |
|---|---|
| Nền trang/card | `bg-zinc-900`, viền `white/8`, bo `rounded-2xl` |
| Accent | Indigo `#6366f1` / `#a5b4fc`; nút tạo gradient tím→indigo |
| Avatar | 8 gradient deterministic theo `id % 8` |
| Status pill | ACTIVE = emerald · PENDING = amber · INACTIVE = zinc (có chấm) |
| Friction | xanh ≤15% · amber 15–30% · đỏ >30% (monospace) |
| Tier (chi tiết) | DIAMOND cyan · GOLD vàng · SILVER xám · WARNING đỏ nhấp nháy |
| Số tiền | Doanh thu list = **USD `$`**; hoá đơn/ký quỹ = **₫** |
| Style code | Phần lớn **inline-style** (ClientList), shadcn UI cho Dialog/Input/Button |

---

## 13. DANH SÁCH TOÀN BỘ FILE UX/UI

### Trang (routes)
| # | File | Loại | Vai trò |
|---|---|---|---|
| 1 | `src/app/[workspaceId]/admin/crm/page.tsx` | Server | Trang danh sách khách hàng |
| 2 | `src/app/[workspaceId]/admin/crm/[id]/page.tsx` | Server | Trang chi tiết khách hàng |

### Component CRM (`src/components/crm/`)
| # | File | Loại | Vai trò |
|---|---|---|---|
| 3 | `src/components/crm/ClientList.tsx` | client | **Bảng khách hàng** (search, drag-merge, expand, sửa/xoá/tách) — file lõi |
| 4 | `src/components/crm/CreateClientButton.tsx` | client | Nút + modal **thêm khách** (gốc/con) |
| 5 | `src/components/crm/CreateSubClientButton.tsx` | client | Nút + modal **thêm brand con** (trang chi tiết) |
| 6 | `src/components/crm/ClientAnalytics.tsx` | client | **Dashboard chi tiết khách** (KPI, ratings, chart, tasks, invoices) |
| 7 | `src/components/crm/ClientSelector.tsx` | client | Dropdown chọn khách (partner→brand) dùng khi gắn vào task |

### Component Hoá đơn liên quan (`src/components/invoice/`)
| # | File | Loại | Vai trò |
|---|---|---|---|
| 8 | `src/components/invoice/InvoiceModal.tsx` | client | Modal tạo hoá đơn + xem trước + PDF |
| 9 | `src/components/invoice/ClientInvoicesTable.tsx` | client | Bảng lịch sử hoá đơn (download/void) |
| 10 | `src/components/invoice/BillingProfileManager.tsx` *(nếu có)* | client | Quản lý hồ sơ thanh toán (mở từ InvoiceModal) |

### Khung dùng chung (shared shell)
| # | File | Vai trò |
|---|---|---|
| 11 | `src/components/layout/AdminShell.tsx` | Khung admin (sidebar + nội dung) |
| 12 | `src/components/layout/AppSidebar.tsx` | Sidebar + mục menu "Clients Manager" |
| 13 | `src/app/[workspaceId]/admin/layout.tsx` | Layout admin (auth) |

### Logic / dữ liệu liên quan (không phải UI nhưng cần để hiểu luồng)
| File | Vai trò |
|---|---|
| `src/actions/crm-actions.ts` | CRUD khách + gộp/tách + project |
| `src/actions/invoice-actions.ts` | Hoá đơn (unbilled, billing profile, create, void) |
| `src/actions/client-portal-actions.ts` | Truy cập dữ liệu cho tài khoản client (portal) |
| `src/lib/client-hierarchy.ts` | Tiện ích format "Cha → Con" |
| `prisma/schema.prisma` (model `Client`, `Invoice`, `Project`, enum `ClientTier`) | Mô hình dữ liệu |

> **"Toàn bộ file UX/UI" của phần ClientManager = mục #1–#10** (2 trang + 5 component CRM + 3 component invoice). #11–#13 là khung dùng chung toàn app.

---

## 14. Điểm cần lưu ý / Gợi ý cải tiến
- **Đa-tenant**: khách thuộc `workspaceId` + `profileId`; mọi query tự scope qua `getWorkspacePrisma`.
- **Phân cấp chỉ 2 tầng** (gốc → con); thả 1 brand con không cho phép làm cha.
- **Doanh thu list tính bằng USD** (`jobPriceUSD`) trong khi hoá đơn/ký quỹ dùng ₫ — cân nhắc thống nhất đơn vị/nhãn.
- **Chưa có gate vai trò** ở action (chỉ scope workspace) — cân nhắc thêm kiểm tra ADMIN nếu cần.
- **Thiết kế lệch tông** so với Dashboard/Payroll (indigo vs tím-mono) — ứng viên redesign tiếp theo để đồng bộ.
- **Phần lớn ClientList dùng inline-style** — nếu redesign nên chuyển sang token/Tailwind nhất quán.
