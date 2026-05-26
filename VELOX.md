# Velox — Đặc tả chi tiết

**Project:** HustlyTasker
**Feature:** Velox (Tạo Task Nhanh)
**Version:** 1.1
**Status:** Shipped — production
**Last updated:** 2026-05-26
**Owner:** Dareu (Manager)

---

## 1. Tổng quan

**Velox** là một feature ăn liền của HustlyTasker, giúp admin tạo task **nhanh hơn 10×** so với việc nhập tay 5-step wizard cho từng video. Velox đóng vai trò **lớp phụ trợ điền form** (prefill helper) — nhập liệu cho `AddTaskModal` mặc định, **không tự tạo task**.

### 1.1. Một câu mô tả

> Velox = scan link folder Dropbox/Google Drive → detect video → áp dụng automation (8 toggle) → fill toàn bộ form Add Task → user review/sửa → bấm "Add task" / "Tạo tất cả" → batch tasks tạo trong 1 transaction.

### 1.2. Tại sao có Velox?

- **Trước Velox**: admin phải tạo task thủ công cho từng video (5-step wizard × N video × M client/tháng → mất hàng giờ).
- **Velox**: 1 link folder → mọi metadata (tên, duration, type, price, raw footage URL, editor, deadline, notes kế thừa) được tự động fill → admin chỉ review + bấm submit.

### 1.3. Vị trí truy cập

- Icon 🚀 ở **header của `AddTaskModal`** (góc phải, kế cạnh AutoSaveIndicator và nút X).
- Chỉ admin (`verifyWorkspaceAccess('ADMIN')`) thấy được nút.
- Editor (USER role) không truy cập được.

---

## 2. Mục tiêu

| # | Mục tiêu | Thực thi qua |
|---|---|---|
| 1 | **1 entry point tạo task duy nhất** = AddTaskModal | Velox không tự tạo, chỉ fill form → user bấm "Add task" / "Tạo tất cả" |
| 2 | **Giảm nhập liệu trùng lặp** cho bulk task | Scan folder → N video → 1 lần fill toggles → tạo N task |
| 3 | **Inherited intelligence** từ task cũ | "Kế thừa ghi chú" pull từ task cùng client (+ sub-client) |
| 4 | **Per-video personalization** | Mỗi task có raw footage URL riêng (qua VeloxRawFootagesModal popup) |
| 5 | **Không thay đổi UI đột ngột** | Velox apply xong → wizard hiện y nguyên với data prefilled. Per-video URL hiển thị qua summary chip ở Step 4. |
| 6 | **Persist data khi user lỡ close modal** | Auto-save Velox state (form + per-video URLs + green badges) qua localStorage. Restore khi mở lại. |

---

## 3. Kiến trúc

### 3.1. Component tree

```
AddTaskModal (5-step wizard)
├── 🚀 button (header) → setQuickMode(true)
├── QuickCreateMode (in-place content swap khi quickMode=true)
│   ├── URL input + Scan button
│   ├── Client picker (AutocompleteInput)
│   ├── Pricing Rule dropdown
│   ├── 8 Automation toggles
│   ├── Title prefix input
│   ├── Preview table (N rows × 6 cols)
│   └── "Áp dụng vào form" button
├── VeloxConflictDialog (overlay khi field đã có data + Velox muốn ghi đè)
└── VeloxRawFootagesModal (popup edit per-video URLs khi N≥2)
```

### 3.2. Data flow

```
User clicks 🚀
  ↓
QuickCreateMode mounted (quickMode=true)
  ↓
User: paste URL → click Scan
  ↓
POST /api/integrations/scan-folder
  ↓
Backend: Dropbox/GDrive API → scan videos → return ScannedVideo[]
  ↓
QuickCreateMode setScannedVideos(videos)
  ↓
Recompute useEffect → build PreviewRow[] from scannedVideos
                    + apply toggles (classify, pricing, naming)
                    + preserve user's selected state via Map<rowId, prevRow>
  ↓
User: pick Client + Pricing Rule + tick/untick toggles + edit prefix
  ↓
useEffect "Kế thừa ghi chú" → getLastClientNote(clientId) → setInheritedNotes
useEffect "Gán editor tự động" → suggestRoundRobinAssignee → setAssigneeId
  ↓
User clicks "Áp dụng vào form"
  ↓
handleSubmit → build VeloxApplyPayload → onApplyToForm(payload)
  ↓
AddTaskModal.handleApplyVelox(payload):
  ↓
  ├── selectedRows.length >= 2 + linkFootage ON
  │   → drop rawFootage from prefill
  │   → setVeloxBatchRaw(per-video URLs[])
  │
  └── mapVeloxPayloadToFormData → { prefill, filledFields }
       ↓
  detectFieldConflicts(form, prefill) → conflicts Set
       ↓
  ├── No conflicts → applyVeloxPrefill('overwrite')
  │                  + setVeloxFilledFields(filled)
  │                  + setQuickMode(false) → wizard reappears
  │
  └── Has conflicts → setPendingPrefill → show VeloxConflictDialog
                     → user picks strategy → applyVeloxPrefill(strategy)
  ↓
User reviews wizard → edits inline → bấm "Add task"
  ↓
AddTaskModal.handleSubmit(form, { veloxBatchRaw }):
  ↓
DashboardActionWrapper.handleSubmit:
  ↓
  ├── veloxBatchRaw.length === N === videoNames.length + N≥2
  │   → createTasksFromBatch(per-row data)
  │   → transactional create N tasks với resources khác nhau per task
  │
  ├── titles.length === 1
  │   → createTask (single task path)
  │
  └── else (non-Velox batch)
       → createBatchTasks (shared resources path)
```

### 3.3. State machine

`AddTaskModal` có 2 mode chính (cùng UI):

| Mode | Trigger | Content |
|---|---|---|
| **Wizard** (default) | Modal mở, `quickMode=false` | 5-step form: General Info → Video → Finance → Assets → Preview |
| **Velox** | User bấm 🚀, `quickMode=true` | QuickCreateMode component (single-page UI) |

Switch giữa 2 mode chỉ là `setQuickMode(true/false)` — content swap, modal frame không đổi.

---

## 4. User flow

### 4.1. Happy path (N≥2 videos)

1. Admin click "+ Add Task" → AddTaskModal mở (Wizard mode)
2. Click 🚀 ở header → QuickCreateMode hiện
3. Paste link folder Dropbox/GDrive vào URL input
4. Click "Scan" → spinner → preview table xuất hiện với N videos
5. Pick Client (AutocompleteInput search)
6. Pick Pricing Rule (auto-select default nếu có)
7. Tick các toggles muốn dùng:
   - ☑ Tự nhận diện video (default ON)
   - ☑ Gắn link footage gốc (default ON)
   - ☑ Phân loại Short/Long (default ON)
   - ☑ Tự động đặt tên (default ON)
   - ☑ Áp dụng bảng giá (default ON)
   - ☐ Kế thừa ghi chú (user tick)
   - ☐ Gán editor tự động (user tick)
   - ☐ Đặt deadline đồng loạt (user tick → date picker hiện)
8. (Optional) Nhập prefix vào "Tiền tố tên task" (vd: `[Tháng 5]`)
9. Review preview table — uncheck rows không muốn tạo, edit price/duration inline
10. Click "Áp dụng vào form"
11. Velox modal đóng → wizard reappears với data prefilled:
    - General Info: client, taskType, deadline, assignee
    - Video: videoList textarea với N titles
    - Finance: jobPriceUSD, editorFee (lấy từ row 1)
    - Assets: rawFootage cell hiện chip emerald **"🚀 N/N link đã được trích xuất từ Velox · Bấm để chỉnh sửa"**
    - Notes: TipTap editor có nội dung kế thừa (nếu toggle ON + có note source)
12. Green 🚀 badge xuất hiện trên các field Velox đã fill
13. (Optional) Click vào chip rawFootage → VeloxRawFootagesModal popup mở → edit từng URL nếu cần
14. Click "Add task" → DashboardActionWrapper routes to `createTasksFromBatch` → N tasks tạo trong 1 transaction → toast success → router.refresh

### 4.2. N=1 video (single task)

Khác step 11+:
- Velox apply như N≥2 nhưng rawFootage fill thẳng vào input (không có chip)
- User submit → routes to `createTask` (single path)

### 4.3. User dismiss modal giữa chừng

1. Velox đã apply → form prefilled
2. User click X / Esc / backdrop
3. `useAutoSaveDraft` flush ngay lập tức (sync write to localStorage) — bao gồm `form + step + veloxBatchRaw + veloxFilledFields`
4. User mở lại AddTaskModal → restore từ localStorage → toast "Đã khôi phục bản nháp đang nhập dở" → form + chip rawFootage + green badges hiện lại đầy đủ
5. Sliding TTL 3 phút — sau 3 phút idle, draft expire

---

## 5. UI Specs

### 5.1. 🚀 Button (header)

| State | Visual |
|---|---|
| Inactive (default) | `bg-white/[0.06]`, icon `Rocket` size 16, color `text-zinc-400` |
| Hover | `bg-white/[0.12]`, color `text-violet-300` |
| Active (quickMode=true) | `bg-violet-500/20 border-violet-500/40`, icon `ClipboardList` (toggle back to wizard) |
| Velox-applied (≥1 field) | Green dot indicator ở góc top-right: `bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]` |

**Tooltip**:
- Inactive default: `"Mở Velox"`
- Velox-applied: `"Velox đã áp dụng cho ${N} field"`
- Active: `"Chuyển sang form thường"`

### 5.2. Velox Modal Header

```
🚀 Velox
Velox — dán link folder, tạo batch trong 1 click
```

- Title: `text-[16px] font-extrabold text-white` với Rocket icon prefix
- Subtitle: `text-xs text-[#A1A1AA]`

### 5.3. QuickCreateMode layout

```
┌─────────────────────────────────────────────────┐
│ [🚀] Velox                                      │
│ Dán link folder Dropbox/Google Drive → tự động  │
│ scan video, phân loại, tính giá và tạo task...  │
│                                                  │
│ LINK FOLDER                                     │
│ [https://www.dropbox.com/scl/fo/...] [Scan]     │
│                                                  │
│ CLIENT                  PRICING RULE             │
│ [Search client...]      [Tự động (default) ▾]   │
│                                                  │
│ AUTOMATION                                       │
│ ☑ Tự nhận diện video      ☑ Gắn link footage gốc│
│ ☑ Phân loại Short/Long    ☑ Tự động đặt tên     │
│ ☑ Áp dụng bảng giá        ☐ Kế thừa ghi chú     │
│ ☐ Gán editor tự động      ☐ Đặt deadline đồng loạt│
│                                                  │
│ TIỀN TỐ TÊN TASK (OPTIONAL)                     │
│ [Vd: [Tháng 5] — sẽ prepend vào mỗi task title] │
│                                                  │
│ EDITOR (ASSIGNEE)         DEADLINE              │
│ [Pick editor...]          [datetime-local]      │
│                                                  │
│ PREVIEW (N/total video)                          │
│ ┌──────────────────────────────────────────────┐│
│ │☑ │ Title           │Time│Type │USD │VND     ││
│ ├──────────────────────────────────────────────┤│
│ │☑ │ Video 1.mp4    │2:15│Long │$25 │650k    ││
│ │☑ │ Video 2.mov    │0:58│Short│$15 │390k    ││
│ │☐ │ Video 3.mov    │1:30│Short│$15 │390k    ││ ← unchecked
│ │..│                 │    │     │    │        ││
│ └──────────────────────────────────────────────┘│
│ Total: 2 selected · $40 · 1,040,000 VND         │
│                                                  │
│                        [✨ Áp dụng vào form]    │
└─────────────────────────────────────────────────┘
```

### 5.4. VeloxField indicator (green badge)

Khi Velox đã fill một field, indicator được wrap quanh input:

- **Border**: `border-l-2 border-emerald-500` ở cạnh trái
- **Background**: `bg-emerald-500/[0.06]`
- **Icon**: 🚀 nhỏ ở góc phải trên input
- **Tooltip on hover**: `"Điền tự động bởi Velox · ${featureName}"`

Tag biến mất khi user manually edit field (`set('fieldName', newValue)` → `setVeloxFilledFields(prev → next - fieldName)`).

### 5.5. Step 4 rawFootage cell (N≥2 mode)

Khi `veloxBatchRaw.length > 0`, thay input bằng button chip:

```tsx
┌────────────────────────────────────────────────────────┐
│ 🚀 N/total link đã được trích xuất từ Velox │ Bấm để... │
└────────────────────────────────────────────────────────┘
```

- `bg-emerald-500/[0.06]`, `border-emerald-500/25`, `rounded-full`, `h-11`
- Hover: `bg-emerald-500/[0.10]`, `border-emerald-500/40`
- Click → mở VeloxRawFootagesModal

### 5.6. VeloxRawFootagesModal

```
┌─────────────────────────────────────────────────┐
│ 🚀 Velox Raw Footages                       [X] │
│ N/total link · chỉ chỉnh sửa được URL của video │
├─────────────────────────────────────────────────┤
│ # │ Video title         │ Raw URL                │
├─────────────────────────────────────────────────┤
│ 1 │ Video1.mp4          │ [https://...        ] │
│ 2 │ Video2.mov          │ [https://...        ] │
│ 3 │ Video3.mov          │ [                   ] │ ← empty OK
│ ..│                     │                       │
├─────────────────────────────────────────────────┤
│ Chỉnh title trong videoList ở form chính   [Hủy] [Lưu] │
└─────────────────────────────────────────────────┘
```

- Modal `max-w-2xl`, glass `bg-zinc-950/95 backdrop-blur-xl`
- Border `border-emerald-500/[0.20]`
- Title column readonly (user edit qua videoList)
- URL column editable, font-mono, placeholder `https://...`
- Lưu → propagate full array back to AddTaskModal qua onChange callback
- Hủy → discard draft

### 5.7. VeloxConflictDialog

Khi Velox prefill phát hiện field đã có giá trị (user gõ tay trước):

```
┌─────────────────────────────────────────────────┐
│ ⚠️ Field đã có dữ liệu — chọn cách xử lý        │
│                                                  │
│ Velox muốn fill các field sau, nhưng bạn đã     │
│ có dữ liệu:                                     │
│   • Notes (giá trị hiện tại: "...")             │
│   • Task type (giá trị hiện tại: "Short form")  │
│                                                  │
│ Strategy:                                        │
│  ○ Ghi đè (overwrite — dùng giá trị Velox)      │
│  ○ Giữ (keep — bỏ qua, dùng giá trị user)       │
│  ○ Gộp (merge — chỉ cho list/text field)        │
│                                                  │
│           [Hủy]    [Áp dụng]                    │
└─────────────────────────────────────────────────┘
```

**Ngoại lệ (spec 7.4)**: nếu `inheritNotes` toggle ON + form notes đã có chữ → mặc định **append** không hỏi (intent của tính năng kế thừa).

### 5.8. Color palette

- **Primary brand**: violet `#8B5CF6` — rocket icon, button "Áp dụng vào form", green dot accent
- **Velox-filled indicator**: emerald `#10B981` — border-left, icon glow, summary chip
- **Background**: dark glass `bg-zinc-950/95 backdrop-blur-xl`
- **Borders**: `border-[rgba(139,92,246,0.15)]` (violet 15%) cho frame, `border-emerald-500/25` cho Velox chips

---

## 6. Automation Toggles (8 features + 1 prefix)

### 6.1. Bảng tổng quan

| # | Toggle | Default | Phụ thuộc | Logic |
|---|---|---|---|---|
| 1 | Tự nhận diện video | ☑ ON | Scan đã chạy | Filter scanned items theo MIME type video, exclude folder/image/audio |
| 2 | Gắn link footage gốc | ☑ ON | Mỗi video có previewUrl | Per-video `previewUrl` → vào `veloxBatchRaw[i]` (N≥2) hoặc `form.rawFootage` (N=1) |
| 3 | Phân loại Short/Long | ☑ ON | Duration > 0 | `durationSeconds <= 120` → "Short form", > 120 → "Long form". Hard-coded threshold 120s. |
| 4 | Tự động đặt tên | ☑ ON | Filename có hậu tố ext | `v.name` (filename without ext) thay vì `v.fullName`. Combined với prefix → final title |
| 5 | Áp dụng bảng giá | ☑ ON | Pricing Rule chọn + duration > 0 | `calculatePrice(rule, durationSeconds)` → `priceUSD` + `wageVND` per row |
| 6 | Kế thừa ghi chú | ☐ OFF | Client đã chọn | `getLastClientNote(clientId)` → pull most recent task notes (any status) of client + sub-clients |
| 7 | Gán editor tự động | ☐ OFF | Workspace có MEMBER | `suggestRoundRobinAssignee(workspaceId)` → editor có active task count thấp nhất |
| 8 | Đặt deadline đồng loạt | ☐ OFF | None | Date picker xuất hiện → giá trị → `form.deadline` cho mọi task |
| **+** | Tiền tố tên task | empty | None | Text input → prepend vào `title` per row (vd: `"[Tháng 5] Video1.mp4"`) |

### 6.2. Chi tiết từng toggle

#### 6.2.1. Tự nhận diện video (`toggles.detectVideo`)

**Function**: Scan API tự loại non-video files (folder, image, audio) khỏi response. Toggle này chỉ có ý nghĩa hiển thị — nếu OFF (rất hiếm), user phải tự filter trong preview.

#### 6.2.2. Gắn link footage gốc (`toggles.linkFootage`)

**N=1 path**: `prefill.rawFootage = selectedRow.previewUrl` → vào `form.rawFootage` input.

**N≥2 path**:
- Drop rawFootage khỏi prefill
- Set `veloxBatchRaw = selectedRows.map(r => r.previewUrl ?? '')`
- Step 4 hiện chip thay vì input
- Click chip → VeloxRawFootagesModal cho phép edit từng URL

**Toggle OFF**: rawFootage không fill (kể cả N=1 hay N≥2).

#### 6.2.3. Phân loại Short/Long (`toggles.classifyDuration`)

Function: `classifyVideoType(durationSeconds): 'Short form' | 'Long form'` ở `src/lib/pricing-engine.ts`.

**Threshold**: 120 giây (2 phút).
- `≤ 120s` → `'Short form'`
- `> 120s` → `'Long form'`

Trial chưa được support (out-of-scope hiện tại).

Toggle OFF → mọi row default `'Short form'` (placeholder).

#### 6.2.4. Tự động đặt tên (`toggles.autoName`)

**ON**: `baseTitle = video.name` (filename không có extension, vd: `"My Episode 12"`)

**OFF**: `baseTitle = video.fullName` (filename có extension, vd: `"My Episode 12.mp4"`)

Combined với prefix:
```
title = titlePrefix.trim() 
  ? `${titlePrefix.trim()} ${baseTitle}` 
  : baseTitle
```

Vd: prefix `"[Tháng 5]"` + baseTitle `"Video1"` → `"[Tháng 5] Video1"`.

#### 6.2.5. Áp dụng bảng giá (`toggles.applyPricing`)

Phụ thuộc:
- Pricing Rule được chọn (qua dropdown `Pricing Rule`)
- Mỗi video có `durationSeconds > 0` (Dropbox đôi khi không trả duration)

**Logic**:
```ts
const pricing = calculatePrice(
  { ruleType, config, name },
  video.durationSeconds
)
// → { priceUSD, wageVND, ruleApplied }
```

Rule types (`src/lib/pricing-engine.ts`):
- **flat**: 1 mức giá cho mọi duration
- **per_minute**: rate × ceil(minutes)
- **tiered_duration**: bracket pricing (Short < 2min: $X, Long 2-10min: $Y, etc.)
- **custom**: complex formula (user-defined per rule)

Toggle OFF → `priceUSD = 0, wageVND = 0` cho mọi row.

#### 6.2.6. Kế thừa ghi chú (`toggles.inheritNotes`)

**Velox v1.1** — đổi từ "Kế thừa ghi chú **tháng trước**", drop status filter.

**Trigger**: Toggle ON + Client đã chọn (clientId != null).

**Logic** (`getLastClientNote(clientId, workspaceId)` ở `src/actions/velox-helpers-actions.ts`):

```ts
// Walk subsidiary tree (depth-limit 5)
const clientIds = await collectClientAndSubsidiaries(clientId)

// Query: ANY status, non-empty notes_vi, sort by updatedAt DESC, take first
const task = await prisma.task.findFirst({
  where: {
    workspaceId: { in: profileWorkspaces },
    clientId: { in: clientIds },
    isArchived: false,
    NOT: [{ notes_vi: null }, { notes_vi: '' }],
  },
  orderBy: { updatedAt: 'desc' },
})

return {
  note: task.notes_vi,
  sourceTitle: task.title,
  sourceClientName: task.client.name,
  sourceDate: task.updatedAt.toISOString().slice(0, 10),
}
```

**UX**:
1. Tick toggle → fetch hiển thị preview qua toast info:
   > `Note kế thừa từ task "Test inherit" (Jacob, 2026-05-20)`
2. Nếu không match: toast warning `"Không có note để kế thừa từ client này."`
3. Notes thực sự đổ vào `form.notes` chỉ khi user bấm "Áp dụng vào form"

**Ngoại lệ append**: nếu `form.notes` đã có nội dung + toggle ON → mặc định **append** (không hỏi qua VeloxConflictDialog).

#### 6.2.7. Gán editor tự động (`toggles.autoAssign`)

**Trigger**: Toggle ON.

**Logic** (`suggestRoundRobinAssignee(workspaceId)` ở `src/actions/velox-helpers-actions.ts`):

```ts
// Get all MEMBER role users in workspace
const members = await prisma.workspaceMember.findMany({
  where: { workspaceId, role: 'MEMBER' },
  ...
})

// Count active tasks per member (status NOT IN ['Hoàn tất', 'Đã hủy'])
const counts = await Promise.all(members.map(async m => ({
  userId: m.userId,
  activeCount: await prisma.task.count({ where: { workspaceId, assigneeId: m.userId, status: notIn }})
})))

// Pick lowest workload (round-robin tie-break = natural sort order)
counts.sort((a, b) => a.activeCount - b.activeCount)
return counts[0]
```

**UX**:
1. Tick toggle → fetch + setAssigneeId
2. Toast info: `"Gợi ý gán cho: ${nickname} (${activeCount} task đang xử lý)"`
3. User có thể override qua dropdown Editor

#### 6.2.8. Đặt deadline đồng loạt (`toggles.uniformDeadline`)

**Trigger**: Toggle ON.

**UX**: Date picker (datetime-local) xuất hiện ngay dưới toggle. User nhập 1 giá trị → áp dụng cho mọi task khi submit.

#### 6.2.9. Tiền tố tên task (input, không phải toggle)

Free-text input. Default empty. Khi non-empty:
```
final title = `${titlePrefix.trim()} ${baseTitle}`
```

Vd: prefix `"[KB Media]"` + baseTitle `"07_offer"` → `"[KB Media] 07_offer"`.

---

## 7. Tính năng "Kế thừa ghi chú" (chi tiết)

### 7.1. Tại sao có?

Editor làm task cho client lặp lại theo tháng/quý. Notes của task tháng trước (vd: "Client thích đoạn intro 5s, dùng template X") rất giá trị → tránh để admin gõ lại mỗi lần.

### 7.2. Behavior chi tiết

| Trường hợp | Behavior |
|---|---|
| Toggle ON + client chưa chọn | Toggle disabled, tooltip `"Chọn client trước"` |
| Toggle ON + client chọn → có note | Toast info preview "Note kế thừa từ task..." |
| Toggle ON + client chọn → KHÔNG có note | Toast warning `"Không có note để kế thừa từ client này."` Toggle vẫn ON nhưng không đổ gì vào form. |
| Toggle ON + đổi sang client khác | Re-query qua useEffect dep change |
| Toggle OFF | Clear `inheritedNotes` state |

### 7.3. Sub-client recursion

Velox walks Client subsidiary tree (depth-limit 5):

```
Jacob (parent)
├── Jacob/Jayden (sub)
│   └── Jacob/Jayden/Bob (sub-sub)
├── Jacob/Sarah (sub)
```

| Pick | Tasks query covers |
|---|---|
| Jacob | Jacob + Jayden + Bob + Sarah |
| Jacob/Jayden | Jacob/Jayden + Jacob/Jayden/Bob |
| Jacob/Sarah | Jacob/Sarah only (no children) |

### 7.4. Status filter

**Velox v1.0**: chỉ `status='Hoàn tất'` (vetted templates).

**Velox v1.1** (current): **ANY status** with non-empty `notes_vi`. Reasoning:
- User feedback: "lấy ghi chú của những task giống với của khách hàng trước đó" — inclusive
- In-progress / Revision tasks có notes thực tế đáng tận dụng
- Trade-off: có thể pull notes chưa final (acceptable — user thấy preview, có thể không apply)

### 7.5. Sort order

`orderBy: { updatedAt: 'desc' }` → lấy task được sửa gần nhất.

**Multi-task**: chỉ lấy task mới nhất, không gộp top N (out-of-scope hiện tại).

### 7.6. Note delivery

Notes KHÔNG đổ vào `form.notes` lúc tick toggle. Chỉ apply khi user bấm "Áp dụng vào form" → `mapVeloxPayloadToFormData` đọc `payload.common.inheritedNote` → `prefill.notes = inheritedNote`.

**Append behavior**: Nếu `form.notes` đã có nội dung + Velox cũng có inheritedNote → tự động append (intent của tính năng), không hỏi qua VeloxConflictDialog.

---

## 8. VeloxRawFootagesModal popup (N≥2)

### 8.1. Khi nào activate

- Velox apply với `selectedRows.length >= 2`
- AND `toggles.linkFootage === true`

### 8.2. State management

`veloxBatchRaw: string[]` trong AddTaskModal state.
- Length 1:1 với `form.videoList` lines (sau khi split + trim + filter empty)
- Khi user edit videoList trong wizard → useEffect tự pad/truncate `veloxBatchRaw`:
  - Lines tăng → array append `""` cho line mới
  - Lines giảm → array truncate
  - Lines giữ nguyên count → array không đổi

### 8.3. Edit UX

Popup mở khi user click vào chip emerald ở Step 4 rawFootage:
- 2 cols: Title (readonly, hiển thị từ `form.videoList`) + URL (editable)
- Bottom: "Chỉnh title trong videoList ở form chính" hint
- Hủy → discard draft (state local `draft` reset từ `urls` prop)
- Lưu → `onChange(draft)` → AddTaskModal `setVeloxBatchRaw(nextUrls)`

### 8.4. Submit routing

Khi user bấm "Add task" trong wizard:
- AddTaskModal `handleSubmit` đọc `veloxBatchRaw`
- Pass qua `onSubmit(form, { veloxBatchRaw })`
- DashboardActionWrapper check: `veloxBatchRaw.length === videoNames.length && videoNames.length >= 2` → route to **`createTasksFromBatch`** với per-row resources
- Mỗi task có raw footage URL riêng (pack vào `resources` field: `"RAW: ${url} | BROLL: ${bRoll} | SUBMISSION: ${submitFolder}"`)
- Nếu không match → fallback to standard `createTask` (N=1) hoặc `createBatchTasks` (N≥2 không có Velox)

---

## 9. Conflict resolution

### 9.1. Detection

`detectFieldConflicts(currentForm, velocityPrefill)` ở `src/lib/velox-helpers.ts` so sánh từng field:
- Field nào `currentForm[k]` có nội dung NHƯNG `prefill[k]` cũng có nội dung khác → conflict

### 9.2. Strategies

VeloxConflictDialog cho user pick 3 strategy:

| Strategy | Behavior |
|---|---|
| **Overwrite** | Velox value thắng. Áp dụng prefill toàn bộ. |
| **Keep** | User value thắng. Bỏ qua các field conflict, chỉ apply field không conflict. |
| **Merge** (chỉ list/text) | List field (videoList): concat thêm. Text field (notes): append `\n`. Số/dropdown: dùng overwrite. |

### 9.3. Note exception

Spec 7.4 — nếu `inheritNotes` toggle ON + form notes có chữ → tự động **append** không hỏi.
- Lý do: intent của tính năng kế thừa là extend, không phải replace.

---

## 10. Data model

Velox không thêm DB schema mới. Reuse existing Prisma models:

### 10.1. `Task`

Fields được Velox prefill / write:
- `title` (string) — generated từ filename + prefix
- `type` (string) — Short form / Long form
- `clientId` (number) — picker selection
- `assigneeId` (string) — picker hoặc auto-assign
- `deadline` (DateTime) — uniform date picker
- `jobPriceUSD` (Decimal) — pricing rule output
- `wageVND` (Decimal) — pricing rule output
- `value` (Decimal) — alias của wageVND (legacy field)
- `resources` (string) — pack "RAW: url | BROLL: ... | SUBMISSION: ..."
- `notes_vi` (string) — inherited note text
- `exchangeRate` (Decimal) — snapshot lúc tạo
- `profitVND` (Decimal) — computed: revenueVND - wageVND
- `workspaceId`, `profileId`, `assignedById` — context fields
- `status` (string) — `'Nhận task'` nếu có assignee, `'Đang đợi giao'` nếu không

### 10.2. `Client`

Self-relation:
```prisma
model Client {
  id           Int      @id @default(autoincrement())
  name         String
  parentId     Int?
  parent       Client?  @relation("ClientHierarchy", fields: [parentId], references: [id])
  subsidiaries Client[] @relation("ClientHierarchy")
  ...
}
```

Velox walk subsidiaries tree khi query inherit notes.

### 10.3. `PricingRule`

```prisma
model PricingRule {
  id        String   @id
  name      String
  ruleType  String   // 'flat' | 'per_minute' | 'tiered_duration' | 'custom'
  config    Json     // shape depends on ruleType
  clientId  Int?     // null = workspace-wide default
  isDefault Boolean
  ...
}
```

### 10.4. `IntegrationToken`

```prisma
model IntegrationToken {
  id          String
  userId      String
  workspaceId String
  provider    String   // 'dropbox' | 'google_drive'
  encryptedAccessToken String  // AES-256-GCM
  encryptedRefreshToken String?
  expiresAt   DateTime?
  ...
}
```

User connects Dropbox/GDrive qua OAuth2 ở Settings → Connectors. Token được AES-256-GCM encrypted trước khi lưu.

---

## 11. Server actions

### 11.1. `getLastClientNote`

**File**: `src/actions/velox-helpers-actions.ts`

```ts
async function getLastClientNote(
  clientId: number,
  workspaceId: string
): Promise<InheritedNotePreview | null>
```

**Permission**: ADMIN only.
**Scope**: Tất cả workspaces trong cùng profile (sibling workspace included).
**Filter**: notes_vi non-empty, ANY status, isArchived=false.

### 11.2. `suggestRoundRobinAssignee`

**File**: `src/actions/velox-helpers-actions.ts`

```ts
async function suggestRoundRobinAssignee(
  workspaceId: string
): Promise<{ userId, username, nickname, activeCount } | null>
```

**Permission**: ADMIN.
**Scope**: Members với role MEMBER trong workspace hiện tại.

### 11.3. `createTasksFromBatch`

**File**: `src/actions/velox-batch-actions.ts`

```ts
async function createTasksFromBatch(
  data: {
    rows: BatchTaskRow[]  // per-row title, type, price, clientId, assigneeId, deadline, rawFootage, notes
    exchangeRate: number
    skipInvalid?: boolean
  },
  workspaceId: string
): Promise<{ success, count, taskIds, skipped } | { error }>
```

**Permission**: ADMIN.
**Transaction**: Atomic — all or nothing (unless `skipInvalid=true`).
**Side effects**:
- Audit log: 1 bulk-level entry + 1 per-task entry
- Notifications: fire-and-forget cho mỗi assignee
- `revalidatePath` for admin pages

### 11.4. Cloud scanner API

**Endpoint**: `POST /api/integrations/scan-folder`

**Request**:
```json
{ "url": "https://www.dropbox.com/scl/fo/...", "workspaceId": "..." }
```

**Response success**:
```json
{
  "videos": [
    {
      "fileId": "...",
      "name": "Video1",
      "fullName": "Video1.mp4",
      "durationSeconds": 135,
      "previewUrl": "https://www.dropbox.com/.../preview",
      ...
    }
  ]
}
```

**Response error**:
```json
{
  "error": "...",
  "requiresConnection": true  // user chưa OAuth provider
}
```

---

## 12. File map (critical files)

### 12.1. Components

| File | Purpose |
|---|---|
| `src/components/dashboard/AddTaskModal.tsx` | Wizard host + Velox mount point |
| `src/components/dashboard/QuickCreateMode.tsx` | Velox UI (toggles, scan, preview) |
| `src/components/dashboard/VeloxRawFootagesModal.tsx` | Popup edit per-video URLs |
| `src/components/dashboard/VeloxConflictDialog.tsx` | Conflict resolution dialog |
| `src/components/dashboard/DashboardActionWrapper.tsx` | Submit routing (Velox-batch vs standard) |
| `src/components/settings/ConnectorsPanel.tsx` | OAuth Dropbox/GDrive setup UI |
| `src/components/settings/PricingRulesPanel.tsx` | Pricing rule CRUD UI |

### 12.2. Logic / helpers

| File | Purpose |
|---|---|
| `src/lib/velox-helpers.ts` | Type definitions, mapVeloxPayloadToFormData, detectFieldConflicts, applyPrefill |
| `src/lib/pricing-engine.ts` | calculatePrice, classifyVideoType, formatDuration |
| `src/lib/cloud-scanner.ts` | Dropbox + Google Drive folder scan |
| `src/lib/cloud-link-parser.ts` | Parse folder URLs to provider + folder ID |
| `src/lib/token-encryption.ts` | AES-256-GCM encrypt/decrypt OAuth tokens |
| `src/hooks/useAutoSaveDraft.ts` | Generic auto-save hook (used by AddTaskModal) |

### 12.3. Server actions / APIs

| File | Purpose |
|---|---|
| `src/actions/velox-helpers-actions.ts` | getLastClientNote, suggestRoundRobinAssignee |
| `src/actions/velox-batch-actions.ts` | createTasksFromBatch (per-row create) |
| `src/actions/pricing-rule-actions.ts` | PricingRule CRUD |
| `src/actions/integration-actions.ts` | OAuth flow + IntegrationToken management |
| `src/app/api/integrations/scan-folder/route.ts` | Scan folder API endpoint |
| `src/app/api/integrations/dropbox/{authorize,callback}/route.ts` | Dropbox OAuth |
| `src/app/api/integrations/google-drive/{authorize,callback}/route.ts` | GDrive OAuth |

---

## 13. Permission & security

### 13.1. Role gating

- **Velox truy cập**: chỉ ADMIN của workspace (`verifyWorkspaceAccess(wsId, 'ADMIN')`)
- USER (editor) role không thấy nút 🚀
- Server actions all gated `'ADMIN'` (re-check ở backend)

### 13.2. OAuth scopes

- **Dropbox**: `files.metadata.read files.content.read sharing.read`
- **Google Drive**: `https://www.googleapis.com/auth/drive.readonly`
- Read-only — Velox không tạo/sửa/xóa file trong cloud

### 13.3. Token storage

- AES-256-GCM encryption qua `INTEGRATION_TOKEN_SECRET` env var
- Token rotate: GDrive refresh token tự động khi expire, Dropbox long-lived
- Per-user-per-workspace scope (1 user có thể connect Dropbox riêng cho mỗi workspace)

### 13.4. Profile scope

- `getLastClientNote` query toàn bộ workspaces trong cùng `profileId` (không leak data cross-profile)
- `createTasksFromBatch` chỉ tạo trong `workspaceId` được pass (verify ADMIN access)

---

## 14. Autosave

### 14.1. Hook

`useAutoSaveDraft<T>(key, state, onRestore, options)` ở `src/hooks/useAutoSaveDraft.ts`.

### 14.2. Cấu hình hiện tại (AddTaskModal)

```ts
const DRAFT_KEY = `addTask:draft:${workspaceId}`
const { restored, clearDraft, savedAt } = useAutoSaveDraft<{
  form: TaskFormData
  step: number
  veloxBatchRaw: string[]
  veloxFilledFields: string[]  // Set serialized as array
}>(
  DRAFT_KEY,
  { form, step, veloxBatchRaw, veloxFilledFields: Array.from(veloxFilledFields) },
  (draft) => { /* restore */ },
  {
    ttlMs: 3 * 60 * 1000,  // 3 phút sliding TTL
    debounceMs: 500,
    enabled: open && !submitted,
    shouldSave: ({ form, veloxBatchRaw, veloxFilledFields }) => /* truthy nếu có Velox state hoặc form data */,
  }
)
```

### 14.3. Flush-on-disable (Velox v1.1 fix)

Khi modal close (`enabled` flip false), hook flush pending debounce save SYNC trước khi reset → tránh mất data nếu user click X trong < 500ms sau Velox apply.

### 14.4. Restore flow

1. Modal mở → useEffect restore từ localStorage
2. Check expiry → nếu expired → xóa entry
3. Apply draft state qua `onRestore` callback
4. Toast info `"Đã khôi phục bản nháp đang nhập dở"` (chỉ hiện 1 lần per session)
5. Set `restoredRef = true` để cho phép save tiếp

### 14.5. Per-workspace isolation

DRAFT_KEY có prefix `workspaceId` → user có nhiều workspace cùng mở nhiều tab cũng không cross-contaminate.

---

## 15. Edge cases

| Trường hợp | Behavior |
|---|---|
| Folder rỗng | Toast warning `"Folder không có video nào."`, preview table không hiện |
| Dropbox không trả duration | `durationSeconds = 0`, cell hiển thị `?` màu vàng + tooltip "Nhập tay (vd: 1:30 hoặc 90)" |
| User chưa OAuth provider | Scan return error `requiresConnection: true` → toast `"Vào Settings → Connectors để kết nối."` |
| Pricing rule không match client | Fallback to workspace-default rule. Nếu không có → pricing toggle có effect nhưng `priceUSD = 0` |
| Multi-link footage (1 video có >2 link) | Out-of-scope hiện tại — 1 video = 1 raw URL. Future: badge "X link" trong cell + sub-popup. |
| User edit videoList giảm dòng | `useEffect` truncate `veloxBatchRaw` accordingly |
| User edit videoList thêm dòng | `useEffect` append `""` vào `veloxBatchRaw[i]` — dòng mới không có URL, submit tạo task có resources rỗng |
| Conflict pop-up + user cancel | Velox không apply gì, form giữ nguyên |
| User uncheck row trong preview → toggle change → preview rebuild | Bug fix: `selected` state preserved qua Map lookup theo `rowId` (Velox v1.1) |
| Token expire giữa session | API trả 401 → toast error → user re-connect qua Settings |
| Pricing rule deleted khi user đang dùng | `selectedRule` returns null → priceUSD/wageVND = 0, toggle "Áp dụng bảng giá" effectively no-op |
| Network slow lúc scan | Spinner kéo dài, không timeout chính thức (browser default ~120s). User có thể retry. |

---

## 16. Configuration

### 16.1. Pricing Rules (Settings → Pricing Rules)

User tạo rule với 4 ruleType:

**flat** — fixed price:
```json
{ "priceUSD": 25, "wageVND": 650000 }
```

**per_minute** — rate × ceiling minutes:
```json
{ "ratePerMinuteUSD": 12, "wagePerMinuteVND": 300000 }
```

**tiered_duration** — bracket pricing:
```json
{
  "tiers": [
    { "maxDurationSeconds": 120, "priceUSD": 15, "wageVND": 390000 },
    { "maxDurationSeconds": 600, "priceUSD": 30, "wageVND": 780000 },
    { "maxDurationSeconds": null, "priceUSD": 50, "wageVND": 1300000 }
  ]
}
```

**custom** — JSON-formula based (advanced, ít dùng).

### 16.2. Scope

- `clientId = null` → workspace-wide default
- `clientId = X` → only applies khi Velox client picker chọn X (hoặc sub-client của X)
- `isDefault = true` → auto-select trong dropdown khi Velox khởi tạo

### 16.3. Connectors (Settings → Connectors)

UI có 2 cards (Dropbox + Google Drive). Mỗi card:
- Trạng thái: Disconnected / Connected (with account email)
- Button: Connect / Disconnect

OAuth flow:
1. Click Connect → redirect đến provider authorize URL
2. User grant permission → callback đến `/api/integrations/{provider}/callback`
3. Backend exchange code → token → encrypt → save `IntegrationToken` row
4. Redirect back to Settings → Connectors with `?connected=dropbox` query → toast success

---

## 17. Visual design (theo `ui-ux-standards.md`)

### 17.1. Glassmorphism

Mọi card/modal Velox dùng pattern:
```css
background: rgba(10, 10, 10, 0.95);
backdrop-filter: blur(24px);
border: 1px solid rgba(139, 92, 246, 0.15);  /* violet 15% */
border-radius: 24px;  /* rounded-3xl */
box-shadow: 0 32px 80px rgba(0, 0, 0, 0.60);
```

### 17.2. Brand colors

- **Primary**: `#8B5CF6` (violet) — Velox brand, primary CTA
- **Accent**: `#10B981` / `emerald-400` — Velox-filled field indicator, summary chip
- **Glow**: `text-shadow: 0 0 8px rgba(52, 211, 153, 0.5)` cho emerald glow effects

### 17.3. Typography

- **Font**: Plus Jakarta Sans (system font via `--font-sans`)
- **Headlines**: `font-extrabold` (800)
- **Body**: `font-medium` (500)
- **Labels (uppercase)**: `text-[10px] tracking-wide font-bold`

### 17.4. Animations

- Modal enter/exit: spring `stiffness: 260, damping: 28`
- Backdrop fade: 200ms
- Toggle/checkbox: 150ms ease-out
- Toast: bottom-right Sonner default

---

## 18. Verification / test scenarios

### 18.1. Local

```bash
npx tsc --noEmit         # 0 errors
npm run build            # ✓ Compiled successfully
```

### 18.2. End-to-end smoke tests

**Scenario A — Happy path N=1 video**:
1. Admin connect Dropbox qua Settings → Connectors
2. Tạo Pricing Rule "Tiered" với 3 brackets
3. Mở AddTaskModal → click 🚀 → Velox UI mở
4. Paste link folder Dropbox có 1 video
5. Pick Client "Jacob" → Pricing Rule auto-select
6. 8 toggle ON cần thiết → Áp dụng vào form
7. Wizard reappears với taskType, jobPriceUSD, editorFee, rawFootage, notes prefilled
8. Bấm "Add task" → task tạo thành công

**Scenario B — Happy path N≥2 videos**:
1. Same setup, link folder có 5 videos
2. Áp dụng → wizard reappears, rawFootage cell hiện chip "🚀 5/5 link đã được trích xuất từ Velox"
3. Click chip → VeloxRawFootagesModal mở
4. Edit URL của video #3 → Lưu
5. Bấm "Add task" → 5 tasks tạo qua createTasksFromBatch, mỗi task có raw URL riêng

**Scenario C — Conflict resolution**:
1. Mở AddTaskModal, gõ tay vào notes field
2. Click 🚀 → tick "Kế thừa ghi chú" có note source
3. Áp dụng → VeloxConflictDialog không hiện (vì append exception cho notes)
4. Form notes giờ là `[user input]\n[inherited]`

**Scenario D — Autosave persistence**:
1. Mở Velox → scan + apply
2. Trước khi bấm Add task, click X (close modal)
3. Mở lại AddTaskModal → toast "Đã khôi phục..." → form + chip rawFootage + green badges restore đầy đủ
4. Sau 3 phút idle không mở modal → draft expire

**Scenario E — Sub-client inheritance**:
1. Tạo client tree: Jacob → Jacob/Jayden → Jacob/Jayden/Bob
2. Tạo task cho Jacob/Jayden/Bob với notes "Inherit test"
3. Velox apply, pick client "Jacob" (parent) → tick Kế thừa ghi chú
4. Expected: toast hiện preview lấy từ task của Jacob/Jayden/Bob (sub-client recursion)

**Scenario F — Checkbox state preserve**:
1. Velox scan có 5 videos
2. Uncheck video #3
3. Toggle "Áp dụng bảng giá" off rồi on → preview rebuild
4. Expected: video #3 vẫn unchecked (state preserved qua Map lookup)

**Scenario G — Edge: no duration**:
1. Velox scan folder Dropbox không trả duration
2. Preview hiện `?` màu vàng cho duration
3. Toggle "Phân loại Short/Long" effective → fallback "Short form"
4. User nhập tay duration `1:30` → toggle "Áp dụng bảng giá" → price recalc

---

## 19. Future work / out of scope

### 19.1. Roadmap (chưa implement)

- **Multi-cam case**: 1 video có >1 raw link (multicam shoot) → badge "X link" trong rawFootage cell + sub-popup
- **Pricing rule clone**: copy 1 rule sang rule khác (UX faster setup)
- **Velox session save**: lưu Velox session để re-run / audit
- **Editor preference per video**: Velox auto-assign theo editor preference (vd: Jacob luôn assign cho Editor X)
- **Note merge top N**: gộp note từ top N tasks gần nhất thay vì chỉ task mới nhất
- **Trial type support**: classify Trial (currently chỉ Short/Long)
- **OneDrive / Vimeo / S3** providers (currently chỉ Dropbox + GDrive)

### 19.2. Known limitations

- Velox không tự tạo task → bắt buộc đi qua "Add task" / "Tạo tất cả" trong wizard
- Per-video edit chỉ raw URL, không có per-video type/price (đã user-reject UI lớn này v2 redesign)
- Subsidiary walk depth-limit 5 (hard-coded, có thể adjust nếu cần)
- Pricing rule không support per-day-of-week / time-of-day pricing (custom rule có thể, nhưng JSON-formula ít user friendly)

### 19.3. Out of scope hoàn toàn

- Velox không scan archive files (zip/rar) — chỉ folders với video trực tiếp
- Không support video streaming URL không phải Dropbox/GDrive (vd: Vimeo private link)
- Không có "Velox templates" save/load (user phải tick toggles mỗi lần)

---

## 20. Changelog

| Version | Date | Notes |
|---|---|---|
| 0.x | Pre-2026-05 | "Quick Create" — self-create tasks trực tiếp (parallel flow với AddTaskModal). 2 entry points, business rule duplication. |
| **1.0** | 2026-05-25 | **Refactor sang prefill helper**. Velox returns payload → AddTaskModal fills form → user clicks "Add task" để tạo. 1 entry point duy nhất. Spec v1.0 approved. |
| 1.0.1 | 2026-05-25 | Phase 2 Batch Table mode (9 cols × N rows) shipped, sau đó **rejected by user** ("UI thay đổi quá nhiều") → revert. |
| 1.0.2 | 2026-05-25 | Phase 2 redesign — keep wizard UI, per-video URLs vào popup `VeloxRawFootagesModal`. |
| 1.0.3 | 2026-05-26 | Phase 3 cleanup — xóa `createQuickTasks` legacy action, lock down `onApplyToForm` contract. |
| 1.0.4 | 2026-05-26 | Bug fix: checkbox bounce-back (preserve `selected` state qua previewRows rebuild). |
| **1.1** | 2026-05-26 | **Rebrand "Tạo Task Nhanh" / "Quick Create" → "Velox"** ở mọi user-visible string. "Kế thừa ghi chú tháng trước" → "Kế thừa ghi chú" + drop status filter (ANY status with notes, không chỉ Hoàn tất). |
| 1.1.1 | 2026-05-26 | Bug fix: autoSave flush-on-disable + include `veloxBatchRaw` + `veloxFilledFields` trong draft state. |

---

## 21. References

- **Original spec v1.0**: `C:\Users\Dareu\Downloads\Velox-Spec.md` (manager Dareu, 2026-05-25)
- **Plan file**: `C:\Users\Dareu\.claude\plans\kind-gliding-wren.md` (executed plan history)
- **UI/UX standards**: `.claude/rules/ui-ux-standards.md`
- **Safety protocol**: `.claude/rules/safety-protocol.md`
- **Logic mapping**: `.claude/rules/logic-mapping.md`

---

*End of spec.*
