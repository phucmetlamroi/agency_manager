# SITEMAP: Luồng Tương Tác Task — AgencyManager

> Tài liệu mô tả chi tiết mọi tương tác khi người dùng thao tác với Task trong hệ thống.
> Phiên bản: 2.0 | Cập nhật: 2026-05-04

---

## Mục lục

1. [Tổng quan kiến trúc Component](#1-tổng-quan-kiến-trúc-component)
2. [Vòng đời trạng thái Task (FSM)](#2-vòng-đời-trạng-thái-task-fsm)
3. [Bảng Task — Desktop](#3-bảng-task--desktop)
4. [Bảng Task — Mobile](#4-bảng-task--mobile)
5. [Task Detail Modal — Toàn bộ Sections](#5-task-detail-modal--toàn-bộ-sections)
6. [Status Cell — Tương tác chi tiết](#6-status-cell--tương-tác-chi-tiết)
7. [Assignee Cell — Tương tác chi tiết](#7-assignee-cell--tương-tác-chi-tiết)
8. [Tab Workflow — Drag & Drop](#8-tab-workflow--drag--drop)
9. [Phiên chợ Task (Marketplace)](#9-phiên-chợ-task-marketplace)
10. [Bulk Operations (Thao tác hàng loạt)](#10-bulk-operations-thao-tác-hàng-loạt)
11. [Admin vs Non-Admin — Bảng so sánh](#11-admin-vs-non-admin--bảng-so-sánh)
12. [Email tự động kích hoạt](#12-email-tự-động-kích-hoạt)
13. [Concurrency & Optimistic Locking](#13-concurrency--optimistic-locking)

---

## 1. Tổng quan kiến trúc Component

```
TaskTable (dispatcher)
├── isMobile === true
│   └── MobileTaskView
│       ├── MobileTaskCard[]
│       └── TaskDrawer (vaul bottom sheet)
│
└── isMobile === false
    └── NewDesktopTaskTable
        ├── TaskWorkflowTabs (admin dashboard)
        │   ├── Tab: Nhận Task | Đang làm | Revise/Review | Hoàn tất
        │   ├── TasksDataTable (TanStack React Table)
        │   │   ├── TitleCell
        │   │   ├── StatusCell
        │   │   ├── AssigneeCell
        │   │   ├── DeadlineCell
        │   │   └── ActionsDropdown
        │   └── Drag-and-Drop giữa các tab (admin)
        │
        └── TaskDetailModal (Radix Dialog)
            ├── Section 1: Thành Phẩm (Delivery)
            ├── Section 2: Resources (RAW/BROLL/Submission)
            ├── Section 3: References
            ├── Section 4: Deadline & Finance
            ├── Section 5: Ghi chú Tiếng Việt
            ├── Section 6: Notes (English)
            ├── Section 7: Tags & Duration
            └── Overlay: Manager Review Checklist
```

---

## 2. Vòng đời trạng thái Task (FSM)

### 2.1. Danh sách trạng thái

| Trạng thái | Màu dot | Ý nghĩa |
|---|---|---|
| `Đang đợi giao` | Tím (purple-500) | Task mới tạo, chưa có người nhận |
| `Nhận task` | Xanh dương (blue-500) | Đã giao cho nhân viên, chưa bắt đầu |
| `Đang thực hiện` | Vàng (yellow-500) | Nhân viên đang làm |
| `Review` | Cam (orange-500) | Nhân viên đã nộp, chờ admin duyệt |
| `Revision` | Đỏ (red-500) | Admin yêu cầu sửa lại |
| `Sửa frame` | Hồng (pink-500) | Sửa lỗi cụ thể về frame |
| `Tạm ngưng` | Xám (gray-500) | Tạm dừng công việc |
| `Hoàn tất` | Xanh lá (emerald-500) | Đã hoàn thành, tính lương |
| `Đã hủy` | — | Trạng thái chết, task bị hủy bỏ |

### 2.2. Sơ đồ chuyển trạng thái

```
                    ┌─────────────────────────────────────┐
                    │            Đang đợi giao            │
                    │         (Task Pool / Chợ)           │
                    └──────┬──────────────────────────────┘
                           │ assign / claim
                           ▼
                    ┌─────────────────┐
               ┌────│    Nhận task    │────┐
               │    └────────┬────────┘    │
               │             │ start       │ pause
               │             ▼             ▼
               │    ┌─────────────────┐  ┌──────────┐
               │    │ Đang thực hiện  │◄─│ Tạm ngưng│
               │    └───┬────┬────┬───┘  └──────────┘
               │        │    │    │          ▲
               │ submit │    │    │ pause    │ resume
               │        ▼    │    └──────────┘
               │   ┌────────┐│
               │   │ Review ││ request_fix
               │   └──┬──┬──┘│
               │      │  │   ▼
               │reject│  │ ┌──────────┐
               │      │  │ │ Sửa frame│
               │      ▼  │ └────┬─────┘
               │ ┌────────┐     │ submit
               │ │Revision│◄────┘
               │ └───┬────┘
               │     │ back_to_work → Đang thực hiện
               │     │
               │     ▼
               │   finish (từ Review/Đang thực hiện/Sửa frame)
               │     ▼
               │ ┌──────────┐
               └─│ Hoàn tất │
                 └──────────┘
```

### 2.3. Side-effects khi chuyển trạng thái

| Chuyển sang | Hành động phụ |
|---|---|
| `Tạm ngưng` | Deadline bị xóa (set null) |
| `Revision` | Deadline bị xóa (set null) + gửi email feedback |
| `Đang thực hiện` (từ `Nhận task`) | Gửi email thông báo admin |
| `Review` | Gửi email xác nhận nộp bài |
| `Hoàn tất` | Gửi email chúc mừng kèm số tiền lương |
| `Đang thực hiện` (từ `Revision`, admin "Đã FB") | Gửi email thông báo đã phản hồi |

---

## 3. Bảng Task — Desktop

### 3.1. Các cột hiển thị

| Cột | Nội dung | Sortable | Ghi chú |
|---|---|---|---|
| ☑ + ⠿ | Checkbox chọn + Grip kéo | Không | Grip chỉ hiện cho Admin |
| **Task** (Title) | Tên task + client + tags + duration + status dot | Có | Xem chi tiết TitleCell bên dưới |
| **Status** | Badge (nhân viên) / Dropdown (admin) | Không | Xem Section 6 |
| **Assignee** | Avatar + tên / Select dropdown | Không | Xem Section 7 |
| **Type** | Badge: SHORT / LONG / TRIAL / TASK | Không | Màu gradient theo loại |
| **Deadline** | Ngày giờ vi-VN | Có | Đổi màu theo mức cảnh báo |
| **Amount** | Số tiền VND (font-mono, emerald) | Không | Chỉ admin thấy |
| **Actions** (⋯) | Dropdown menu | Không | Xem bên dưới |

### 3.2. Title Cell — Chi tiết hiển thị

Khi nhìn vào cột Title, người dùng sẽ thấy:

- **Nhãn Client** (nếu có): `[ParentName / ClientName]` — 10px, uppercase, text-blue-400
- **Tên task** — font-bold, line-clamp-2, hover chuyển text-blue-400
- **Indicators phía dưới**:
  - `OVERDUE` (text-red-500) — khi deadline đã qua + task chưa Hoàn tất
  - `RUSH` (text-orange-500) — khi đã qua 90%+ thời gian
- **Tag pills** (indigo) + **Duration pill** (amber) — hiện inline
- **Visual indicator viền trái**:
  - Amber glow: task nhận từ Marketplace (`claimSource === 'MARKET'`)
  - Blue glow: task được admin giao (`claimSource === 'ADMIN'`)
- **Khóa** (non-admin + `Nhận task`): Icon khóa, opacity 50%, click bị chặn

### 3.3. Khi click vào Title

| Điều kiện | Hành vi |
|---|---|
| Non-admin + task ở `Nhận task` | **Bị chặn**, hiện toast: "Vui lòng bấm 'Bắt đầu' để mở khóa task!" |
| Tất cả trường hợp khác | **Mở TaskDetailModal** |

### 3.4. Dropdown Actions (⋯)

| Mục | Điều kiện | Hành động |
|---|---|---|
| Copy Task ID | Luôn hiện | Copy UUID vào clipboard |
| Edit Details | Luôn hiện | Mở TaskDetailModal |
| Hoàn task | `claimSource === 'MARKET'` + trong 10 phút + đúng người | `returnTask()` — trả task về chợ |
| Delete | Admin only | Confirm dialog → `deleteTask()` |

### 3.5. Deadline Cell — Mã màu cảnh báo

| Điều kiện | Hiển thị |
|---|---|
| Không có deadline | `"No Limit"` (text-zinc-500) |
| Quá hạn | Text đỏ nhấp nháy (animate-pulse) |
| Còn < 24 giờ | Text đỏ |
| Còn < 48 giờ | Text vàng |
| Còn nhiều | Text zinc bình thường |

---

## 4. Bảng Task — Mobile

### 4.1. Giao diện MobileTaskView

- **Tab filter** (sticky trên cùng):
  - `DOING` — Đang thực hiện
  - `ASSIGNED` — Nhận task
  - `Review` — Review, Revision, Sửa frame
  - `ALL` — Tất cả trạng thái
- **Tab mặc định**: `DOING`
- **FAB button** (+) cố định góc phải dưới:
  - Admin: Cuộn lên đầu trang
  - Non-admin: Toast thông báo

### 4.2. MobileTaskCard — Thông tin hiển thị

| Thông tin | Vị trí | Ghi chú |
|---|---|---|
| Loại task (TASK/SHORT/LONG) | Badge trên cùng | Gradient theo type |
| Tên task | Tiêu đề chính (line-clamp-2) | font-bold |
| Status dot + tên | Bên phải | Revision = red-400 bold |
| Deadline | Định dạng dd/mm hh:mm | Đỏ nếu quá hạn |
| VND | Số tiền emerald | Chỉ admin |
| Username | Tên người nhận | Non-admin |

### 4.3. Click vào MobileTaskCard

- Cùng logic chặn: non-admin + `Nhận task` → toast cảnh báo
- Mở **TaskDrawer** (vaul bottom sheet, 96% chiều cao)

### 4.4. TaskDrawer — Nội dung

| Section | Nội dung |
|---|---|
| Header | Tiêu đề + badge Status + Type + Client label |
| Deadline info | Grid hiển thị ngày giờ |
| Assignee | Avatar initial + username |
| Instructions | Admin: xem notes_vi / Non-admin: xem notes_en (fallback notes_vi) |
| Product Link | Nút "Open Product Link" (nếu có) |
| Footer | "Close" + "Edit Task" (admin only) |

---

## 5. Task Detail Modal — Toàn bộ Sections

> Dialog Radix, max-width 2xl, glassmorphism dark theme.

### 5.0. Header (Sticky)

| Phần tử | Mô tả |
|---|---|
| Label | "Task Details & Actions" — icon Layers, màu indigo-400 |
| Tiêu đề | Tên task (h2, font-black, line-clamp-2) |
| Bulk Mode Banner | Amber: "BULK MODE: Chỉnh sửa X tasks" (khi chọn nhiều) |
| Nút phải | Admin: **"Edit All"** / Non-admin: **"Submit / Note"** |
| Khi đang edit | Nút **"Huỷ"** thay thế |

---

### 5.1. Section: Thành Phẩm (Delivery)

**Mục đích**: Nơi nhân viên nộp link sản phẩm hoàn thành.

#### Trạng thái 1: Chưa có productLink (Non-admin hoặc đang edit)

```
┌──────────────────────────────────────────────┐
│  📎 Dán link sản phẩm (Google Drive, ...)    │
│  [_____________________________________]     │
│                                              │
│  [✅ Xác nhận Nộp Bài]                       │
└──────────────────────────────────────────────┘
```

- Click **"Xác nhận Nộp Bài"**: Lưu link → tự động chuyển trạng thái sang `Review`
- Gửi email thông báo admin

#### Trạng thái 2: Đã có productLink

```
┌──────────────────────────────────────────────┐
│  [🔗 Mở Link Sản Phẩm →]         [✏️ Edit]  │
└──────────────────────────────────────────────┘
```

- Click link: Mở tab mới
- Nút edit (hover, góc phải): Bật lại chế độ chỉnh sửa link

#### Trạng thái 3: Admin, chưa có link

- Hiện placeholder: "Chưa có link thành phẩm."

---

### 5.2. Section: Resources (Tài nguyên)

**Mục đích**: Quản lý link RAW source, B-Roll, project mẫu, folder nộp file.

#### Admin Edit Mode

| Field | Placeholder | Icon/Màu |
|---|---|---|
| Link RAW Source | "Link RAW Source..." | — |
| Link B-Roll | "Link B-Roll..." | — |
| Link Project Mẫu | "Link Project Mẫu..." | Viền vàng |
| Link Folder Nộp File | "Link Folder Nộp File..." | Viền xanh dương |

+ Nút toggle **"Frame.io"** bên cạnh Folder Nộp File

#### View Mode

```
┌──────────────────────────────────────────────┐
│  📁 RAW Assets                    [Open →]   │
│  🎬 B-Roll Assets                 [Open →]   │
│  📑 Project Mẫu                   [Open →]   │
│  📂 Folder Nộp File  [Frame.io] [Checklist]  │
└──────────────────────────────────────────────┘
```

- **Frame.io Panel** (mở rộng khi click):
  - Tài khoản: hiển thị/edit + nút Copy
  - Mật khẩu: hiển thị/edit + nút Copy
  - Cảnh báo: "Tài khoản dành cho trường hợp bị out khỏi Frame team"

- **Checklist** (admin only): Mở `ManagerReviewChecklist` overlay

#### Non-Admin View Mode

- Chỉ đọc các link (nếu có)
- Frame.io: chỉ xem + copy, không edit
- Không thấy nút Checklist

---

### 5.3. Section: References (Tài liệu tham khảo)

#### Admin Edit Mode

| Field | Placeholder |
|---|---|
| Reference link | "Reference link..." |
| Script / Transcript | "Script / Transcript / Kịch bản link..." (viền teal) |

#### View Mode

```
┌──────────────────────────────────────────────┐
│  🖥️ View Reference                [Open →]   │
│  📄 Xem Script / Kịch Bản         [Open →]   │
└──────────────────────────────────────────────┘
```

- Không có: hiện "Không có reference"

---

### 5.4. Section: Deadline & Finance

Grid 2 cột.

#### Cột trái: Deadline

| Trạng thái | Hiển thị |
|---|---|
| Có deadline, chưa quá hạn | Ngày giờ vi-VN |
| Có deadline, quá hạn + chưa Hoàn tất | Ngày giờ + nhãn đỏ `"— QUÁ HẠN"` nhấp nháy |
| Không có deadline | "No Limit" |
| Admin edit mode | Input `datetime-local` |

#### Cột phải: Finance Info (Admin only)

```
┌──────────────────────────────┐
│  💰 Finance Info             │
│                              │
│  Client ($):  $1,200.00      │  ← emerald, font-mono
│  Staff (VND): 5,000,000đ    │  ← amber, font-mono
│                              │
│  ⚠️ Khóa nếu payroll = PAID  │
└──────────────────────────────┘
```

- Non-admin: **Không thấy section này**
- Bị khóa khi kỳ lương đã chốt (PAID payroll)

---

### 5.5. Section: Ghi chú (Tiếng Việt)

| Chế độ | Hiển thị |
|---|---|
| Admin edit | TiptapEditor (rich text, 250px) |
| View mode | HTML sanitized, prose-invert |
| Nút Copy | Copy nội dung text thuần → clipboard + toast |

- Non-admin: Chỉ đọc

---

### 5.6. Section: Notes (English)

| Chế độ | Hiển thị |
|---|---|
| Admin edit | TiptapEditor (viền indigo) |
| Non-admin edit | TiptapEditor (cho phép nhập bản dịch tiếng Anh) |
| View mode | HTML prose, hoặc "Chưa có bản dịch Tiếng Anh. Bấm Edit để nhập thủ công." |

---

### 5.7. Section: Tags & Duration

```
┌──────────────────────────────────────────────┐
│  🏷️ Tags & Duration                          │
│  (Chuột phải = Tag Library · Ctrl+Kéo =     │
│   Chọn Tag)                                  │
│                                              │
│  ⏱ Duration: [___________]  (admin edit)     │
│                                              │
│  [Tag1 ×] [Tag2 ×] [Tag3 ×]                 │
│  "Chuột phải để tạo Tag mới"                │
└──────────────────────────────────────────────┘
```

**Cử chỉ Tag (admin only)**:
- **Chuột phải** trong tag zone → Mở `TagLibraryPopup` tại vị trí chuột
- **Ctrl + Kéo** (kéo > 4px) → Mở `TagRadialMenu` tại điểm bắt đầu

**DurationInput**: Nhập thời lượng video (admin edit hoặc khi đã có duration)

**TagPills**: Hiển thị tag đã gán. Admin edit mode: nút X xóa từng tag.

---

### 5.8. Footer Modal

- Chỉ hiện khi đang edit (`isEditing === true`)
- Nút **"Lưu thay đổi"** — gradient indigo → purple, toàn chiều rộng
- Gọi `updateTaskDetails()` hoặc `bulkUpdateTaskDetails()` (bulk mode)

---

### 5.9. Overlay: Manager Review Checklist

- Kích hoạt: Admin click nút **"Checklist"** trong Resources view mode
- Component `ManagerReviewChecklist` phủ lên modal
- Khi hoàn thành: Đóng checklist → đóng modal → reload trang

---

## 6. Status Cell — Tương tác chi tiết

### 6.1. Non-Admin (Nhân viên)

| Trạng thái hiện tại | Hiển thị | Click |
|---|---|---|
| `Nhận task` | Nút vàng **"▶ Bắt đầu"** | `updateTaskStatus(id, 'Đang thực hiện')` |
| `Đang thực hiện` | Badge + hiệu ứng ping vàng + "Working..." | Không click được |
| Các trạng thái khác | Badge đọc-chỉ có màu theo status | Không click được |

### 6.2. Admin

- **Dropdown Select** với toàn bộ trạng thái:
  - Đang đợi giao, Nhận task, Đang thực hiện, Revision, Sửa frame, Tạm ngưng, Hoàn tất

- **Khi chọn `Revision`**: Không gọi API ngay → mở Dialog phân loại:

```
┌──────────────────────────────────────────────┐
│  📋 Phân loại Revision                       │
│                                              │
│  ○ 👤 Client — Revision do yêu cầu client   │
│  ○ 🏢 Internal — Revision nội bộ            │
│                                              │
│  Ghi chú (Optional):                         │
│  [Chi tiết lỗi...                     ]      │
│                                              │
│  [Cancel]              [Submit Revision]      │
└──────────────────────────────────────────────┘
```

- **Khi task ở `Revision`**: Hiện thêm nút ✔ xanh **"Mark as Feedbacked (Resume)"**
  → Chuyển sang `Đang thực hiện` + gửi email thông báo nhân viên

---

## 7. Assignee Cell — Tương tác chi tiết

### 7.1. Non-Admin

- Chỉ đọc: Avatar (6x6) + username
- **Rank dot cảnh báo**:
  - Rank C → Dot vàng trên avatar
  - Rank D → Dot đỏ trên avatar

### 7.2. Admin

- **Select dropdown** (180px):
  - `"⛔ Thu hồi về System"` → Unassign + trạng thái → `Đang đợi giao`
  - `"-- Hủy giao (Unassign User) --"` → Tương tự
  - **Team members** (lọc bỏ CLIENT, LOCKED): Avatar + username + rank dot

- **Chặn giao cho rank D**: Error toast "Không thể giao Task: Nhân sự đang bị Phạt thẻ đỏ (Rank D)."

- **Khi đang chọn nhiều task (bulk)**:

```
┌──────────────────────────────────────────────┐
│  ⚡ Bulk Assignment                          │
│                                              │
│  Bạn đang chọn X tasks. Bạn có muốn giao    │
│  TẤT CẢ tasks này cho người được chọn không? │
│                                              │
│  [Chỉ giao task này]  [Giao cho cả X tasks] │
└──────────────────────────────────────────────┘
```

- **Side effect**: Giao task → email `"[New Task] {title}"` gửi nhân viên

---

## 8. Tab Workflow — Drag & Drop

### 8.1. Cấu trúc 4 Tab

| Tab | Label | Lọc trạng thái | Target khi drop |
|---|---|---|---|
| ASSIGNED | Nhận Task | Nhận task, Đang đợi giao, Tạm ngưng (có assignee) | `Nhận task` |
| IN_PROGRESS | Đang làm | Đang thực hiện | `Đang thực hiện` |
| REVISION | Revise / Review | Revision, Sửa frame, Review | `Revision` |
| COMPLETED | Hoàn tất | Hoàn tất | `Hoàn tất` |

**Tab mặc định**: `IN_PROGRESS` (Đang làm)

### 8.2. Drag & Drop (Admin only)

1. Mỗi row có icon **⠿ GripVertical** (chỉ admin)
2. Bắt đầu kéo: Row được "nhấc lên"
3. Kéo vào tab khác: Tab highlight (ring + scale-110 + dot animate-ping)
4. Hint text xuất hiện: `"⬆ Drag to a tab above to change status"`
5. Thả vào tab:
   - **Drop đơn**: `updateTaskStatus(id, targetStatus)`
   - **Drop nhiều** (bulk select): `bulkUpdateStatus(ids[], targetStatus)`
6. Toast xác nhận: `"X tasks → [Tab Label]"`

### 8.3. Bulk Action Bar

Khi chọn nhiều task bằng checkbox:

```
┌──────────────────────────────────────────────┐
│  X tasks selected - drag to change status    │
│                                  [🗑 Delete] │
└──────────────────────────────────────────────┘
```

- Nút **Delete** (admin only) → confirm dialog → `bulkDeleteTasks(ids[])`

---

## 9. Phiên chợ Task (Marketplace)

### 9.1. Điều kiện hiển thị task trong chợ

- `assigneeId === null` (chưa có người nhận)
- `isArchived === false`
- Giới hạn 50 tasks, sắp xếp `createdAt DESC`

### 9.2. Trạng thái phiên chợ

| Trạng thái | Hiển thị |
|---|---|
| Đang mở (Live) | Badge xanh "Live" + grid task cards |
| Đã đóng | Badge đỏ "Đã đóng" + "Admin chưa mở phiên chợ. Vui lòng chờ admin mở nhé!" |
| Trống | "Chợ đang trống! Tất cả task đã được nhận." |

### 9.3. MarketTaskCard — Thông tin hiển thị

| Field | Mô tả |
|---|---|
| Title | Tên task (font-bold, line-clamp-2) |
| Type | Badge gradient: SHORT (sky), LONG (violet), TRIAL (amber), TASK (zinc) |
| Client | "ParentName / ClientName" |
| Deadline | Ngày vi-VN + mã màu cảnh báo |
| VND | Số tiền emerald |
| Tags | Pills indigo nhỏ |
| Duration | Pill amber + icon Timer |
| Footer | "Kéo để nhận" / "Đang kéo..." (overlay) |

### 9.4. Luồng Nhận Task (Claim Flow)

```
1. Mở Marketplace panel (floating, 62vw, glassmorphism amber)
      ↓ (auto-refresh 10s)
2. Kéo MarketTaskCard ra khỏi panel (threshold > 8px)
      ↓
3. FullScreenDropZone xuất hiện (z-9997)
   ├── Backdrop gradient indigo mờ
   ├── Viền glow nhấp nháy
   ├── Scan-line animation 4 cạnh
   └── Banner: "Thả ra để nhận task" + "Nhả chuột ở bất kỳ đâu · Nhấn Esc để hủy"
      ↓
4. Thả ở bất kỳ đâu
      ↓
5. claimTask(taskId, workspaceId)
   ├── assigneeId = userId
   ├── status = 'Nhận task'
   ├── claimSource = 'MARKET'
   ├── claimedAt = now()
   └── Optimistic locking (version check)
      ↓
6. Kết quả:
   ├── Card biến mất (optimistic UI)
   ├── Toast: "Task đã được nhận thành công!"
   └── Nếu còn 0 task → đóng marketplace (500ms delay)
```

### 9.5. Hoàn trả task (Return)

| Điều kiện | Chi tiết |
|---|---|
| `claimSource` | Phải là `'MARKET'` |
| Thời gian | Trong 10 phút kể từ `claimedAt` |
| Người thực hiện | Phải đúng người đã nhận |
| Action | `returnTask(taskId)` → reset: assigneeId=null, status='Đang đợi giao' |

### 9.6. Admin: Toggle phiên chợ

- `toggleMarketplace(workspaceId)` — chỉ role ADMIN hoặc AGENCY_ADMIN
- Bật/tắt hiển thị phiên chợ cho nhân viên

---

## 10. Bulk Operations (Thao tác hàng loạt)

### 10.1. Cách chọn nhiều task

- Click checkbox trên từng row
- Click checkbox header → chọn tất cả trang hiện tại

### 10.2. Tổng hợp các Bulk Operation

| Operation | Trigger | Quyền | Server Action |
|---|---|---|---|
| **Bulk Status** | Kéo nhiều row vào tab | Admin | `bulkUpdateStatus(ids[], status)` |
| **Bulk Assign** | Đổi assignee khi chọn nhiều | Admin | `bulkAssignTasks(ids[], assigneeId)` |
| **Bulk Delete** | Nút Delete trong action bar | Admin | `bulkDeleteTasks(ids[])` |
| **Bulk Update Details** | Edit modal khi bulk mode | Admin | `bulkUpdateTaskDetails(ids[], data)` |

### 10.3. Bulk Update Details — Chi tiết

Khi mở TaskDetailModal trong bulk mode:

- Banner amber: "BULK MODE: Chỉnh sửa X tasks"
- Mỗi field có checkbox **BulkToggle**:
  - `GHI ĐÈ` (amber, checked) — field này sẽ được cập nhật
  - `GIỮ` (zinc, unchecked) — field này giữ nguyên giá trị cũ
- Nếu không bật field nào → toast warning: "Vui lòng bật ít nhất 1 trường để cập nhật hàng loạt!"
- Fields có thể bulk update: resources, references, notes VI, notes EN, productLink, deadline, jobPriceUSD, value, collectFilesLink

### 10.4. Batch Create Tasks

- `createBatchTasks(data, workspaceId)` — Admin only
- Tạo nhiều task cùng lúc: list titles + finance tự tính (profitVND = jobPriceUSD x exchangeRate - wageVND)
- Gán tagIds cho từng task trong transaction

---

## 11. Admin vs Non-Admin — Bảng so sánh

| Tính năng | Admin | Non-Admin |
|---|---|---|
| Mở modal khi task ở `Nhận task` | Mở tự do | Bị chặn + toast cảnh báo |
| Nút header modal | "Edit All" | "Submit / Note" |
| Edit Resources | Toàn bộ fields | Không |
| Edit References | Toàn bộ fields | Không |
| Edit Deadline | Có | Không |
| Edit Finance (USD/VND) | Có | Không |
| Edit Notes VI | TiptapEditor | Chỉ đọc |
| Edit Notes EN | TiptapEditor | TiptapEditor (nhập bản dịch) |
| Edit Frame.io credentials | Có | Chỉ đọc + copy |
| Xem Finance section | Có | Không hiển thị |
| Tag gestures (chuột phải, Ctrl+kéo) | Có | Không |
| DurationInput | Edit mode | Chỉ xem |
| Nộp bài (productLink) | Chỉnh link | Submit + auto chuyển Review |
| Checklist | ManagerReviewChecklist | Không |
| Status cell | Dropdown toàn bộ status + Revision dialog | Nút "Bắt đầu" hoặc badge |
| Assignee cell | Select dropdown + bulk assign | Avatar chỉ đọc |
| Delete task | Có | Không |
| Bulk delete | Có | Không |
| Drag-and-drop tab | Có (GripVertical) | Không |
| Amount column | Hiển thị | Ẩn |
| Revision feedback dialog | Phân loại CLIENT/INTERNAL | Không |

---

## 12. Email tự động kích hoạt

| Sự kiện | Người nhận | Tiêu đề email |
|---|---|---|
| Giao task (assign) | Nhân viên | `[New Task] {title}` |
| Bắt đầu làm (start) | Admin | `[STARTED] {username} đã bắt đầu task: {title}` |
| Admin đã FB (resume from Revision) | Nhân viên | `[Update] Admin đã phản hồi task: {title}` |
| Nộp bài (submit → Review) | Nhân viên | `[Submission] Task "{title}" đang chờ Admin phản hồi` |
| Feedback (→ Revision) | Nhân viên | `[Action Required] Admin đã gửi Feedback cho task: {title}` |
| Hoàn thành (→ Hoàn tất) | Nhân viên | `[Success] Chúc mừng! Task "{title}" đã hoàn thành` |

---

## 13. Concurrency & Optimistic Locking

- Mỗi task có field `version: number`
- `updateTaskStatus()` sử dụng **optimistic locking**:
  - Nếu `currentVersion` khác version trong DB → lỗi: "Task has been updated by someone else. Please refresh."
- `claimTask()` sử dụng **transaction** với `updateMany` check `version` + `assigneeId: null`:
  - Race condition safe — chỉ 1 người nhận được task
- Payroll lock: Nếu kỳ lương đã PAID → không sửa được jobPriceUSD/value

---

## Phụ lục: Salary / Payroll Constants

| Constant | Giá trị | Ý nghĩa |
|---|---|---|
| `SALARY_PENDING_STATUSES` | Nhận task, Đang đợi giao, Đang thực hiện, Review, Revision, Gửi lại | Trạng thái tính vào lương chờ xử lý |
| `SALARY_COMPLETED_STATUS` | Hoàn tất | Trạng thái tính lương hoàn thành |
