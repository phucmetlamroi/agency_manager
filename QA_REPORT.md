# QA_REPORT.md — Frontend / Luồng Task · Velox · Multi-Hook Map

> Code-traced QA (đa-agent + xác minh đối kháng 2 phiếu). Xếp hạng theo **mức khó chịu cho người dùng**, không phải bảo mật. Bắt đầu là báo cáo Vòng 1; sau đó chuyển sang **vòng lặp sửa→tái kiểm** theo lệnh `/loop /goal` của người dùng.

## ✅ TRẠNG THÁI CUỐI — ĐÃ HỘI TỤ (sau 4 vòng)

**Vòng 4 hội tụ:** 0 regression · 0 Blocker · 0 High · 0 lỗi cơ học còn lại. Loop dừng theo điều kiện người dùng đặt ("kiểm đến khi không còn lỗi thì thôi").

| Vòng | Blocker | High | Regression của bản sửa trước | Hành động |
|---|---|---|---|---|
| R1 | 1 | 8 | — | Sửa thẳng phần cơ học, hỏi 4 quyết định UX |
| R2 | 0 | 4 | bắt 2 regression của chính bản sửa R1 | Sửa thẳng |
| R3 | 0 | 1 | bắt 1 regression của bản sửa R2 ('Gộp' lệch link) | Sửa thẳng |
| **R4** | **0** | **0** | **0** | Sửa nốt 1 Medium cơ học (V3 videoList), còn lại 2 Medium |

### Đã sửa & commit trong loop (chưa push — tất cả còn ở local branch `claude/cranky-austin`)
- **`1a4df25` (R3)** — Force-overwrite videoList khi apply Velox **V1 batch** (sửa lệch link khi chọn 'Gộp') + reset pool khi unassign (clear deadline/isPenalized).
- **`5cd4ef9` (R4)** — Force-overwrite videoList khi apply Velox **V3 Deep Scan** (đồng bộ "Video list bị khoá" + Preview Bước 5 với title task thực sự được tạo).
- *(Các bản sửa R1/R2 — draft lưu hookGraph + veloxV3Payload, nút "Bỏ Velox", khoá ô video-list, tab 'Quá hạn' cho editor, gắn Map vào task đầu của lô + toast, tỷ giá LIVE mọi path, collectFile cho batch, reset map giữa các lô, pool-reset khi về 'Đang đợi giao' — nằm trong các commit trước đó của loop.)*

### Quyết định UX người dùng đã chốt (R1) và đã áp dụng
- **Batch + Multi-Hook Map** → gắn Map vào **task ĐẦU của lô** + toast báo.
- **Task 'Đã hủy'** → **bỏ hẳn tab 'Đã hủy'**, thay vào đó **thêm tab 'Quá hạn'** cho editor (đã làm).
- **Ô video-list** → **khoá** sau khi Velox apply (kèm nút "Bỏ Velox" để gỡ).
- **Tỷ giá** → dùng **tỷ giá LIVE** cho mọi path tạo task.

### ✅ Quyết định UX cuối đã chốt + đã làm (Medium "hố đen Đã hủy")
Bạn chọn **"Tự động archive khi hủy"**. Đã triển khai (commit `15f2d73`):
- Đặt task sang `Đã hủy` → `isArchived=true`: task **rời khỏi bảng làm việc + "Tổng task"** (cả admin lẫn editor — đã thêm `isArchived:false` vào query dashboard user).
- Thêm trang admin **`/[workspaceId]/admin/cancelled`** (link + badge số dưới bảng task) để **xem lại + Khôi phục** task hủy nhầm. Khôi phục = bỏ archive + đưa status về trạng thái hiển thị (`Nhận task` nếu còn người nhận, ngược lại về chợ `Đang đợi giao`), xoá deadline/penalty cũ.
- Giữ nguyên quyết định R1 "không có tab Đã hủy trên bảng".

Chi tiết kỹ thuật gốc: mục **Medium · assign-status-final** ở cuối báo cáo.

### Còn 1 Medium thuần kỹ thuật đã ghi nhận (không sửa đợt này — bạn quyết)
- Một số mục Medium/Low từ Vòng 1 vẫn để ngỏ cho bạn cân nhắc (empty-submit không bị chặn ở Preview, câu chữ màn success, guard chuyển trạng thái FSM đang tắt, task pool không hiện trên bảng /admin chính, badge marketplace cũ…). Xem các mục Medium/Low bên dưới.

---

## Tóm tắt Vòng 1 (gốc — để tham chiếu repro/evidence)
- **Blocker:** 1 · **High:** 8 · **Medium:** 11 · **Low:** 5
- Trong số Blocker/High đã xác nhận: **sửa thẳng (cơ học)** = 5, **cần quyết định UX** = 5.
- Hội tụ (0 Blocker/High): **ĐÃ ĐẠT ở Vòng 4** (xem mục trạng thái cuối ở trên).

## BLOCKER (1)

### 1. [BLOCKER · CẦN QUYẾT ĐỊNH UX] Multi-Hook Map is silently discarded for ANY batch create (N≥2 videos) — only single-task saves the graph
- **Luồng:** multihook-map
- **Người dùng gặp gì:** An admin builds a full Multi-Hook Map (blocks, edges, variants) in Step 4, then creates a batch of videos (multiple lines in the video list, or a Velox batch). The task rows are created but the entire map is thrown away with NO error and NO toast. Opening any of the created tasks shows a plain RAW Assets link row — every block, edge and variant the admin authored is gone. They only discover the loss later, and have to rebuild the map by hand from the Task detail editor.
- **Tái hiện:** 1. Open Add Task. 2. Step 1: pick a client. 3. In the video-list textarea enter 2+ lines (e.g. 'Hook A' and 'Hook B') so titles.length >= 2. 4. Step 4: switch to '🗺 Multi-Hook Map', add several blocks + wire them (header shows '✓ N block · M dây'). 5. Click 'Tạo task'. 6. Tasks are created successfully. 7. Open any created task → Assets tab → RAW Assets shows a normal empty/link row, NOT the '🗺 Multi-hook Map · N block' pill. The map is gone.
- **Mong đợi:** The map the admin built should be persisted to at least one of the created tasks (or each), exactly as it is for a single-task create.
- **Thực tế:** saveHookGraph is only invoked inside the `else if (titles.length === 1)` branch. The veloxV3Payload branch (returns at the createTasksFromBatch call), the hasVeloxBatch branch, and the multi-video createBatchTasks `else` branch all ignore options.hookGraphV1 entirely — no save, no warning.
- **Vị trí:** `src/components/dashboard/DashboardActionWrapper.tsx:185, :229, :262-273, :276; src/components/dashboard/AddTaskModal.tsx:835-839`
- **Đề xuất sửa:** After each batch create returns its task ids, persist the graph to (at minimum) the first created task — or surface a clear toast that the map can only attach to a single-video task. The mechanical part (calling saveHookGraph with a returned id) is one obvious change, but WHICH task(s) in a batch should receive the shared graph is a product decision (one task vs all vs prompt), so isDesignDecision=true.

## HIGH (8)

### 1. [HIGH · SỬA THẲNG] Multi-Hook Map (hookGraph) is NOT saved to the localStorage draft → user-built whiteboard vanishes on page reload within the 3-min window
- **Luồng:** addtask-input-persistence
- **Người dùng gặp gì:** A creator/admin builds a Multi-Hook Map (drags blocks, draws edges) in Step 4, then closes the modal without submitting and the page reloads (refresh, navigate-away-and-back, accidental F5). When they reopen Add Task inside the 3-minute draft window, the draft toast says "Đã khôi phục bản nháp" and the form fields + the "X link đã trích xuất" chip come back — but the entire Multi-Hook Map is gone (the canvas is empty, the Raw-footage "🗺 Multi-hook Map · N block" indicator is absent). All the graph work is silently lost even though the app claimed it restored the draft.
- **Tái hiện:** 1. Open Add Task, go to Step 4 (Assets).
2. Click the "🗺 Multi-Hook Map" tab and build a graph (add ≥1 block, draw an edge). The "✓ N block · M dây" indicator appears.
3. Close the modal with X (do not submit).
4. Reload the page (or navigate away and back) within 3 minutes.
5. Open Add Task again — observe the "Đã khôi phục bản nháp đang nhập dở" toast.
6. Go to Step 4 → Multi-Hook Map tab.
- **Mong đợi:** Since the draft was restored and the restore toast fired, the Multi-Hook Map the user built should be restored too (or the user should at least be warned it could not be).
- **Thực tế:** hookGraph is null after restore — the map is empty. The draft payload only persists { form, step, veloxBatchRaw, veloxFilledFields }; hookGraph (and mhmFolderUrl, veloxV3Payload) are never written to or read from the draft.
- **Vị trí:** `src/components/dashboard/AddTaskModal.tsx:464, 522-549`
- **Đề xuất sửa:** Add hookGraph (and mhmFolderUrl) to the draft payload type + save object, and restore them in the restore callback (setHookGraph(draft.hookGraph ?? null) with an Array.isArray/shape guard like the existing veloxBatchRaw guard). Also flip rawFootageMode to 'MULTI_HOOK_MAP' when a non-empty hookGraph is restored so the indicator reappears.

### 2. [HIGH · SỬA THẲNG] "Collect file" link is silently dropped on BOTH Velox batch paths (V3 deep-scan and V1 multi-video) — value entered in UI never reaches the DB
- **Luồng:** addtask-input-persistence
- **Người dùng gặp gì:** When the user creates tasks via a Velox batch (≥2 videos: either V1 multi-link or V3 deep-scan), any URL they typed into the Step-4 "Collect file" field is silently discarded. The task is created with collectFilesLink = null. The user sees the success screen and assumes everything saved; the collect-file link is just gone. (The single-task path and the non-Velox multi-video batch both DO save it, so the loss is inconsistent and hard to notice.)
- **Tái hiện:** 1. Open Add Task, run Velox to apply ≥2 videos (so veloxBatchRaw has ≥2 entries) OR a V3 deep-scan.
2. On Step 4, type a URL into the "Collect file" field.
3. Go to Preview, click "Add task".
4. Open any created task's detail / inspect collectFilesLink.
- **Mong đợi:** The Collect file URL is persisted on every created task (same as the single-task and non-Velox batch paths).
- **Thực tế:** collectFilesLink is null on every batch-created task. The wrapper never forwards data.collectFile into the V3 row build or the veloxBatch row build, and createTasksFromBatch's BatchTaskRow type has no collectFilesLink field at all, so the column is never written.
- **Vị trí:** `src/components/dashboard/DashboardActionWrapper.tsx:170-227; src/actions/velox-batch-actions.ts:32-53, 194-197`
- **Đề xuất sửa:** Add collectFilesLink to BatchTaskRow + persist it in createTasksFromBatch's task.create, then pass data.collectFile into both the V3 and veloxBatch row builders in DashboardActionWrapper.

### 3. [HIGH · CẦN QUYẾT ĐỊNH UX] Cancelled tasks ('Đã hủy') vanish from EVERY admin workflow tab AND every user tab — orphaned status with no view
- **Luồng:** assign-status-visibility
- **Người dùng gặp gì:** After an admin cancels a task, it disappears from the screen entirely. The admin can no longer see it in /admin (TaskWorkflowTabs has no Cancelled tab and its 'all' tab is NOT all), and the assignee — who still has the task pinned to them (assigneeId is never cleared on cancel) — sees it in none of their 4 tabs while it still inflates their 'Total Tasks' widget count. The task becomes a ghost: counted but unviewable, with no way to inspect, re-open, or understand why their task total doesn't match the visible rows.
- **Tái hiện:** 1. Admin opens /[workspaceId]/admin, a task is assigned to user U (status e.g. 'Đang thực hiện').
2. Admin opens the Status dropdown (StatusCell) on that row and selects 'Đã hủy'. updateTaskStatus writes status='Đã hủy' and does NOT touch assigneeId (still = U). router.refresh() runs.
3. Admin scans all 5 tabs (Assignee / Progress / Revise / Quá hạn / Complete) — the task is in none of them (no tab includes 'Đã hủy'); the 'all'/Assignee tab only matches ['Nhận task','Đã nhận task','Tạm ngưng'].
4. User U opens /[workspaceId]/dashboard. The dashboard query fetches ALL tasks where assigneeId=U with no status filter, so the cancelled task is in `tasks`. WidgetTotalTasks shows it in `total={tasks.length}`, but UserWorkflowTabs' 4 tabs (assignee/progress/revise/complete) include no status matching 'Đã hủy' → task shows in zero tabs.
- **Mong đợi:** A cancelled task should either (a) appear in a dedicated Cancelled tab/filter for the admin, and (b) be excluded from the user's task pool (e.g. assigneeId cleared on cancel, like the unassign path does) so the user's Total Tasks count matches what is shown.
- **Thực tế:** 'Đã hủy' is absent from every TABS.statuses list in both TaskWorkflowTabs.tsx (admin) and UserWorkflowTabs.tsx (user). assigneeId is preserved on cancel (updateTaskStatus only writes status/deadline/version), so the task stays attached to the user yet is invisible in all tabs and only visible as a phantom count.
- **Vị trí:** `src/components/TaskWorkflowTabs.tsx:63-71; src/components/dashboard/UserWorkflowTabs.tsx:44-49; src/app/[workspaceId]/dashboard/page.tsx:110-133,299-303; src/actions/task-actions.ts:120-124; src/components/tasks/cells/StatusCell.tsx:130`
- **Đề xuất sửa:** Either add a 'Đã hủy' (Cancelled) tab to TaskWorkflowTabs (admin) so cancelled tasks remain reachable, and decide the user-side behavior: clear assigneeId on cancel so it leaves the user's pool, OR add a Cancelled tab to UserWorkflowTabs. At minimum the user's Total Tasks count and tab contents must be consistent (exclude cancelled from the count if it is excluded from all tabs).

### 4. [HIGH · SỬA THẲNG] Multi-Hook Map from batch 1 bleeds into every later task created in the same session (never reset)
- **Luồng:** bulk-sequential
- **Người dùng gặp gì:** An admin builds a Multi-Hook Map for batch 1, creates it, then (without reloading the page) opens Add Task again for a totally different batch/editor. The old hookGraph is still in React state, so the new task(s) silently get saved with batch 1's Multi-Hook Map attached — wrong DAG/raw-footage map on the wrong tasks, and the user has no idea because Step 4 only shows the map if they switch to that tab.
- **Tái hiện:** 1. Open Add Task, go to Step 4, switch to '🗺 Multi-Hook Map', add ≥1 block (hookGraph now non-null with blocks).
2. Finish wizard, click 'Add task' (handleSubmit runs).
3. On the success screen DO NOT click 'Done' — instead the modal can be reopened later; OR click Done then reopen. Either way the component is never unmounted (AddTaskModal is always mounted in DashboardActionWrapper with open={modalOpen}).
4. Start a brand-new single task for editor B (no map intended). Reach Step 4 — note Raw footage now shows the leftover '🗺 Multi-hook Map · N block' button from batch 1.
5. Submit. The stale hookGraph (blocks.length>0) is passed as hookGraphV1 and saved to the new task via saveHookGraph.
- **Mong đợi:** After a successful create (handleSubmit) and/or on Done, hookGraph, rawFootageMode, and mhmFolderUrl must be cleared so the next task starts blank.
- **Thực tế:** setHookGraph(null) is never called after the initial useState. handleSubmit resets veloxFilledFields/veloxBatchRaw/veloxV3Payload but NOT hookGraph/rawFootageMode/mhmFolderUrl. handleDone resets form/step/velox state but also NOT hookGraph/rawFootageMode/mhmFolderUrl. The open-effect explicitly does not reset. So the map persists across batches.
- **Vị trí:** `src/components/dashboard/AddTaskModal.tsx:843-846 (handleSubmit reset), 854-862 (handleDone reset), 464 (state), 835-838 (submit gating), 1112 (onChange); src/components/dashboard/DashboardActionWrapper.tsx:317-326 (modal always mounted), 262-273 (saveHookGraph)`
- **Đề xuất sửa:** In both handleSubmit (after success) and handleDone, add setHookGraph(null); setRawFootageMode('PER_LINK'); setMhmFolderUrl('') so the editor state resets per-batch, matching how veloxBatchRaw/veloxV3Payload are already reset.

### 5. [HIGH · CẦN QUYẾT ĐỊNH UX] Editing the video list after a Velox multi-video apply silently drops ALL per-video raw-footage links (falls back to shared empty rawFootage)
- **Luồng:** bulk-sequential
- **Người dùng gặp gì:** Admin runs Velox on a folder of e.g. 5 videos (veloxBatchRaw has 5 URLs), then on Step 2 removes 2 lines from the video list (typo, dup, or merges). On submit, instead of routing to the per-row batch, the code falls through to the shared-resources path and every created task gets an EMPTY raw footage — all 3 remaining tasks lose the Velox-extracted links the user carefully scanned, with no warning.
- **Tái hiện:** 1. Open Add Task → Velox → scan a folder yielding ≥2 videos with linkFootage ON. veloxBatchRaw = [u1..u5], videoList has 5 lines, prefill.rawFootage was deleted.
2. Go to Step 2 (Video) and delete 2 lines from the video list (now 3 lines).
3. The pad effect only GROWS veloxBatchRaw, never shrinks, so veloxBatchRaw.length stays 5 while videoNames.length is 3.
4. Submit. In the wrapper, hasVeloxBatch = (5 === 3 && ...) → false.
5. titles.length is 3 (>1) → createBatchTasks shared path runs with resources built from data.rawFootage which is '' (prefill.rawFootage was deleted) → all 3 tasks created with no raw footage link.
- **Mong đợi:** The per-video URLs the user extracted should be preserved and applied to the matching rows (or the user warned that counts diverge), never silently discarded.
- **Thực tế:** hasVeloxBatch requires veloxBatchRaw.length === videoNames.length exactly; the pad-only effect makes them diverge whenever a line is removed, so the per-row path is skipped and the shared path emits empty rawFootage.
- **Vị trí:** `src/components/dashboard/AddTaskModal.tsx:492-508 (pad-only effect), 727-735 (apply sets veloxBatchRaw); src/components/dashboard/DashboardActionWrapper.tsx:201-233 (hasVeloxBatch guard + fallback)`
- **Đề xuất sửa:** Decide product behavior (design decision) then implement: either (a) align veloxBatchRaw to videoNames by index when lines are removed and route by min/zip, or (b) block submit / warn when veloxBatchRaw.length !== videoNames.length so the user doesn't silently lose links. At minimum, don't fall through to a shared-empty rawFootage path when veloxBatchRaw has content.

### 6. [HIGH · CẦN QUYẾT ĐỊNH UX] V1 Velox batch: editing the Video list (rename/delete/reorder a line) silently drops ALL per-video footage URLs
- **Luồng:** velox-scan-prefill-submit
- **Người dùng gặp gì:** An admin scans a folder, Velox extracts e.g. 18 raw-footage links and applies them. In Step 2 the admin fixes one typo in a video name (or deletes one bad row). On submit, every task is created with NO footage link at all — 18 RAW URLs the user carefully reviewed just vanish, with a success toast.
- **Tái hiện:** 1. Open Add Task → Velox (V1 legacy scan, deepScan OFF) → scan a folder with ≥2 videos, linkFootage ON.
2. Pick Client, click 'Áp dụng vào form'. videoList is prefilled with N titles; veloxBatchRaw holds N URLs; rawFootage field deleted from prefill.
3. Go to Step 2 'Video list', delete one line (or you have only N-1 non-empty lines after trimming).
4. Submit.
5. Inspect created tasks — none have a RAW footage URL.
- **Mong đợi:** Per-video footage URLs survive edits to the video list; tasks keep their RAW links (or at minimum the user is warned the lists are out of sync).
- **Thực tế:** DashboardActionWrapper.hasVeloxBatch requires options.veloxBatchRaw.length === videoNames.length (line 201-204). After deleting a line the counts differ, so the per-row createTasksFromBatch path is skipped. Flow falls through to the shared createBatchTasks branch using packedResources built from data.rawFootage — which was deleted from the prefill for N≥2 (AddTaskModal line 729-730), so it is empty. All footage URLs are lost.
- **Vị trí:** `src/components/dashboard/DashboardActionWrapper.tsx:201-228, 274-301; src/components/dashboard/AddTaskModal.tsx:727-735`
- **Đề xuất sửa:** Do not gate on exact count equality. Either (a) align veloxBatchRaw to videoNames by index at submit (pad/truncate to videoNames.length, padding with ''), then always use createTasksFromBatch for veloxBatchRaw.length>0 && videoNames.length>=2; or (b) block submit with a clear Vietnamese warning when veloxBatchRaw.length !== videoNames.length so the user re-syncs in VeloxRawFootagesModal. Never silently route to the shared-resources path that drops the URLs.

### 7. [HIGH · CẦN QUYẾT ĐỊNH UX] V3 Deep Scan: edits to the Video list textarea are completely ignored at submit (titles come only from mainItems)
- **Luồng:** velox-scan-prefill-submit
- **Người dùng gặp gì:** After a V3 deep scan, the admin sees the auto-generated names in Step 2 'Video list' and renames a couple (or deletes ones they don't want). On submit, the renames/deletions are thrown away — tasks are created with the original Velox names, and 'deleted' rows still become tasks.
- **Tái hiện:** 1. Add Task → Velox with deepScan ON, scan a folder → V3 result (mainItems).
2. Apply to form. videoList is prefilled from mainItems.
3. In Step 2, rename a video line and delete another.
4. Submit.
5. Created tasks ignore both edits: original names kept, the 'deleted' video still created.
- **Mong đợi:** What the user sees and edits in the Video list should be what gets created — renamed titles applied, removed lines not created.
- **Thực tế:** The V3 submit branch builds rows purely from v3.mainItems and resolves each title via m.taskNameByMode[v3.taskNameMode]; it never reads data.videoList. The videoList textarea is therefore a read-only illusion in V3.
- **Vị trí:** `src/components/dashboard/DashboardActionWrapper.tsx:96-106, 140-194; src/components/dashboard/AddTaskModal.tsx:648-701`
- **Đề xuất sửa:** Either drive V3 titles/row-count from the edited videoList (match mainItems by index to the surviving lines, drop lines the user removed, use the edited line text as the title) or make the videoList read-only in V3 mode with a note that names are managed in the Velox preview. Today's mix (editable field that is silently ignored) is the trap.

### 8. [HIGH · SỬA THẲNG] Autosave draft does NOT include the Multi-Hook Map or rawFootageMode — closing/reopening the modal loses the built graph
- **Luồng:** multihook-map
- **Người dùng gặp gì:** An admin builds a Multi-Hook Map in Step 4, then accidentally closes the modal (clicks outside, hits Esc, navigates away) within the 3-minute draft window. On reopen, the app cheerfully toasts 'Đã khôi phục bản nháp đang nhập dở' and restores the form fields, client, assignee, Velox state — but the hook graph is empty and the mode is back on 'Link lẻ'. The user is told their draft was restored, so they trust it, but all the map-building work is silently gone.
- **Tái hiện:** 1. Open Add Task, fill client/assignee. 2. Step 4 → '🗺 Multi-Hook Map' → add several blocks and edges. 3. Close the modal (Esc / click backdrop) WITHOUT submitting. 4. Within 3 minutes, reopen Add Task. 5. Toast says the draft was restored; form fields and Velox chips return. 6. Step 4 is back on 'Link lẻ' and the Multi-Hook Map canvas is empty — the graph is not restored.
- **Mong đợi:** If the draft-restore toast claims the in-progress draft was recovered, it must also recover the Multi-Hook Map (and the selected rawFootageMode), or it should not claim a full restore.
- **Thực tế:** The useAutoSaveDraft payload type and the saved object only contain { form, step, veloxBatchRaw, veloxFilledFields }. hookGraph and rawFootageMode are never serialized, and the restore callback never calls setHookGraph/setRawFootageMode.
- **Vị trí:** `src/components/dashboard/AddTaskModal.tsx:521-581 (draft save/restore), :461 (rawFootageMode state), :464 (hookGraph state)`
- **Đề xuất sửa:** Add hookGraph and rawFootageMode to the draft payload type and the saved object, and restore them in the callback (setHookGraph(draft.hookGraph ?? null); setRawFootageMode(draft.rawFootageMode ?? 'PER_LINK')). Guard for older draft shapes like the existing veloxBatchRaw guards. This is a mechanical, one-correct-way fix.

## MEDIUM (11)

### 1. [MEDIUM · CẦN QUYẾT ĐỊNH UX] Empty / near-empty submit is never blocked — no client + no video names creates a junk "Untitled Task" with no warning
- **Luồng:** addtask-input-persistence
- **Người dùng gặp gì:** If the user reaches the Preview step with no client selected and no video names (e.g. they cleared the form, or only entered finance/notes), clicking "Add task" succeeds and silently creates a task literally titled "Untitled Task". There is no inline validation telling them the title/client is missing, and the server does not reject it because the wrapper substitutes a fallback title. The user gets the green success screen for a meaningless task that then clutters the queue.
- **Tái hiện:** 1. Open Add Task. Leave Client empty and Video list empty (optionally type only Notes or a price).
2. Click Next through to Step 5 (Preview) — nothing blocks navigation.
3. Click "Add task".
- **Mong đợi:** The Preview step (or the Add-task button) should block submit and surface a clear message when there is no client AND no video title, instead of fabricating an "Untitled Task".
- **Thực tế:** handleSubmit runs with no client validation. The wrapper computes clientLabel = client?.name ?? "Untitled Task" and titles = [clientLabel], so createTask receives title "Untitled Task", passes the server's non-empty title check, and a junk task is created. Success screen shows.
- **Vị trí:** `src/components/dashboard/AddTaskModal.tsx:812-852; src/components/dashboard/DashboardActionWrapper.tsx:90-106`
- **Đề xuất sửa:** Gate the Step-5 "Add task" button (or handleSubmit) on a minimal-valid check: require a client (form.clientId) and/or at least one video line, and show an inline error/toast if missing. Decide whether "client only, no videos" should be allowed (that already works via the clientLabel title).

### 2. [MEDIUM · SỬA THẲNG] Success screen always says task went "to the queue / view in Task Queue" — even when it was assigned directly to an editor (case a)
- **Luồng:** two-create-cases
- **Người dùng gặp gì:** An admin who creates a task and assigns it to a specific editor (status 'Nhận task') is told on the success screen "Task đã được thêm thành công vào hàng đợi. Bạn có thể xem trong Task Queue." Following that instruction, they open /admin/queue and the task is NOT there (the queue intentionally excludes assigned tasks). The admin is misled into thinking the assignment failed or the task vanished, when in fact it correctly went to the editor.
- **Tái hiện:** 1. Open Add Task modal (admin).
2. Step 1: pick a Client, and pick a specific Editor in 'Editor's name'.
3. Fill remaining required fields, reach Step 5, click create.
4. Success screen shows: 'Task đã được thêm thành công vào hàng đợi. Bạn có thể xem trong Task Queue.'
5. Click into the Task Queue (/admin/queue) — the just-created assigned task is absent because queue filters `!t.assigneeId || t.status === 'Đang đợi giao'`.
- **Mong đợi:** Success copy should reflect the actual destination: for an assigned task it should say it was assigned to the editor (and appears in the main task list / the editor's dashboard), not that it is in the queue.
- **Thực tế:** renderSuccess() is a single static block with no branch on assignee; it always claims the task is in the queue.
- **Vị trí:** `src/components/dashboard/AddTaskModal.tsx:1351-1353 (renderSuccess); src/app/[workspaceId]/admin/queue/page.tsx:61`
- **Đề xuất sửa:** In renderSuccess(), branch on form.assigneeId: if an editor was selected, show e.g. 'Đã giao task cho <editor>. Task hiển thị trong danh sách công việc / dashboard của editor.'; only show the 'vào hàng đợi / Task Queue' copy when assigneeId is blank.

### 3. [MEDIUM · CẦN QUYẾT ĐỊNH UX] Pool task (case b, 'Đang đợi giao') is invisible on the main /admin task table — only the separate /admin/queue page shows it
- **Luồng:** two-create-cases
- **Người dùng gặp gì:** After creating a task with a blank assignee (status 'Đang đợi giao'), an admin who looks at the main admin dashboard task table (TaskWorkflowTabs, 5 tabs) will not see the task in ANY tab. The just-created task appears to have vanished from the primary task list. It is only findable by navigating to the dedicated Task Queue page. A busy admin who creates a pool task and stays on the home screen sees no trace of it.
- **Tái hiện:** 1. Open Add Task modal (admin).
2. Step 1: pick a Client; leave 'Editor's name' blank (select 'Leave Blank (Task Pool)').
3. Complete the wizard and create → status becomes 'Đang đợi giao'.
4. Return to /admin home. Click through all 5 TaskWorkflowTabs (Assignee / Progress / Revise / Quá hạn / Complete).
5. The new pool task is in none of them.
- **Mong đợi:** Either the main admin task table surfaces pool tasks (e.g. the 'Assignee' tab or a dedicated chip includes 'Đang đợi giao'), or the create flow/redirect makes it obvious the task lives in the Queue so the admin isn't left thinking it disappeared.
- **Thực tế:** All 5 admin tabs filter by an explicit `statuses` array and none of them include 'Đang đợi giao'; the filter drops any task whose status isn't listed.
- **Vị trí:** `src/components/TaskWorkflowTabs.tsx:63-71, 122-127; compare src/components/dashboard/UserWorkflowTabs.tsx:45`
- **Đề xuất sửa:** Add 'Đang đợi giao' to the admin 'Assignee' tab's statuses (mirroring the user-side Assignee tab), or add a visible 'Chờ giao/Queue' tab on the admin table. Requires a product call on whether pool tasks belong in the main table vs. only the Queue page.

### 4. [MEDIUM · CẦN QUYẾT ĐỊNH UX] FSM transition guard is fully disabled (validateTransition always returns valid) — no transition stranding protection on status changes
- **Luồng:** assign-status-visibility
- **Người dùng gặp gì:** There is no server-side guard preventing illegal status jumps via the admin dropdown or drag-drop. An admin can move a task directly to any status (e.g. straight to 'Đã hủy' or 'Quá hạn') from any state. Combined with the missing 'Đã hủy' tabs (finding 1), this makes it trivially easy to strand a task in an unviewable state, and it removes the documented protection against re-billing a completed task by reverting it.
- **Tái hiện:** 1. Admin opens StatusCell dropdown on a task in status 'Hoàn tất'.
2. Select any status (e.g. 'Đang thực hiện' or 'Đã hủy').
3. updateTaskStatus calls validateTransition(task.status, newStatus) at task-actions.ts L79.
4. fsm-config.ts validateTransition L122-125 immediately returns { isValid: true } regardless of from/to — the TRANSITIONS table and the separate task-state-machine.ts ADMIN_TRANSITIONS/USER_TRANSITIONS maps are never consulted.
5. The transition succeeds with no validation.
- **Mong đợi:** Either the FSM enforces the documented transition rules (task-state-machine.ts / fsm-config.TRANSITIONS), or the dead code and its 'Enterprise Logic / FSM Guard' comments are removed so the absence of guarding is explicit.
- **Thực tế:** validateTransition is a hard-coded no-op ('FSM Disabled as per user request'), while task-actions.ts L77-83 still presents it as an active 'FSM GUARD (Enterprise Logic)'. task-state-machine.ts (which also still uses the obsolete 'Hủy' string instead of canonical 'Đã hủy') is entirely unused by the live status path.
- **Vị trí:** `src/lib/fsm-config.ts:122-125; src/actions/task-actions.ts:77-83; src/lib/task-state-machine.ts:42,57,72`
- **Đề xuất sửa:** This is a product call: if transition gating is intended, re-enable validateTransition using fsm-config.TRANSITIONS (and reconcile task-state-machine.ts 'Hủy' → 'Đã hủy'); if not, delete the dead FSM code and the misleading 'FSM GUARD' comments so reviewers don't assume protection exists.

### 5. [MEDIUM · SỬA THẲNG] Marketplace badge count goes stale (too low) after a failed claim — task is back in the list but the counter isn't restored
- **Luồng:** marketplace-pool
- **Người dùng gặp gì:** An editor drags a task to claim it, but someone else grabbed it first (or the marketplace was just closed). The task correctly reappears in the open modal, but the marketplace badge/count in the top bar now shows one fewer task than is actually available. The number stays wrong until the next 10s poll refresh or modal reopen, making the creator think a task vanished.
- **Tái hiện:** 1. Open Phiên Chợ with e.g. 3 pool tasks; top-bar badge shows 3.
2. Two users A and B both try to claim the same task at nearly the same time.
3. User A wins; User B's claim returns an error ('Task đã được nhận bởi người khác').
4. In User B's UI: handleClaim optimistically removed the task (count effectively 2), then the error path runs setTasks(prev => [...prev, taskToRemove]) restoring it to the grid — but onTaskCountChange is NOT called.
5. Result: the grid shows 3 task cards again, but the broadcast count / badge still reads 2 (last value broadcast was never updated back up).
- **Mong đợi:** After rollback, the count broadcast to the badge should match the restored task list length (3).
- **Thực tế:** onTaskCountChange is only called on the success branch and on fetchTasks; the rollback branch restores tasks state but never re-broadcasts the count, so the badge under-counts until the next poll/refetch.
- **Vị trí:** `src/components/marketplace/TaskMarketplace.tsx:209-227`
- **Đề xuất sửa:** In the error/rollback branch, after restoring the task, re-broadcast the count: call onTaskCountChange?.(tasks.length) (the pre-removal length) so the badge matches the restored grid. Simplest: setTasks(prev => { const next = [...prev, taskToRemove]; onTaskCountChange?.(next.length); return next }).

### 6. [MEDIUM · CẦN QUYẾT ĐỊNH UX] Auto-closing the modal when the last task is claimed can hide tasks that arrived in the same window
- **Luồng:** marketplace-pool
- **Người dùng gặp gì:** After an editor claims the final visible task, the modal auto-closes 500ms later. If the admin (or another flow) added new pool tasks during those last seconds, or the 10s poll was about to bring in fresh tasks, the creator is kicked out of the marketplace and assumes the pool is empty — they have to manually reopen it to discover there were more tasks to grab.
- **Tái hiện:** 1. Open marketplace showing 1 task.
2. Admin/Velox creates 2 new pool tasks (status 'Đang đợi giao') at roughly the same moment.
3. Editor claims the 1 visible task → updatedTasks.length === 0 → setTimeout(onClose, 500) fires and closes the modal.
4. The 2 new tasks exist in the pool but the editor never sees them; the modal is gone.
- **Mong đợi:** On successful claim that empties the local list, re-fetch before deciding to close (or simply do not auto-close — show the 'Chợ đang trống' empty state and let the poll refill it).
- **Thực tế:** handleClaim closes the modal purely on the local optimistic list being empty, without re-checking the server, so newly-arrived pool tasks are not surfaced.
- **Vị trí:** `src/components/marketplace/TaskMarketplace.tsx:224-227`
- **Đề xuất sửa:** Replace the auto-close with a fetchTasks() call (the 10s interval is paused implicitly by close); let the existing 'Chợ đang trống!' empty state render. If auto-close is a deliberate UX choice, at minimum await a fresh getMarketplaceTasks before closing.

### 7. [MEDIUM · SỬA THẲNG] createBatchTasks reports count = data.titles.length including blank/whitespace titles that were skipped, so the success toast overstates how many tasks were made
- **Luồng:** bulk-sequential
- **Người dùng gặp gì:** In the shared-resources batch path, if the video list contains blank/whitespace lines, the loop skips them (continue) but the returned count is data.titles.length (the raw input length), so the admin is told 'created N tasks' when fewer were actually created — they trust a number that's wrong and may not notice missing tasks.
- **Tái hiện:** 1. Add Task (non-Velox), enter a video list where some lines are blank/whitespace among real titles (e.g. paste with trailing blank lines).
2. The wrapper builds titles via videoNames.filter(length>0) so this is mostly mitigated upstream, BUT createBatchTasks itself also defends with `if (!title.trim()) continue` inside the loop and still returns `count: data.titles.length`.
3. Any caller passing unfiltered titles (or titles containing whitespace-only entries) gets an inflated count.
- **Mong đợi:** Return the number of tasks actually created (createdTasks.length), consistent with createTasksFromBatch which returns createdTasks.length.
- **Thực tế:** `return { success: true, count: data.titles.length }` — uses input length, not createdTasks.length, even though the loop can skip entries via `if (!title.trim()) continue`.
- **Vị trí:** `src/actions/bulk-task-actions.ts:82-119 (loop + createdTasks), 178 (return count: data.titles.length)`
- **Đề xuất sửa:** Return `count: createdTasks.length` (mechanical, one obvious value). createdTasks is already tracked for notifications.

### 8. [MEDIUM · SỬA THẲNG] createBatchTasks (shared batch) does NOT pre-validate assigneeId exists, so a stale assignee FK error rolls back the entire batch with a generic message
- **Luồng:** bulk-sequential
- **Người dùng gặp gì:** If a non-Velox shared batch is assigned to an editor whose user row no longer exists (deleted user, cloned workspace, stale draft restored from localStorage), every task in the batch fails to create and the admin only sees 'Lỗi khi tạo lô task. Vui lòng thử lại.' with no hint that the assignee is the cause — they retry forever. The Velox batch path (createTasksFromBatch) was explicitly hardened against exactly this; the shared batch path was not.
- **Tái hiện:** 1. Restore an old Add Task draft (or pick an assignee) whose user was since deleted, with ≥2 video lines and no Velox per-row data → routes to createBatchTasks.
2. tx.task.create runs with assigneeId pointing at a missing user.
3. Prisma throws Foreign key constraint violated on Task_assigneeId_fkey; the whole $transaction rolls back; catch returns the generic error.
- **Mong đợi:** Either pre-check the assignee exists (as createTasksFromBatch does) and return a clear message, or surface the FK cause, so no full-batch loss with an opaque message.
- **Thực tế:** createBatchTasks sets `assigneeId: data.assigneeId` directly inside the transaction with no prior existence check; only NaN/financial and workspace/profile guards exist.
- **Vị trí:** `src/actions/bulk-task-actions.ts:35-118 (createBatchTasks, no assignee pre-check), 180-183 (generic catch); src/actions/velox-batch-actions.ts:157-173 (the guard that should be mirrored)`
- **Đề xuất sửa:** Mirror the createTasksFromBatch pre-check: if data.assigneeId is set, verify the user exists before opening the transaction and return a specific Vietnamese message; this is a mechanical port of existing code.

### 9. [MEDIUM · CẦN QUYẾT ĐỊNH UX] Velox V3/V1 batch paths hardcode exchangeRate 25000 in the wrapper, ignoring the live snapshot — profit/revenue computed wrong for every task in the batch
- **Luồng:** bulk-sequential
- **Người dùng gặp gì:** All tasks created through the Velox batch (V3 and V1 ≥2) get revenueVND/profitVND computed with exchangeRate=25000 regardless of the actual workspace exchange rate (default prop is 26300, and a real snapshot could differ). Finance numbers (profit) on bulk-created tasks are silently off, which matters for payroll/profit reporting the app emphasizes.
- **Tái hiện:** 1. Workspace exchangeRate snapshot is e.g. 26300 (the AddTaskModal/wrapper default) or any non-25000 value.
2. Create a Velox batch (V3 or V1 ≥2 videos).
3. Wrapper calls createTasksFromBatch({ rows, exchangeRate: 25000 }, ...) — hardcoded.
4. Server computes revenueVND = jobPriceUSD * 25000 and profitVND accordingly, not using the real rate.
- **Mong đợi:** Use the exchangeRate prop/snapshot passed into the wrapper (the same value used elsewhere) for batch financials.
- **Thực tế:** Both Velox batch branches pass `exchangeRate: 25000` literally; the single-task and shared-batch paths also use '25000'/25000, but the component receives a real exchangeRate prop (default 26300) that is never used for creation.
- **Vị trí:** `src/components/dashboard/DashboardActionWrapper.tsx:185-188 (V3), 229-232 (V1), 243/283 (single/shared also 25000), 54 (unused exchangeRate prop); src/actions/velox-batch-actions.ts:183-184 (revenue/profit calc uses data.exchangeRate)`
- **Đề xuất sửa:** Product/finance decision on the canonical rate source, then pass that value (e.g. the exchangeRate prop) into createTasksFromBatch and createBatchTasks instead of the literal 25000, consistently across all four creation paths.

### 10. [MEDIUM · CẦN QUYẾT ĐỊNH UX] veloxBatchRaw never realigns on rename/reorder/middle-delete — only grows; URL-to-video pairing drifts
- **Luồng:** velox-scan-prefill-submit
- **Người dùng gặp gì:** After Velox applies N footage URLs, if the admin reorders or deletes a middle line in the Video list (instead of the last one), the row→URL index mapping shifts so footage links attach to the wrong videos, or extra empty/old rows linger in the Raw Footages popup.
- **Tái hiện:** 1. V1 batch Velox apply with 4 videos → veloxBatchRaw = [u1,u2,u3,u4].
2. In Step 2 delete the 2nd video line (now 3 lines: v1,v3,v4).
3. Open the 'N link đã được trích xuất' popup → row 1=u1, row 2=u2 (belongs to deleted v2), row 3=u3, plus a 4th orphan row. URLs no longer line up with the surviving videos.
- **Mong đợi:** Per-video URLs track the video they belong to across reorder/delete, or the UI clearly forces a re-sync.
- **Thực tế:** The padding effect only appends '' when videoList has MORE lines than veloxBatchRaw (lineCount <= length → early return). It never removes or reorders entries when a middle line is deleted or lines are reordered. Comment explicitly says it intentionally never truncates and treats veloxBatchRaw as source of truth, so index alignment silently rots.
- **Vị trí:** `src/components/dashboard/AddTaskModal.tsx:492-508; src/components/dashboard/VeloxRawFootagesModal.tsx:51-60, 128-182`
- **Đề xuất sửa:** Treat the video list as the source of truth for ordering/count, or key URLs by a stable rowId instead of array index so rename/reorder/delete keep the correct video↔URL pairing. At minimum, surface a 'danh sách không khớp' warning when counts diverge before submit.

### 11. [MEDIUM · SỬA THẲNG] Velox preview computes VND with exchangeRate prop (26300) but every create path hardcodes 25000
- **Luồng:** velox-scan-prefill-submit
- **Người dùng gặp gì:** The VND wage/profit the admin reviews in the Velox preview and the Step 4 margin readout is computed at a different rate than what is persisted, so the saved task economics don't match what the user just approved.
- **Tái hiện:** 1. Velox preview shows per-video VND totals using exchangeRate=26300 (prop default).
2. Apply + submit. createTasksFromBatch / createTask / createBatchTasks are all called with exchangeRate 25000 (hardcoded). profitVND = jobPriceUSD*25000 - wageVND, not *26300.
3. Reported revenue/profit differs from the preview.
- **Mong đợi:** One exchange rate flows from preview → submit so the saved numbers equal the reviewed numbers.
- **Thực tế:** QuickCreateMode/AddTaskModal display use the live exchangeRate prop (26300) and USD_TO_VND=25000 inconsistently, while DashboardActionWrapper passes literal 25000 to all three create actions.
- **Vị trí:** `src/components/dashboard/DashboardActionWrapper.tsx:186,230,243,284; src/components/dashboard/AddTaskModal.tsx:151,416,783`
- **Đề xuất sửa:** Thread the real exchangeRate prop through handleSubmit into all create actions instead of the 25000 literal, and have AddTaskModal use the same rate for its margin readout. wageVND itself is an absolute number so it survives; the discrepancy is in revenue/profit math and displayed VND.

## LOW (5)

### 1. [LOW · CẦN QUYẾT ĐỊNH UX] frameUsername / framePassword / frameNote are wired through the whole save pipeline but have NO input in the 5-step wizard — always submitted empty
- **Luồng:** addtask-input-persistence
- **Người dùng gặp gì:** The Frame.io credential fields (frameUsername, framePassword, frameNote) exist in the form model, the draft serializer, and every server action, but there is no UI anywhere in the AddTaskModal wizard to enter them. So a busy admin who expects to attach Frame.io creds at task-create time cannot — the fields are dead and always save as null. Not a data-loss bug (nothing entered to lose), but a missing-feature trap and pipeline cruft.
- **Tái hiện:** 1. Open Add Task and walk all 5 steps looking for a Frame username/password/note input.
2. Observe none exists.
3. Create the task; inspect the row — frameUsername/framePassword/frameNote are null.
- **Mong đợi:** Either the wizard exposes inputs for these fields (so the plumbing is usable) or the dead fields are removed from the form model.
- **Thực tế:** frameUsername/framePassword/frameNote are declared in TaskFormData and INITIAL_FORM and forwarded to createTask/createBatchTasks, but there is no <input> bound to them in any renderStep case.
- **Vị trí:** `src/components/dashboard/AddTaskModal.tsx:60-62,145-147; src/components/dashboard/DashboardActionWrapper.tsx:250-252`
- **Đề xuất sửa:** Product decision: add Frame.io credential inputs to Step 4, or remove the unused fields from TaskFormData and the submit payloads to reduce confusion.

### 2. [LOW · SỬA THẲNG] Rolled-back task jumps to the END of the marketplace grid instead of its original position
- **Luồng:** marketplace-pool
- **Người dùng gặp gì:** When a claim fails and the task is restored, it is appended to the bottom of the grid (sorted-by-createdAt-desc order is broken). A busy editor who was looking at a card in the top row sees it teleport to the bottom after a failed grab, which is disorienting and can cause them to re-grab the wrong card.
- **Tái hiện:** 1. Open marketplace with several tasks (server returns them ordered createdAt desc).
2. Attempt to claim a task near the top of the grid that another user just took.
3. Claim fails; rollback runs setTasks(prev => [...prev, taskToRemove]).
4. The restored card now renders as the LAST item in the grid, not in its original sorted slot.
- **Mong đợi:** On rollback the task should reappear in its original sorted position (or the list should be re-fetched to restore canonical order).
- **Thực tế:** The rollback appends taskToRemove to the end of the array, ignoring the original createdAt-desc ordering used by getMarketplaceTasks (orderBy createdAt desc).
- **Vị trí:** `src/components/marketplace/TaskMarketplace.tsx:210-222`
- **Đề xuất sửa:** Either re-insert at the original index (capture index before filtering and splice it back) or trigger fetchTasks() on claim failure to restore canonical order and freshness.

### 3. [LOW · SỬA THẲNG] In-flight drag is not cancelled when the 10s poll detects the marketplace was just closed; the drop silently does nothing with no feedback
- **Luồng:** marketplace-pool
- **Người dùng gặp gì:** A creator picks up a task card to drag-claim it. During the drag, the 10-second poll fires, sees the admin closed the marketplace, and clears the task grid (setTasks([])) behind the drag overlay. When the creator drops, the claim hits the server, which rejects it (transaction sees marketplaceOpen=false) — but because the task was already optimistically removed and the list is empty, the rollback re-adds a now-stale card and the error toast is the only signal. The experience is a confusing 'my drop did nothing / a ghost card came back' moment.
- **Tái hiện:** 1. User A starts dragging a marketplace card (onDragStart sets activeTask).
2. While holding the drag (>=, the 10s poll runs fetchTasks; admin has just closed marketplace → res.marketplaceOpen === false → setMarketplaceOpen(false) + setTasks([]).
3. activeTask is still held (poll does not clear it). User A drops on the full-screen zone → handleClaim runs.
4. tasks is now [] so taskToRemove is undefined; claimTask returns 'Phiên chợ hiện đang đóng...'; rollback does nothing useful; user just sees an error toast with the grid showing the 'closed' state.
- **Mong đợi:** When a poll flips marketplaceOpen to false, any in-flight drag should be cancelled (clear activeTask / hide the drop zone) so the user gets the clear 'Đã đóng' state instead of a dangling drag that resolves into an error.
- **Thực tế:** The poll updates marketplaceOpen and clears tasks but never clears activeTask or cancels the DnD drag; onDragStart only guards the START of a drag, not one already in progress.
- **Vị trí:** `src/components/marketplace/TaskMarketplace.tsx:167-199, 229-241`
- **Đề xuất sửa:** Add a useEffect that, when marketplaceOpen becomes false, clears activeTask (and thus the drop zone). The server-side transaction check at claim-actions.ts:161 already prevents the actual claim, so this is purely a UX/feedback fix.

### 4. [LOW · SỬA THẲNG] Single-item V3: manual edit of the Step 4 RAW footage field is ignored (encodeResourcesV3 uses mainItem.previewUrl)
- **Luồng:** velox-scan-prefill-submit
- **Người dùng gặp gì:** For a single-video V3 scan, if the admin tweaks the RAW footage URL in Step 4 before submitting, the edit is discarded — the task is saved with Velox's originally-detected previewUrl.
- **Tái hiện:** 1. V3 deep scan returns exactly 1 mainItem.
2. Apply → rawFootage prefilled from mainItems[0].previewUrl.
3. In Step 4 change the RAW URL.
4. Submit. Saved resources RAW: line uses the original previewUrl, not the edit.
- **Mong đợi:** Manual RAW edits in the form override Velox's detected URL.
- **Thực tế:** V3 submit always routes through encodeResourcesV3, whose RAW line is `RAW: ${mainItem.previewUrl}` (never data.rawFootage). The form rawFootage value is only used by the non-V3 single-task path.
- **Vị trí:** `src/lib/velox-helpers.ts:609-610; src/components/dashboard/DashboardActionWrapper.tsx:130-184; src/components/dashboard/AddTaskModal.tsx:670-674`
- **Đề xuất sửa:** For single-item V3, let a non-empty data.rawFootage override mainItem.previewUrl in the RAW line (pass it into encodeResourcesV3 or post-process the RAW line).

### 5. [LOW · CẦN QUYẾT ĐỊNH UX] Task card '🗺 Map' badge keys on displayType, but the detail modal renders only from manualGraph — a veloxMap-only row shows a badge with no map
- **Luồng:** multihook-map
- **Người dùng gặp gì:** A task whose TaskRawFootage has displayType=MULTI_HOOK_MAP but no manualGraph (e.g. a Velox auto-scan saved via saveRawFootageMap, which sets displayType=MULTI_HOOK_MAP and veloxMap but leaves manualGraph null) shows a '🗺 Map' badge in the task list. When the user opens that task, the Assets tab shows a normal RAW Assets link row with no map panel — the badge promised a map the detail view cannot show. Mildly misleading.
- **Tái hiện:** 1. Have a TaskRawFootage row with displayType='MULTI_HOOK_MAP' and veloxMap set but manualGraph null (produced by saveRawFootageMap, not saveHookGraph). 2. View the task list → the row shows the '🗺 Map' badge. 3. Open the task → Assets tab → no Multi-hook Map pill/panel; just the standard RAW Assets LinkRow.
- **Mong đợi:** The card badge should reflect the same data the detail modal renders (presence of a real manualGraph with ≥1 block), so a badge always corresponds to an openable map.
- **Thực tế:** NewDesktopTaskTable shows the badge whenever `task.rawFootage?.displayType === 'MULTI_HOOK_MAP'`, while getHookGraph returns graph=null unless row.manualGraph parses, and TaskDetailModal only renders the map when res.graph.blocks.length > 0. The two conditions can diverge.
- **Vị trí:** `src/components/NewDesktopTaskTable.tsx:627-644; src/actions/raw-footage-actions.ts:215-252 (saveRawFootageMap sets displayType without manualGraph), :338-348 (getHookGraph reads manualGraph)`
- **Đề xuất sửa:** Decide what '🗺 Map' should mean: either include a manualGraph-presence flag in the task query and badge on that, or keep the badge for displayType but make the detail view fall back to rendering the veloxMap. Which artifact the badge represents is a product choice, so isDesignDecision=true. Note: currently saveRawFootageMap/setRawFootageDisplayType are not wired into the Add Task click path (only saveHookGraph is), so this is reachable mainly via the action layer / a future Velox-save wiring — hence low confidence that a user hits it today.

## Đã kiểm → AN TOÀN (không phải lỗi)
- **Đóng chợ task → user KHÔNG claim được:** check `marketplaceOpen` nằm trong transaction + version optimistic-lock (`claim-actions.ts`). TOCTOU đã đóng. ✅
