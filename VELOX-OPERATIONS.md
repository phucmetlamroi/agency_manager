# Velox — Đặc tả vận hành & Template cấu hình per-client

**Project:** HustlyTasker (AgencyManager)
**Feature:** Velox (Tạo Task Nhanh từ folder Dropbox/Google Drive)
**Version:** v3.1 (Deep Scan)
**Status:** Shipped — production
**Last updated:** 2026-06-06
**Audience:** Manager (Dareu) + future operators tiếp quản Velox

> Tài liệu này tập trung vào **3 trục**: (1) cách Velox hoạt động end-to-end,
> (2) các luồng hoạt động chính + diagram, (3) **template cấu hình cho việc
> quét folder của khách hàng** (per-client preset — phần này là *mới*,
> VELOX.md hiện tại chưa cover). Để tham khảo chi tiết kỹ thuật (UI specs,
> color palette, glassmorphism standards…) xem `VELOX.md` ở root.

---

## Mục lục

1. [Tóm tắt 5 phút](#1-tóm-tắt-5-phút)
2. [Mô hình kiến trúc cấp cao](#2-mô-hình-kiến-trúc-cấp-cao)
3. [Các luồng hoạt động chính](#3-các-luồng-hoạt-động-chính)
4. [7 Pattern detection (P1-P7)](#4-7-pattern-detection-p1-p7)
5. [6 Manager Decisions (D1-D6)](#5-6-manager-decisions-d1-d6)
6. [Template cấu hình per-client](#6-template-cấu-hình-per-client) ← **trọng tâm**
7. [4 Template thực tế (Align West / A1 Decking / Barmoor / LGR)](#7-template-thực-tế-4-client)
8. [Checklist setup client mới](#8-checklist-setup-client-mới)
9. [Edge cases & troubleshooting](#9-edge-cases--troubleshooting)
10. [Reference: API, server actions, file map](#10-reference)

---

## 1. Tóm tắt 5 phút

### Velox là gì
Một **prefill helper** trong `AddTaskModal` — không tạo task trực tiếp, chỉ
điền sẵn form từ link folder cloud. Manager (ADMIN) vẫn phải bấm "Add task"
để xác nhận. Velox biến **5-step wizard × N video** thành **1 link folder →
1 click "Áp dụng" → 1 click "Add task"** (giảm thời gian thao tác **10×**).

### Đầu vào — Đầu ra

| Bước | Đầu vào | Đầu ra |
|---|---|---|
| Scan | URL folder Dropbox/GDrive | `ScanResultV3` (videos + pattern + broll + briefing) |
| Apply | Pattern + 8 toggle + Pricing Rule | `VeloxFormPrefill` → AddTaskModal fill form |
| Submit | Form đã review | N tasks tạo qua `createTasksFromBatch` |

### Truy cập
- Icon **🚀** ở header `AddTaskModal` (chỉ ADMIN thấy)
- Yêu cầu: connect Dropbox hoặc Google Drive ở `Settings → Connectors`

### Lý do tồn tại
Editor làm task cho client lặp lại theo tuần/tháng — folder convention của
mỗi client ổn định → Velox tận dụng pattern để fill toàn bộ form thay vì
gõ tay N lần (vd: 1 client như "LGR" có thể tạo 3-5 task/tuần với cấu trúc
`Video_N + Hook_N.mp4` rất nhất quán → manager gõ tay = lãng phí).

---

## 2. Mô hình kiến trúc cấp cao

```
┌─────────────────────────────────────────────────────────────┐
│                    USER (Manager / Admin)                   │
└──────────┬──────────────────────────────────────┬───────────┘
           │                                       │
           ▼                                       ▼
┌─────────────────────┐                  ┌────────────────────┐
│  AddTaskModal       │ ◄── prefill ───  │  QuickCreateMode   │
│  (5-step wizard)    │      payload     │  (Velox UI)        │
└──────────┬──────────┘                  └─────────┬──────────┘
           │                                       │
           │ handleApplyVelox(payload)             │ Scan
           │ → setForm(prefill)                    │ button
           │ → setVeloxBatchRaw([])                │
           │ → setQuickMode(false)                 ▼
           │                            ┌────────────────────┐
           │                            │  POST /api/        │
           │                            │  integrations/     │
           │                            │  scan-folder       │
           │                            └─────────┬──────────┘
           │                                      │
           │                                      ▼
           │                            ┌────────────────────┐
           │                            │ cloud-scanner.ts   │
           │                            │ recursiveScanFolder│
           │                            │ (Dropbox/GDrive)   │
           │                            └─────────┬──────────┘
           │                                      │ RawScanTree
           │                                      ▼
           │                            ┌────────────────────┐
           │                            │ scan-classifier.ts │
           │                            │ Phase 0-5          │
           │                            │ → ScanResultV3     │
           │                            └─────────┬──────────┘
           ▼                                      │
┌────────────────────────┐                        │
│ User reviews form      │ ◄──────────────────────┘
│ Edits inline           │      response
│ Clicks "Add task"      │
└──────────┬─────────────┘
           │
           ▼
┌─────────────────────────┐
│ DashboardActionWrapper  │
│ handleSubmit            │
│ → createTasksFromBatch  │ (N≥2 + per-row Velox)
│ → createTask            │ (N=1)
│ → createBatchTasks      │ (N≥2 non-Velox)
└──────────┬──────────────┘
           │
           ▼
       ┌───────┐
       │ DB    │ N task rows (atomic transaction)
       │ Tasks │
       └───────┘
```

### 3 lớp xử lý

| Lớp | File | Trách nhiệm |
|---|---|---|
| **Scan** | `src/lib/cloud-scanner.ts` | Gọi Dropbox/GDrive API, đệ quy 4 cấp, cap 500 files, trả `RawScanTree` |
| **Classify** | `src/lib/scan-classifier.ts` + `scan-classifier-helpers.ts` | 5 phase: wrapper-detect → inventory → subfolder-7-dim → root-file → pattern-decision (P1-P7) → trả `ScanResultV3` |
| **Apply** | `src/lib/velox-helpers.ts` + `src/actions/velox-helpers-actions.ts` | Map `ScanResultV3` + toggles + pricing → `VeloxFormPrefill` + per-task encoded `resources` string |

---

## 3. Các luồng hoạt động chính

### 3.1. Luồng A — Happy path đơn giản (N=1 video)

```
┌──────────────────────────────────────────────────────────────┐
│ 1. Admin click "+ Add Task" → AddTaskModal mở                │
│ 2. Click 🚀 ở header → QuickCreateMode swap content          │
│ 3. Paste link folder Dropbox/GDrive                          │
│ 4. Click "Scan" → spinner ~3-15s (Dropbox API)               │
│ 5. Preview hiện 1 row video                                  │
│ 6. Pick Client từ AutocompleteInput                          │
│ 7. PricingRule auto-select rule isDefault của client          │
│ 8. Tick toggles cần thiết (default ON: detect/link/classify/  │
│    name/pricing; default OFF: inherit/auto-assign/uniform)   │
│ 9. (Optional) Nhập titlePrefix vd: "[Tháng 5]"               │
│ 10. Click "Áp dụng vào form"                                 │
│ 11. Velox UI đóng → Wizard reappears với:                    │
│     - Step 1 (General Info): client, taskType, deadline,     │
│       assignee đã điền                                       │
│     - Step 2 (Video): videoList 1 dòng = title của video     │
│     - Step 3 (Finance): jobPriceUSD + editorFee từ pricing   │
│     - Step 4 (Assets): rawFootage = video.previewUrl,        │
│       script (nếu Velox detect được file .txt/.docx/.pdf)    │
│     - Step 5 (Notes): inheritedNote nếu toggle ON            │
│ 12. Green 🚀 badge xuất hiện trên các field Velox điền        │
│ 13. Admin review → click "Add task"                          │
│ 14. → createTask (single path) → toast success               │
└──────────────────────────────────────────────────────────────┘
```

**Routing rule (DashboardActionWrapper)**:
- `videoList.split('\n').length === 1` → `createTask`
- Vẫn dùng resources string format chuẩn

### 3.2. Luồng B — Multi-video với per-row URL (N≥2)

```
┌──────────────────────────────────────────────────────────────┐
│ Steps 1-10 giống Luồng A                                     │
│                                                              │
│ 11. Velox UI đóng → Wizard reappears với:                    │
│     - Step 4 (Assets): rawFootage cell KHÔNG hiện input,     │
│       thay vào đó là CHIP emerald:                           │
│       "🚀 N/total link đã được trích xuất từ Velox · Bấm     │
│        để chỉnh sửa"                                          │
│ 12. (Optional) Click chip → VeloxRawFootagesModal mở:        │
│     ┌─────────────────────────────────────────────┐         │
│     │ # │ Video title         │ Raw URL            │         │
│     │ 1 │ Video1.mp4          │ [https://...    ]  │         │
│     │ 2 │ Video2.mov          │ [https://...    ]  │         │
│     │ 3 │ Video3.mov          │ [                ]  │← empty │
│     └─────────────────────────────────────────────┘         │
│     - Title col readonly (sửa qua videoList chính)           │
│     - URL col editable per video                             │
│     - Lưu → propagate veloxBatchRaw[] về form state          │
│ 13. Click "Add task"                                         │
│ 14. handleSubmit phát hiện veloxBatchRaw.length === N === N≥2│
│ 15. → createTasksFromBatch(per-row data, exchangeRate)       │
│ 16. Backend transaction: tạo N tasks, mỗi task có:           │
│     - title = veloxRow[i].title                              │
│     - resources = encodeResourcesV3({                        │
│         RAW: veloxBatchRaw[i],                               │
│         RAW_HOOKS?, RAW_AROLL?, SHARED_xxx?, BROLL_xxx?,     │
│         BRIEF?                                                │
│       })                                                      │
│     - jobPriceUSD, wageVND, clientId, assigneeId, deadline... │
│ 17. Audit log: 1 bulk entry + N per-task entries             │
│ 18. Notify assignee (fan-out per task)                       │
│ 19. revalidatePath → toast success                           │
└──────────────────────────────────────────────────────────────┘
```

### 3.3. Luồng C — Deep Scan với pattern detection (Velox v3.1)

Đây là **bước Scan** mở rộng — chạy bên trong Luồng A/B step 4:

```
RawScanTree (từ cloud-scanner)
        │
        ▼
┌─────────────────────────────────┐
│ Phase 0: Wrapper detection      │ ← detect "outer wrapper folder"
│ - D5 layered confidence score   │   (e.g., "Project Name" chỉ chứa 1
│ - 3 signals: structure, non-    │    subfolder thực sự là main)
│   video files, keywords         │
│ - Output: isWrapper, confidence  │ → nếu wrapper → re-root vào sub
│                                  │
│ wrapperConfidence ≥ 5/10?       │
│ ├─ YES → drill down to subfolder│
│ └─ NO  → keep current root      │
└──────────────┬──────────────────┘
               ▼
┌─────────────────────────────────┐
│ Phase 1: Inventory               │
│ - Walk tree, collect:           │
│   • videoFiles (mp4/mov/...)    │
│   • briefingDocs (script/brief) │
│   • scriptDocs (.txt/.docx)     │
│   • sharedAssets (cta/outro)    │
│   • broll candidates             │
└──────────────┬──────────────────┘
               ▼
┌─────────────────────────────────┐
│ Phase 2: Subfolder 7-dim         │
│   classifier                     │
│ - Score each subfolder qua 7    │
│   dimensions:                    │
│   1. Video count                 │
│   2. Filename pattern (regex)   │
│   3. Keyword in folder name      │
│   4. Aspect ratio hint           │
│   5. Subfolder depth              │
│   6. Audio/script presence       │
│   7. Sibling correlation         │
│ - Output: SubfolderRole          │
│   ('main' | 'broll' | 'shared'   │
│    | 'brief' | 'ignore')         │
└──────────────┬──────────────────┘
               ▼
┌─────────────────────────────────┐
│ Phase 3: Root file classifier   │
│ - Each root-level video file    │
│   scored: 'main' vs 'broll' vs  │
│   'shared' (e.g., CTA.mp4 →     │
│   shared)                        │
└──────────────┬──────────────────┘
               ▼
┌─────────────────────────────────┐
│ Phase 4: Body+Hooks pairing      │
│   detector                       │
│ - Group filenames by base part   │
│   (vd: "Video1" + "Video1_Hook" │
│   → cùng 1 task)                 │
│ - D1 taskName mode:              │
│   A: "Video N"                   │
│   B: "{prefix} Video N"          │
│   C: "{prefix} Video N Body"     │
└──────────────┬──────────────────┘
               ▼
┌─────────────────────────────────┐
│ Phase 5: Pattern decision        │
│   matrix (P1-P7)                 │
│ - Apply rule table → primaryPat  │
│ - Confidence score 0.0-1.0      │
│ - Output: ScanResultV3 complete  │
└─────────────────────────────────┘
```

**Khi nào dùng Deep Scan**:
- Toggle `deepScan` default ON
- Tắt → fallback V1 flat scan (legacy, không pattern detection)

### 3.4. Luồng D — Conflict resolution

```
User mở AddTaskModal → gõ tay vào notes field
         ↓
User click 🚀 → tick "Kế thừa ghi chú" có note source
         ↓
User click "Áp dụng vào form"
         ↓
detectFieldConflicts(currentForm, prefill)
         ↓
    notes conflict?
   ┌────┴────┐
  YES        NO
   │          │
   ▼          ▼
inheritNotes ON?    applyVeloxPrefill('overwrite')
   ┌──┴──┐
  YES   NO
   │     │
   ▼     ▼
APPEND   show VeloxConflictDialog:
         ┌──────────────────────────────┐
         │ ○ Overwrite (Velox thắng)    │
         │ ○ Keep (user thắng)          │
         │ ○ Merge (list/text only)     │
         └─────────┬────────────────────┘
                   ▼
         User picks strategy
                   ▼
         applyVeloxPrefill(strategy)
```

**Note exception**: Khi `inheritNotes` toggle ON + form notes đã có chữ →
**tự động append** không hỏi (intent của tính năng kế thừa).

### 3.5. Luồng E — Autosave + restore

```
User mở AddTaskModal
        ↓
useAutoSaveDraft<{form, step, veloxBatchRaw, veloxFilledFields}>
        ↓
    Debounced save → localStorage[`addTask:draft:${workspaceId}`]
                     TTL 3 phút sliding
                                ↓
User click X (close modal trước khi submit)
        ↓
useEffect onUnmount → flush pending debounce SYNC
        ↓
localStorage giữ draft đầy đủ
        ↓
                        --- 30 phút sau ---
        ↓
User mở lại AddTaskModal
        ↓
useEffect restore:
  ├─ Đọc localStorage
  ├─ Check expiry (now - savedAt < TTL)
  │  ├─ Expired → delete entry, không restore
  │  └─ Valid → onRestore({form, step, veloxBatchRaw, veloxFilledFields})
  │              ↓
  │              Toast "Đã khôi phục bản nháp đang nhập dở"
  │              setForm + setStep + setVeloxBatchRaw + setVeloxFilledFields
  │              ↓
  │              UI hiện đầy đủ: chip emerald + green 🚀 badges
  ↓
User tiếp tục submit
        ↓
submitted=true → clearDraft → localStorage entry xóa
```

---

## 4. 7 Pattern detection (P1-P7)

> Phase 5 của classifier áp dụng decision matrix dưới đây để chọn `primaryPattern`.
> Pattern xác định cách build `mainItems[]` và `BrollV3` structure.

### P1 — Flat
**Cấu trúc folder**:
```
ClientFolder/
├── Video1.mp4
├── Video2.mp4
└── Video3.mov
```
**Output**: Mỗi video file = 1 task. Không có broll, không có pair.
**Confidence cao khi**: tất cả video ở root, không có subfolder hoặc subfolder ignore-able (CTA, raw assets).
**Use case**: Client đơn giản, chỉ gửi N video editable trực tiếp.

### P2 — Pair (Body + Hooks)
**Cấu trúc folder**:
```
ClientFolder/
├── Video1.mp4          ← body
├── Video1_Hook.mp4     ← hook (cùng base part "Video1")
├── Video2.mp4
└── Video2_Hook.mp4
```
**Output**: 2 task. Mỗi task có `RAW` (body) + `RAW_HOOKS` (hook) encoded vào resources.
**D1 quyết định taskName**: A="Video N" / B="{prefix} Video N" / C="{prefix} Video N Body".
**Confidence cao khi**: ≥50% video file match pair regex.

### P3 — Bundles (folder = task)
**Cấu trúc folder**:
```
ClientFolder/
├── Subfolder1/
│   ├── final.mp4
│   ├── broll-1.mp4
│   ├── broll-2.mp4
│   └── script.txt
├── Subfolder2/
│   ├── final.mp4
│   └── broll-1.mp4
└── CTA.mp4 (shared)
```
**Output**: 2 task (mỗi subfolder = 1 task). Resources: `RAW` (final) + `BROLL_GENERAL` per task + `SHARED_CTA` cho mọi task.
**Confidence cao khi**: ≥2 subfolder cùng cấu trúc + có shared assets ở root.
**Use case**: Client cao cấp, gửi gói "1 task = 1 folder" với asset đầy đủ.

### P4 — Triplet (output container)
**Cấu trúc folder**:
```
ClientFolder/
├── Output/
│   ├── Video1.mp4
│   ├── Video1_Hook.mp4
│   ├── Video2.mp4
│   └── Video2_Hook.mp4
└── BROLL SLO MO/
    ├── slowmo1.mp4
    └── slowmo2.mp4
```
**Output**: Pair tasks từ Output container + BROLL gắn cờ variant (slo-mo).
**Confidence cao khi**: 1 "main" container có pair pattern + 1 "broll" subfolder có variant keyword.

### P5 — Hybrid (per-video aroll + shared)
**Cấu trúc folder**:
```
ClientFolder/
├── Video1/
│   ├── body.mp4
│   └── aroll.mp4    ← per-video aroll
├── Video2/
│   ├── body.mp4
│   └── aroll.mp4
├── CTA.mp4          ← shared CTA
└── Brief.pdf        ← briefing doc
```
**Output**: Pair tasks (body+aroll) + `SHARED_CTA` + `BRIEF` auto-append vào notes_vi.
**D4 quyết định**: Có append briefing PDF vào notes_vi không (default ON, idempotent).

### P6 — Wrapper (outer folder bao bọc)
**Cấu trúc folder**:
```
ClientName_ProjectName_v2/   ← wrapper (chỉ chứa 1 subfolder thật)
└── Actual Project Folder/
    ├── ... (P1/P2/P3/P4/P5 thật ở đây)
```
**Detection**: Phase 0 wrapper score ≥5/10 (3 signals: structure, non-video files, keywords like "v2", "final", "delivery").
**Output**: Auto-drill xuống subfolder thật, classify lại như pattern thực sự.

### P7 — Chaos (camera dump)
**Cấu trúc folder**:
```
SD_Card_Dump/
├── DJI_001.mp4
├── DJI_002.mp4
├── DJI_003.mp4
├── ... (hàng chục/trăm files)
```
**Detection** (D6 strict 50% threshold): nếu ≥50% video file match camera regex (DJI_, GH5_, A001_C001_, ...).
**Output**: Treat tất cả videos là loose BROLL (`broll.looseFiles`), không tạo task. Manager phải hand-pick task names.
**Use case**: Client gửi nguyên SD card dump — Velox không tự đoán được task structure.

### Decision matrix (Phase 5)

| Điều kiện | Pattern |
|---|---|
| Camera dump ratio ≥ 50% | P7 |
| Wrapper score ≥ 5 | P6 → re-root |
| ≥2 subfolder có cùng schema main+broll | P3 |
| 1 container có pair + 1 broll variant subfolder | P4 |
| ≥2 subfolder có per-video aroll + shared root assets | P5 |
| ≥50% root video có pair regex | P2 |
| Default | P1 |

---

## 5. 6 Manager Decisions (D1-D6)

> Quyết định mà classifier cần đến **input từ manager** (hoặc preset per-client).
> Hiện tại Velox UI cho phép override D1, D2, D4. D3 chưa expose. D5+D6 là internal tuning.

### D1 — TaskName mode (P2/P4/P5)
Khi gặp pair pattern, chọn format đặt tên task:

| Mode | Pattern | Ví dụ |
|---|---|---|
| **A** | `Video N` | `Video 1`, `Video 2`, `Video 3` |
| **B** | `{prefix} Video N` | `[Tháng 5] Video 1`, ... |
| **C** | `{prefix} Video N Body` | `LGR Video 1 Body` (giữ chữ "Body" để phân biệt body vs hook) |

**UI**: `VeloxTaskNameSelector` dropdown trong QuickCreateMode khi pattern là P2/P4/P5.

### D2 — Broll match policy
Khi có BROLL files, quyết định match per-video hay shared:

| Policy | Hành vi |
|---|---|
| **general** | Mọi BROLL → mọi task (vd: broll chung "scenery" áp dụng cho cả 5 video) |
| **per-video** | Match BROLL theo tag trong tên (vd: `broll_video1.mp4` → task 1) |
| **shared** | BROLL khác level (root) → áp dụng cho mọi task; per-video aroll vào riêng từng task |
| **CUSTOM** | Mở `VeloxBrollManagerModal` cho manager chọn từng BROLL → task nào |
| **PENDING_USER_CONFIRM** | Gate — không apply tới khi manager chọn (default khi classifier không tự tin) |

**UI**: `VeloxBrollMatchSelector` (inline picker) → CUSTOM mở `VeloxBrollManagerModal`.

### D3 — Variant priority (broll keyword)
Chưa expose UI. Internal: BROLL filename có chứa variant keyword nào (slo-mo / drone / aerial / wide / close-up...) → tag vào `BrollV3.variants[]`.

### D4 — Brief auto-append
Khi classifier tìm thấy `briefingDocs[]` (PDF/script ở root), có tự động append nội dung vào `notes_vi` của mọi task không?

- Default **ON** (idempotent — nếu rerun, không duplicate)
- Format trong notes_vi: hyperlink markdown `[Brief title](url)` + per-task indent
- **UI**: `VeloxBriefBanner` cho phép toggle off + preview list

### D5 — Wrapper confidence threshold
Internal tuning: Phase 0 score ≥ N → mới đề xuất drill. Hiện tại N=5/10.

3 signals contribute:
1. **Structure score** (0-4): wrapper folder chỉ có 1 subfolder thực sự, các file khác là junk (cover.jpg, project.aep)
2. **Non-video file presence** (0-3): có file `.aep`, `.psd`, `.txt`, `.pdf` ở wrapper level
3. **Keyword match** (0-3): folder name match regex `v\d+|final|delivery|deliverable|project|draft`

### D6 — P7 strict threshold
Camera dump detection ratio. Hiện tại 50% — phải có ≥50% file match camera regex để gán P7.

Mục đích: tránh false positive cho client gửi mix camera footage + edited content.

---

## 6. Template cấu hình per-client

> Đây là **phần mới** mà VELOX.md hiện chưa cover. Tài liệu hoá cách áp dụng
> preset per-client để Velox skip pattern detection (hoặc bias preset) khi
> client X luôn dùng cấu trúc cố định.

### 6.1. Bài toán

Hiện tại Velox tự động detect pattern qua Phase 0-5. **Nhược điểm**:
- Cùng 1 client → mỗi folder lại có thể drift sang pattern khác (do editor uploader khác habit)
- Manager phải confirm `brollMatchPolicy` mỗi lần (D2 PENDING)
- Một số client có quy ước phức tạp mà classifier không tự đoán hết (vd: LGR luôn dùng task name mode C nhưng classifier mặc định A)

**Giải pháp**: cho phép manager **lưu preset cho mỗi client** — Velox đọc preset trước khi apply pattern, override các default mặc định.

### 6.2. Schema đề xuất

```typescript
// New Prisma model
model ClientVeloxTemplate {
    id                String   @id @default(uuid())
    clientId          Int      @unique  // 1:1 với Client
    client            Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)
    workspaceId       String
    workspace         Workspace @relation(fields: [workspaceId], references: [id])
    profileId         String

    // Pattern preset — 'AUTO' = để classifier tự detect (mặc định hiện tại)
    expectedPattern   String   @default("AUTO")  // 'AUTO'|'P1'|'P2'|'P3'|'P4'|'P5'|'P6'|'P7'

    // D1 taskName mode
    taskNameMode      String   @default("AUTO")  // 'AUTO'|'A'|'B'|'C'

    // D2 broll match policy default
    brollMatchPolicy  String   @default("AUTO")  // 'AUTO'|'general'|'per-video'|'shared'

    // D4 brief append default
    appendBriefToNotes Boolean @default(true)

    // Pricing rule reference
    pricingRuleId     String?  // null = inherit từ PricingRule isDefault của workspace

    // Velox UI defaults
    titlePrefix       String?  // vd: "[LGR]" → tự fill vào Velox UI titlePrefix
    inheritNotes      Boolean  @default(false)  // Default state cho toggle "Kế thừa ghi chú"
    autoAssign        Boolean  @default(false)  // Default state cho toggle "Gán editor tự động"

    // Shared asset expectations — manager declare loại shared asset client thường gửi
    sharedAssetExpectations Json  // ["CTA", "OUTRO", "INTRO", "LOGO", "BUMPER"]

    // Manager notes / runbook
    notes             String?  @db.Text  // freeform — workflow tips, exceptions

    // Audit
    createdBy         String
    updatedAt         DateTime @updatedAt
    createdAt         DateTime @default(now())

    @@index([workspaceId, clientId])
}
```

**Quan hệ**:
- `Client` 1:1 `ClientVeloxTemplate` (cascade delete khi client xóa)
- `PricingRule` referenced lỏng (id, cascade SetNull nếu rule bị xóa)

### 6.3. Luồng áp dụng template (đề xuất)

```
User mở AddTaskModal → click 🚀 → Velox UI mở
         ↓
User paste link folder → click "Scan"
         ↓
Backend: cloud-scanner → RawScanTree
         ↓
Frontend: detect clientId từ folder URL hoặc folder name?
         ├─ Có client autodetect (vd: folder name = "LGR_May_2026")
         │  → preload ClientVeloxTemplate trong response
         └─ Không → trả classifier output bình thường, user pick client sau
         ↓
QuickCreateMode setScannedVideos(videos)
         ↓
useEffect khi clientId đổi → fetch ClientVeloxTemplate
         ├─ Template tồn tại + expectedPattern != 'AUTO'
         │  → Override classifier output:
         │    - primaryPattern = template.expectedPattern
         │    - taskNameMode = template.taskNameMode (nếu != AUTO)
         │    - brollMatchPolicy = template.brollMatchPolicy (nếu != AUTO)
         │    - autoAppendBrief = template.appendBriefToNotes
         │  → setTitlePrefix(template.titlePrefix)
         │  → setToggle('inheritNotes', template.inheritNotes)
         │  → setToggle('autoAssign', template.autoAssign)
         │  → setSelectedPricingRule(template.pricingRuleId)
         │  → setSharedAssetsExpected(template.sharedAssetExpectations)
         │  → toast "Đã áp template cho ${client.name}"
         │
         └─ Template không tồn tại → behave như hiện tại (full classifier)
         ↓
User review preview → bấm "Áp dụng vào form"
         ↓
... (giống Luồng A/B)
```

### 6.4. UI surface đề xuất

**Vị trí**: `Settings → Clients → [pick client] → tab "Velox Template"`

**Layout**:
```
┌──────────────────────────────────────────────────────────────┐
│ ▼ Velox Template — Client: LGR                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ Pattern preset                                               │
│ ○ AUTO (để Velox tự đoán pattern mỗi lần)                   │
│ ○ P1 Flat        ○ P2 Pair       ○ P3 Bundles               │
│ ○ P4 Triplet     ● P5 Hybrid     ○ P6 Wrapper               │
│ ○ P7 Chaos                                                   │
│                                                              │
│ Task name mode (chỉ áp dụng cho P2/P4/P5)                   │
│ ○ AUTO  ○ A (Video N)  ○ B (Prefix Video N)  ● C (Body)     │
│                                                              │
│ Broll match policy                                           │
│ ○ AUTO  ○ general  ● per-video  ○ shared                    │
│                                                              │
│ ☑ Tự động append brief PDF vào notes (D4)                   │
│                                                              │
│ Title prefix                                                 │
│ [LGR]                                                        │
│                                                              │
│ Default toggles                                              │
│ ☐ Kế thừa ghi chú       ☑ Gán editor tự động                │
│                                                              │
│ Pricing rule                                                 │
│ [LGR Pricing v2 ▾]                                           │
│                                                              │
│ Shared asset expectations                                    │
│ ☑ CTA   ☑ OUTRO   ☐ INTRO   ☐ LOGO   ☐ BUMPER               │
│                                                              │
│ Manager notes (workflow tips, exceptions)                    │
│ ┌────────────────────────────────────────────────────────┐  │
│ │ LGR thường upload folder name "LGR_<Month>_<Year>".    │  │
│ │ Body files đặt tên "{N}_body.mp4", hook = "{N}_hook".  │  │
│ │ Có khi gửi thêm 1 video brief khoảng 30s — đừng tạo    │  │
│ │ task cho video đó (filter manual).                     │  │
│ └────────────────────────────────────────────────────────┘  │
│                                                              │
│ [Hủy]                          [Reset to AUTO]   [Lưu]      │
└──────────────────────────────────────────────────────────────┘
```

### 6.5. Server actions (đề xuất)

```typescript
// src/actions/client-velox-template-actions.ts (file mới)

export async function getClientVeloxTemplate(
    clientId: number,
    workspaceId: string
): Promise<ClientVeloxTemplate | null>

export async function upsertClientVeloxTemplate(
    clientId: number,
    workspaceId: string,
    input: Partial<ClientVeloxTemplate>
): Promise<ClientVeloxTemplate>

export async function deleteClientVeloxTemplate(
    clientId: number,
    workspaceId: string
): Promise<{ success: boolean }>

// Modify existing /api/integrations/scan-folder/route.ts:
// - Accept optional `clientId` query param (manager pre-selects)
// - If clientId provided, fetch template + bias classifier
// - Return ScanResultV3 + appliedTemplate? in response
```

### 6.6. Implementation phases (đề xuất 4 PR)

| PR | Scope | Effort |
|---|---|---|
| **PR-T1** | Schema + Prisma migration + actions (getter/upsert/delete) + minimal smoke test | ~2-3h |
| **PR-T2** | UI surface trong Settings → Clients (tab Velox Template) — form + save | ~3-4h |
| **PR-T3** | Wire template vào QuickCreateMode — auto-load khi clientId đổi + override defaults | ~2-3h |
| **PR-T4** | Pattern bias trong classifier — khi `expectedPattern != AUTO`, skip Phase 5 decision matrix | ~1-2h |
| **PR-T5** | Tài liệu hoá + per-client template runbook (file này) + train workflow cho manager | ~1h |

**Tổng thời gian: ~10-13h** cho full feature.

---

## 7. Template thực tế (4 client)

> Dựa trên test scenarios từ VELOX.md section 21 (Deep Scan v3.1 verified
> với 4 client thật). Dưới đây là YAML preview của template per-client —
> nếu/khi `ClientVeloxTemplate` được implement, manager sẽ tạo những entry
> như sau.

### 7.1. Align West (outer wrapper drill → P3)

```yaml
client: Align West
expectedPattern: P3
taskNameMode: A  # Video N (bundle folder name → task title fallback)
brollMatchPolicy: per-video
appendBriefToNotes: true
titlePrefix: "[AW]"
inheritNotes: false   # AW không reuse template note
autoAssign: true
pricingRule: "Align West — Bundle Pricing"
sharedAssetExpectations: [CTA, OUTRO]

managerNotes: |
  AW thường upload folder structure:
    AW_Delivery_v2/        ← wrapper (auto-drill)
    └── Project Name/
        ├── Bundle1/
        │   ├── final.mp4
        │   ├── broll/
        │   └── script.txt
        ├── Bundle2/
        └── CTA.mp4

  Wrapper layer "AW_Delivery_v{N}" → Phase 0 auto-drill (confidence ~7/10).
  Mỗi bundle subfolder → 1 task. Broll trong subfolder = per-video.
  CTA ở root level → shared asset.

  Exception: nếu folder chỉ có 1 bundle → có thể là P1 flat — uncheck preset
  expectedPattern → AUTO để Velox tự decide.
```

**Verified output (từ Deep Scan PR4)**:
- `primaryPattern: P6 → P3` (drill xong)
- 4 bundle tasks + `BROLL_PERVIDEO` per task + `BRIEF` auto-append + `SHARED_CTA`

### 7.2. A1 Decking (P2 pair)

```yaml
client: A1 Decking
expectedPattern: P2
taskNameMode: A
brollMatchPolicy: shared  # general broll áp dụng cho tất cả + per-video pair-specific
appendBriefToNotes: false  # A1 không có brief
titlePrefix: "A1"
inheritNotes: true  # A1 reuse template note tháng trước
autoAssign: true
pricingRule: "A1 Decking — Tiered"

sharedAssetExpectations: []  # không có shared asset

managerNotes: |
  A1 cấu trúc:
    A1_Project/
    ├── Video1.mp4
    ├── Video1_hook.mp4
    ├── Video2.mp4
    ├── Video2_hook.mp4
    ├── BROLL_general/
    │   ├── broll1.mp4
    │   └── broll2.mp4
    └── BROLL_perVideo/
        ├── Video1_broll.mp4
        └── Video2_broll.mp4

  → P2 pair detection (50%+ video match {N}_hook regex).
  Broll có 2 kiểu: general (chung cho mọi task) + per-video (match theo tag {N}).

  Use case quan trọng: A1 mỗi tháng đổi template style — note tháng trước
  vẫn relevant 90% → tick "Kế thừa ghi chú" default ON.
```

**Verified output**:
- `primaryPattern: P2`
- 2 pair tasks + `BROLL_GENERAL` + `BROLL_PERVIDEO` + `BROLL_LOOSE` (5 DJI files chưa classify được)

### 7.3. Barmoor (P4 triplet)

```yaml
client: Barmoor
expectedPattern: P4
taskNameMode: A
brollMatchPolicy: general  # broll subfolder áp dụng cho tất cả task trong output container
appendBriefToNotes: false
titlePrefix: ""  # Barmoor không cần prefix
inheritNotes: false
autoAssign: true
pricingRule: "Barmoor — Flat $25/video"

sharedAssetExpectations: []

managerNotes: |
  Barmoor cấu trúc:
    Barmoor_Week_N/
    ├── Output/                      ← main container
    │   ├── Video1.mp4
    │   ├── Video1_Hook.mp4
    │   ├── Video2.mp4
    │   ├── Video2_Hook.mp4
    │   ├── Video3.mp4
    │   ├── Video3_Hook.mp4
    │   └── Video4.mp4
    │       (no hook for Video4 — OK)
    └── BROLL SLO MO/                ← variant broll
        ├── slowmo1.mp4
        └── slowmo2.mp4

  → P4 triplet: 1 main container có pair pattern + 1 broll subfolder có
  variant keyword "SLO MO" / "slowmo".

  Hook không phải video nào cũng có → Velox vẫn pair khi có, đơn lẻ khi không.

  Broll SLO MO → variant tag, áp dụng general cho mọi task trong Output.
```

**Verified output**:
- `primaryPattern: P4`
- 4 pair tasks từ Output container + `RAW_HOOKS` per task + `BROLL_GENERAL` variant=slo-mo

### 7.4. LGR (P5 hybrid)

```yaml
client: LGR
expectedPattern: P5
taskNameMode: C  # "{prefix} Video N Body" — LGR convention giữ chữ "Body"
brollMatchPolicy: per-video  # mỗi video có aroll riêng
appendBriefToNotes: true
titlePrefix: "LGR"
inheritNotes: true  # LGR reuse template note rất hữu ích
autoAssign: true
pricingRule: "LGR — Tiered (Short/Long)"

sharedAssetExpectations: [CTA]  # LGR luôn có CTA chung

managerNotes: |
  LGR cấu trúc (rất nhất quán):
    LGR_<Month>_<Year>/
    ├── Video1/
    │   ├── body.mp4
    │   └── aroll.mp4
    ├── Video2/
    │   ├── body.mp4
    │   └── aroll.mp4
    ├── Video3/
    │   ├── body.mp4
    │   └── aroll.mp4
    ├── CTA.mp4
    └── Brief.pdf

  → P5 hybrid: per-video aroll trong subfolder + shared CTA + brief PDF.

  IMPORTANT: LGR task name dùng mode C — "{prefix} Video N Body" để phân
  biệt task body vs task aroll (về sau có thể có task aroll riêng).

  Inherit notes: LGR có template note cố định ("CTA luôn xuất hiện 5s
  cuối, dùng intro template X..."), inherit từ task tháng trước rất hữu ích.

  Brief PDF có chứa instructions cụ thể per video → append vào notes_vi
  giúp editor không phải mở file PDF riêng.
```

**Verified output**:
- `primaryPattern: P5`
- 3 pair tasks + `RAW_AROLL` per task + `SHARED_CTA` + `BRIEF` auto-append

### 7.5. Bảng tổng hợp 4 templates

| Client | Pattern | TaskName | BrollMatch | Brief | Prefix | Inherit | AutoAssign |
|---|---|---|---|---|---|---|---|
| Align West | P3 (auto-drill từ P6) | A | per-video | ✅ | `[AW]` | ❌ | ✅ |
| A1 Decking | P2 | A | shared | ❌ | `A1` | ✅ | ✅ |
| Barmoor | P4 | A | general | ❌ | (none) | ❌ | ✅ |
| LGR | P5 | C | per-video | ✅ | `LGR` | ✅ | ✅ |

---

## 8. Checklist setup client mới

> Khi onboarding client mới, manager nên đi qua checklist này để build
> template chuẩn (giúp giảm thời gian Velox apply từ ~30s/lần → ~5s/lần).

### Bước 1: Quan sát 1-2 folder thực tế (15 phút)
- Yêu cầu client gửi link folder của 1-2 project gần nhất
- Manager mở Dropbox/GDrive xem cấu trúc tay
- Note xuống:
  - Có wrapper layer (`Client_Name_v2/`) không?
  - Root có chứa video file hay chỉ subfolder?
  - Cấu trúc subfolder: per-video pair, per-video bundle, hay flat?
  - Có shared assets (CTA, intro, outro, brief) ở root không?
  - Briefing doc có không (.pdf, .docx, .txt)?
  - Tên file có pattern không (vd: `Video{N}_hook.mp4`)?
  - Camera dump count (số file raw chưa edit)?

### Bước 2: Map sang 7 pattern (5 phút)
Dùng decision matrix Section 4 để chọn pattern:
- Nếu thấy mỗi project = 1 folder con với asset đầy đủ → **P3**
- Nếu mỗi video có file `_hook` cùng tên → **P2**
- Nếu có output container + broll subfolder riêng → **P4**
- Nếu mỗi video subfolder có aroll + shared root → **P5**
- Nếu chỉ là list video flat → **P1**
- Nếu camera dump >50% → **P7** (Velox không tạo task tự động)

### Bước 3: Tạo PricingRule (10 phút)
- Vào `Settings → Pricing Rules`
- Click "+ Add Rule"
- Nhập:
  - **Name**: `"{Client} — {Pricing model}"` (vd: `"LGR — Tiered"`)
  - **clientId**: link client mới
  - **ruleType**: chọn 1 trong 4
  - **config**: JSON theo schema
  - **isDefault**: ✅ nếu là rule mặc định khi pick client này
- 4 ruleType reference:

```yaml
# flat
{ priceUSD: 25, wageVND: 650000 }

# per_minute
{ ratePerMinuteUSD: 12, wagePerMinuteVND: 300000 }

# tiered_duration
{
  tiers: [
    { maxDurationSeconds: 120, priceUSD: 15, wageVND: 390000 },
    { maxDurationSeconds: 600, priceUSD: 30, wageVND: 780000 },
    { maxDurationSeconds: null, priceUSD: 50, wageVND: 1300000 }  # null = catch-all
  ]
}

# custom (JSON formula — advanced)
{
  formula: "duration < 60 ? 10 : duration < 180 ? 25 : 40",
  variables: ["duration"]
}
```

### Bước 4: Tạo ClientVeloxTemplate (5 phút) — *nếu/khi implement*
- Vào `Settings → Clients → {client} → tab Velox Template`
- Pick `expectedPattern` từ Bước 2
- Pick `taskNameMode`:
  - **A** mặc định cho hầu hết client (Video N)
  - **B** nếu cần prefix (vd: `[Tháng 5] Video N`)
  - **C** nếu phân biệt body vs hook trong title (LGR convention)
- Pick `brollMatchPolicy`:
  - **general** nếu BROLL chung cho mọi task
  - **per-video** nếu mỗi task có BROLL riêng
  - **shared** nếu mix shared (root) + per-video
  - **AUTO** nếu không chắc — Velox sẽ gate qua D2 PENDING
- Tick `appendBriefToNotes` nếu client thường gửi brief PDF
- Nhập `titlePrefix` nếu muốn auto-prepend
- Set default toggles:
  - `inheritNotes`: ✅ nếu client có template note cố định, ❌ nếu mỗi project là one-off
  - `autoAssign`: ✅ thường nên ON
- Pick `pricingRule` từ Bước 3
- Tick `sharedAssetExpectations` các loại client thường gửi
- Viết `managerNotes` — workflow tips, exceptions

### Bước 5: First scan validation (10 phút)
- Mở `AddTaskModal → 🚀 Velox`
- Paste link folder mẫu
- Pick client mới → template auto-load (preset apply)
- Click Scan → verify `primaryPattern` match expectation
- Click "Áp dụng vào form" → verify form fields đúng:
  - Title pattern đúng theo `taskNameMode`
  - Resources string có đúng BROLL/SHARED/BRIEF mong đợi
  - Price match Pricing Rule
- Click "Add task" → verify N task tạo thành công + audit log có entry

### Bước 6: Iterate (theo dõi 5-10 lần scan đầu)
- Mỗi lần scan, để ý:
  - Pattern detection có cần override không (manager UI sửa preset)
  - BROLL match có đúng D2 policy không
  - Brief append có duplicate không (D4 idempotent check)
  - Task count match expectation
- Sau 5-10 lần → template ổn định, save final state

---

## 9. Edge cases & troubleshooting

### 9.1. Folder rỗng / không có video
- **Triệu chứng**: Scan → toast warning "Folder không có video nào."
- **Nguyên nhân**: Folder chỉ có doc/image/audio, hoặc OAuth scope không đọc được folder
- **Fix**: Manager check link đúng folder không phải file individual; check Connector OAuth scope còn valid

### 9.2. Dropbox không trả duration
- **Triệu chứng**: Preview hiện `?` màu vàng ở cột Duration
- **Nguyên nhân**: Dropbox API metadata không include duration (file mới upload, chưa transcode)
- **Fix**: Manager gõ duration tay (`1:30` hoặc `90`) → toggle "Áp dụng bảng giá" recalc price

### 9.3. User chưa OAuth provider
- **Triệu chứng**: Scan → error `requiresConnection: true`
- **Fix**: Toast hint → `Settings → Connectors → Connect Dropbox / Google Drive`

### 9.4. Pattern mismatch với template
- **Triệu chứng**: Velox detect P2 nhưng template preset P5 (overrides applied)
- **Behavior**: Override luôn thắng → task structure theo template, nhưng confidence thấp
- **Fix**:
  - Nếu manager confirm template đúng → ignore warning, submit
  - Nếu folder thực sự sai pattern → temporarily set `expectedPattern: AUTO` cho scan này

### 9.5. Multi-cam case (1 video có >2 link raw)
- **Triệu chứng**: Folder có `Video1_CamA.mp4`, `Video1_CamB.mp4`, `Video1_CamC.mp4`
- **Behavior hiện tại**: Velox tạo 3 task riêng (mỗi file 1 task)
- **Workaround**: Manager merge thủ công sau khi tạo (uncheck 2 row trong preview, chỉ tạo 1 task → sửa resources tay)
- **Out-of-scope**: Multi-cam dedup → roadmap future

### 9.6. Conflict pop-up + user cancel
- **Triệu chứng**: VeloxConflictDialog → user pick "Hủy"
- **Behavior**: Velox không apply gì, form giữ nguyên user input
- **Manager note**: dialog không tự đóng — phải pick strategy explicit

### 9.7. Token expire giữa session
- **Triệu chứng**: Scan → toast error 401/403
- **Fix**:
  - Dropbox: token long-lived, hiếm khi expire → check IntegrationToken.expiresAt
  - GDrive: refresh token tự động, nếu vẫn fail → re-connect ở Settings

### 9.8. Pricing rule deleted khi user đang dùng template
- **Triệu chứng**: Velox apply → priceUSD = 0, wageVND = 0
- **Nguyên nhân**: `ClientVeloxTemplate.pricingRuleId` không null nhưng rule đã bị xóa (cascade SetNull)
- **Fix**: Template UI hiển thị warning red "Pricing rule đã bị xóa — chọn rule khác" → blocking save

### 9.9. Folder name có Unicode/diacritic
- **Triệu chứng**: Pattern detect đúng nhưng task name có ký tự lạ
- **Nguyên nhân**: Filename normalize qua Unicode NFC chưa hoàn hảo
- **Fix**: Manager edit tay trong videoList Step 2 trước khi submit

### 9.10. Wrapper drill confidence thấp (4-5/10)
- **Triệu chứng**: Velox auto-drill nhưng pattern result yếu (confidence < 0.6)
- **Behavior**: VeloxDiagnosticPanel hiện "Xem chi tiết" panel → manager xem breakdown
- **Fix**:
  - Pin template với `expectedPattern: P6 → {inner pattern}` để force drill
  - Hoặc unset wrapper, scan từ inner folder URL trực tiếp

---

## 10. Reference

### 10.1. API endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/integrations/scan-folder` | POST | Scan folder → ScanResultV3. `?v=1` escape hatch → V1 flat scan |
| `/api/integrations/dropbox/authorize` | GET | OAuth start |
| `/api/integrations/dropbox/callback` | GET | OAuth exchange code → token (encrypted save) |
| `/api/integrations/google-drive/authorize` | GET | Same |
| `/api/integrations/google-drive/callback` | GET | Same |

### 10.2. Server actions

| Action | File | Purpose |
|---|---|---|
| `getLastClientNote(clientId, workspaceId)` | `velox-helpers-actions.ts` | Sub-client recursion + ANY status note pull |
| `suggestRoundRobinAssignee(workspaceId)` | `velox-helpers-actions.ts` | Lowest workload editor |
| `createTasksFromBatch(rows, exchangeRate)` | `velox-batch-actions.ts` | Atomic N-task create với per-row resources |
| `getClientVeloxTemplate(clientId, workspaceId)` | *(proposed)* `client-velox-template-actions.ts` | Read template per client |
| `upsertClientVeloxTemplate(clientId, workspaceId, input)` | *(proposed)* | Create/update template |

### 10.3. File map chi tiết

**Scan engine**:
- `src/lib/cloud-scanner.ts` — `recursiveScanFolder` (Dropbox + GDrive)
- `src/lib/cloud-link-parser.ts` — Parse URL → provider + folder ID
- `src/lib/scan-classifier.ts` — 5-phase classifier
- `src/lib/scan-classifier-helpers.ts` — regex, scoring, taskName resolver
- `src/lib/velox-helpers.ts` — Types + encodeResourcesV3 + mapPayloadV3ToFormData

**Server actions / API**:
- `src/actions/velox-helpers-actions.ts` — inherit notes + round-robin
- `src/actions/velox-batch-actions.ts` — atomic N-task create
- `src/actions/pricing-rule-actions.ts` — PricingRule CRUD
- `src/actions/integration-actions.ts` — OAuth + IntegrationToken management
- `src/app/api/integrations/scan-folder/route.ts` — Scan endpoint

**UI components**:
- `src/components/dashboard/AddTaskModal.tsx` — Wizard host
- `src/components/dashboard/QuickCreateMode.tsx` — Velox UI (toggles + scan + preview)
- `src/components/dashboard/VeloxRawFootagesModal.tsx` — Per-video URL popup
- `src/components/dashboard/VeloxConflictDialog.tsx` — Conflict resolution
- `src/components/dashboard/VeloxPatternBanner.tsx` — P1-P7 pattern info banner
- `src/components/dashboard/VeloxBriefBanner.tsx` — D4 briefing toggle
- `src/components/dashboard/VeloxTaskNameSelector.tsx` — D1 mode dropdown
- `src/components/dashboard/VeloxBrollMatchSelector.tsx` — D2 policy picker
- `src/components/dashboard/VeloxBrollManagerModal.tsx` — D2 CUSTOM modal
- `src/components/dashboard/VeloxPairExpandRow.tsx` — Pair expansion inline
- `src/components/dashboard/VeloxDiagnosticPanel.tsx` — Diagnostic collapsible
- `src/components/settings/ConnectorsPanel.tsx` — OAuth setup UI
- `src/components/settings/PricingRulesPanel.tsx` — Pricing Rule CRUD UI

**Configuration files**:
- `VELOX.md` — Spec đầy đủ (1183 lines)
- `VELOX-OPERATIONS.md` — Tài liệu này (focused: workflows + per-client templates)
- `VELOX-DEEP-SCAN.md` — Spec gốc cho v3.1 (`~/Downloads/`)

### 10.4. Type definitions chính

```typescript
// src/lib/velox-helpers.ts

export interface ScanResultV3 {
    videos: ScannedVideo[]              // V1 backward-compat
    primaryPattern: PrimaryPattern      // 'P1'|'P2'|'P3'|'P4'|'P5'|'P7'
    isWrapper: boolean
    wrapperConfidence: number           // 0-10
    confidence: number                  // 0.0-1.0
    mainItems: MainItem[]               // per-task: file/pair/folder-bundle
    broll: BrollV3 | null
    brollMatchPolicy: BrollMatchPolicy  // 'PENDING_USER_CONFIRM' | 'general' | 'per-video' | 'shared' | 'CUSTOM'
    sharedAssets: SharedAsset[]
    briefingDocs: BriefingDoc[]
    scriptDocs?: ScriptDoc[]
    warnings: string[]
    diagnostics: ScanDiagnosticsV3
    appliedTemplate?: AppliedTemplate   // (proposed) marker khi template per-client kích hoạt
}

export interface MainItem {
    type: 'file' | 'pair' | 'folder-bundle'
    title: string
    url: string                          // primary RAW URL
    hookUrl?: string                     // pair only
    arollUrl?: string                    // P5 hybrid
    bundleAssets?: BundleAsset[]         // P3 bundles
    durationSeconds: number
    perVideoBroll?: PerVideoBrollFolder[]
}

export interface BrollV3 {
    generalFolder?: BrollFolder          // Mọi task áp dụng
    perVideoFolders?: PerVideoBrollFolder[]  // Match theo tag
    looseFiles: FileEntry[]              // Chưa classify
    variants: BrollVariant[]             // Tag: slo-mo, drone, aerial, wide, close-up
}

export interface SharedAsset {
    type: 'CTA' | 'OUTRO' | 'INTRO' | 'LOGO' | 'BUMPER' | 'OTHER'
    title: string
    url: string
    durationSeconds: number
}

export interface BriefingDoc {
    type: 'brief' | 'script' | 'reference'
    title: string
    url: string
    extractedText?: string               // Text trích từ PDF (D4 append vào notes_vi)
}
```

### 10.5. Encoded resources format

`encodeResourcesV3` packs per-task assets vào 1 string ngắn để fit `Task.resources` (legacy field):

```
RAW: <url>
RAW_HOOKS: <url>                 (P2/P4 pair)
RAW_AROLL: <url>                 (P5 hybrid)
BROLL_GENERAL: <url1>|<url2>     (D2 general policy)
BROLL_PERVIDEO: <url>            (D2 per-video — match tag)
BROLL_LOOSE: <url1>|<url2>       (chưa classify, manager hand-pick)
SHARED_CTA: <url>
SHARED_OUTRO: <url>
SHARED_INTRO: <url>
SHARED_LOGO: <url>
SHARED_BUMPER: <url>
BRIEF: <url>                     (D4)
```

Mỗi line `KEY: value`, multi-value dùng `|` separator. `editor` parse khi view task detail.

---

## 11. Changelog

| Version | Date | Notes |
|---|---|---|
| 1.0 | 2026-06-06 | First operations spec + 4 client template templates |

---

## 12. Phụ lục: Decision flowchart manager

> Quick reference khi manager scan folder mới — flow ra quyết định nhanh.

```
        ┌─────────────────────────────────────┐
        │ Manager nhận link folder mới        │
        └─────────────────┬───────────────────┘
                          ▼
              Client đã có template?
                  ┌────────┴────────┐
                YES                 NO
                 │                   │
                 ▼                   ▼
       Template tự apply,    Manager xem folder
       click "Scan" → review tay (~5 phút) → map
       output → submit       sang P1-P7 + decide
                              D1/D2/D4 manually
                              ↓
                              Click "Scan" → review
                              output → submit
                              ↓
                              Sau 5-10 lần scan:
                              tạo ClientVeloxTemplate
                              để future scan auto-apply
```

---

## 13. Phụ lục: Glossary

| Term | Định nghĩa |
|---|---|
| **Velox** | Tên feature, viết tắt mang nghĩa "tốc độ" |
| **QuickCreateMode** | Component UI hiển thị Velox (lịch sử cũ — đã rebrand từ "Quick Create") |
| **ScannedVideo** | 1 file video sau khi scan (V1 type) |
| **ScanResultV3** | Output đầy đủ của Deep Scan (V3 type, hiện tại) |
| **Pattern (P1-P7)** | 7 cấu trúc folder mà classifier nhận diện |
| **Decision (D1-D6)** | 6 quyết định cần input manager / preset |
| **MainItem** | 1 task entry trong output (file / pair / folder-bundle) |
| **Pair** | Body+Hook (2 file cùng base part, vd: `Video1.mp4` + `Video1_hook.mp4`) |
| **Bundle** | Folder chứa main + assets (vd: P3 subfolder = 1 task) |
| **BROLL** | B-roll footage (background, supplementary) |
| **Shared Asset** | CTA / OUTRO / INTRO / LOGO / BUMPER — áp dụng cho mọi task |
| **Briefing Doc** | PDF / .docx / .txt chứa instructions cho editor |
| **Wrapper** | Outer folder layer chỉ chứa 1 subfolder thực sự → auto-drill |
| **veloxBatchRaw** | Array `string[]` per-video URLs trong AddTaskModal state |
| **ClientVeloxTemplate** | Preset per-client (proposed model, chưa implement) |

---

*End of operations spec.*
