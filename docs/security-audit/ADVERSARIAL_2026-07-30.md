# Vòng phản biện — 8 commit vá bảo mật (2026-07-30)

> 16 agent: mỗi commit 1 người soi độc lập + 1 người BÁC BỎ độc lập (mặc định nghi ngờ).
> **31 cáo buộc → 26 sống sót** sau bác bỏ. ⚠️ Chưa qua Codex (không khả dụng tới 2026-08-04).

## Bảng tổng

| Commit | Cụm | Nêu | Sống sót |
|---|---|---|---|
| `8dde6eb` | 3-high | 4 | **3** |
| `95be7eb` | tien-luong | 8 | **8** |
| `38550a8` | ma-chet | 2 | **2** |
| `b62ed3d` | phien-env | 2 | **2** |
| `1c00055` | cong-khach | 6 | **5** |
| `b581e3a` | phan-quyen-action | 4 | **3** |
| `d5aaef1` | mcp-cron | 3 | **2** |
| `83b0aea` | ro-du-lieu-ha-tang | 2 | **1** |

## Phát hiện còn sống, xếp theo mức

### HIGH · `8dde6eb` · R-1 — H1 vá ở crm-actions.ts nhưng ĐÚNG primitive đó còn nguyên ở getLastClientNote — chính hàm mà commit này phân tích trong phần H2

- **Loại:** INCOMPLETE_FIX
- **Vị trí:** `src/actions/velox-helpers-actions.ts:91`
- **Cáo buộc:** H1 được định nghĩa là 'chấm quyền theo profile của workspace, lấy dữ liệu theo claim sessionProfileId'. Bản vá thay 11 chỗ trong crm-actions.ts bằng resolveActiveProfileId, nhưng getLastClientNote — hàm mà chính commit message dẫn ra làm đường đưa notes_vi về màn hình admin ('công tắc kế thừa ghi chú của Velox lấy ghi chú updatedAt mới nhất') — vẫn giữ nguyên khuôn cũ: cổng theo workspace, phạm vi theo claim. Đây là 'vá ở nơi gọi, không vá ở điểm nghẽn': tác giả đã ĐỌC hàm này (để viết phần H2) mà không thấy nó mang cùng lỗi.

**Kịch bản hỏng**

Nhân sự thường của agency A (ProfileAccess role USER, không admin ở bất kỳ workspace nào của A) gọi createProfileForUser('x') → tự thành OWNER profile B; gọi createWorkspaceAction → W_B (OWNER). Claim sessionProfileId vẫn là A (claim hợp lệ của chính họ; layout không ghi đè claim). Họ POST server action getLastClientNote(clientId, W_B) qua header Next-Action. verifyWorkspaceAccess(W_B,'ADMIN') PASS (OWNER của B) → profileId = A → workspaceIds = mọi workspace ACTIVE của A → trả về { note: notes_vi, sourceTitle, sourceClientName } tức brief nội bộ mới nhất của khách đó trong A. Client.id là Int tự tăng nên dò tuần tự clientId = dump tên khách + ghi chú nội bộ toàn profile A cho một người không có quyền admin ở A. Đúng nguyên văn đường khai thác mà commit mô tả cho H1, chỉ khác hàm.

**Bằng chứng**

```
velox-helpers-actions.ts:90-104
        const { user } = await verifyWorkspaceAccess(workspaceId, 'ADMIN')
        const profileId = (user as any)?.sessionProfileId
        if (!profileId) return null
        // All ACTIVE workspaces in the current profile
        const profileWorkspaces = await prisma.workspace.findMany({
            where: { profileId, status: 'ACTIVE' },
            select: { id: true },
        })
        const workspaceIds = profileWorkspaces.map((w) => w.id)
        const clients = await prisma.client.findMany({
            where: { OR: [{ profileId }, { workspaceId: { in: workspaceIds } }], status: { not: 'SOFT_DELETED' } },

velox-helpers-actions.ts:133-157
        const task = await prisma.task.findFirst({
            where: { workspaceId: { in: workspaceIds }, clientId: { in: matchingIds }, isArchived: false,
                NOT: [{ notes_vi: null }, { notes_vi: '' }] },
            orderBy: { updatedAt: 'desc' },
            select: { title: true, notes_vi: true, updatedAt: true, client: { select: { name: true } } },
        })
        ...
        return { note: task.notes_vi, sourceTitle: task.title, sourceClientName: task.client?.name ?? 'Unknown', ... }

Security.ts:84-99 xác nhận verifyWorkspaceAccess chấm theo workspace.profileId (không phải claim).
src/app/[workspaceId]/layout.tsx:79-101 chỉ đổi BIẾN CỤC BỘ `profileId`, KHÔNG ghi lại claim JWT ⇒ sessionProfileId vẫn là A khi duyệt workspace của B.
profile-actions.ts:237-277 createProfileForUser là self-service (chỉ cần isSessionLive, hạn mức 5 profile OWNER).
```

**Phán quyết của người bác bỏ** (mức gốc HIGH → **HIGH**)

KHÔNG BÁC BỎ ĐƯỢC — tôi đã cố tìm gate ở tầng trên và không có. Cơ chế đúng như tố cáo: src/actions/velox-helpers-actions.ts:90-91 `const { user } = await verifyWorkspaceAccess(workspaceId,'ADMIN'); const profileId = (user as any)?.sessionProfileId`, mà security.ts:157 trả `user: session.user` ⇒ đúng là claim JWT, không phải profile của workspace. Cổng verifyWorkspaceAccess chấm trên workspace.profileId (security.ts:84-99), nên đúng cặp lệch nguồn mà H1 định nghĩa. Reachability KHÔNG THỂ chối: QuickCreateMode.tsx:39 import trực tiếp `getLastClientNote` vào Client Component và gọi ở dòng 458 — nó chắc chắn có id trong action manifest, không cần lập luận 'theo module' như H3. Chuỗi khai thác chạy được từng mắt: profile-actions.ts createProfileForUser chỉ đòi isSessionLive + hạn mức 5 OWNER ⇒ tự thành OWNER profile B; /api/profile/select route.ts:52-68 cho đổi claim sang BẤT KỲ profile nào có ProfileAccess (nên đổi sang B để createWorkspaceAction qua canCreateWorkspace, rồi đổi ngược về A); layout.tsx:79-101 chỉ gán biến cục bộ `profileId = xAccess.profileId`, KHÔNG ký lại JWT ⇒ claim vẫn là A. Kết quả: verifyWorkspaceAccess(W_B,'ADMIN') PASS vì OWNER của B (security.ts:103-105), rồi dòng 95-104 quét mọi workspace ACTIVE của A và mọi Client của A, dòng 133-148 trả notes_vi + title + client.name. Đây là leo thang THẬT chứ không trùng đường khác: dashboard/tasks/page.tsx:34 lọc `assigneeId: userId` nên MEMBER chỉ thấy task của mình; getClients (đường duy nhất dump danh sách khách) bị verifyFinanceAccess chặn; loadTaskDetail đọc được notes_vi nhưng cần biết taskId (cuid, không dò được), trong khi Client.id là Int tự tăng nên getLastClientNote dò tuần tự được ⇒ dump tên khách + ghi chú nội bộ toàn profile A. Giữ HIGH: cùng primitive, cùng chuỗi khai thác mà chính commit chấm HIGH ở crm-actions.ts, chỉ khác là bị bỏ sót ở đúng hàm mà phần H2 của commit đã đọc để viết ('công tắc kế thừa ghi chú của Velox').

**Vá đề xuất**

Dùng đúng helper mà commit đã chọn: const profileId = (await resolveActiveProfileId(session.user.id, workspaceId, (user as any)?.sessionProfileId)) ?? undefined — và rà thêm các hàm còn đọc Client/User (hai model trong bypassModels ⇒ profileId là bộ lọc tenant DUY NHẤT) bằng claim: user-actions.ts:112,207; invoice-actions.ts:231,366,558,611; velox-batch-actions.ts:139.

---

### MEDIUM · `95be7eb` · R3-1 — confirmPayment: chốt "user thuộc tenant này" là NO-OP — 'User' nằm trong bypassModels và client được tạo KHÔNG có profileId

- **Loại:** WRONG_ASSUMPTION
- **Vị trí:** `src/actions/payroll-actions.ts:70`
- **Cáo buộc:** Bản vá thêm `workspacePrisma.user.findUnique({ where: { id: data.userId } })` và tin rằng "client CÓ PHẠM VI" sẽ trả null cho user ngoài tenant. Đi kiểm cơ chế thì lớp chèn KHÔNG chèn gì cho model User: `User` nằm trong `bypassModels` (không chèn workspaceId) và `currentProfileId` là `undefined` vì dòng 35 gọi `getWorkspacePrisma(workspaceId)` KHÔNG truyền profileId (nhánh profileId có điều kiện `if (currentProfileId && ...)`). Kết quả: truy vấn chạy y hệt `globalPrisma.user.findUnique({ where: { id } })` — không một bộ lọc tenant nào. Chốt mới chỉ chặn được userId KHÔNG TỒN TẠI trên toàn hệ thống.

**Kịch bản hỏng**

ADMIN của workspace A mở DevTools (hoặc POST thẳng tới action id của `confirmPayment` bằng header Next-Action) và gửi `{ userId: '<id nhân sự của tenant B>', baseSalary: 0, bonus: 0, totalAmount: 0 }` cùng workspaceId của A. `targetInScope` tra TOÀN CỤC → tìm thấy → chốt cho qua → `payroll.upsert` ghi một hàng Payroll status='PAID' trong workspace A mang userId của tenant B. Đúng nguyên văn kịch bản mà commit message tuyên bố đã đóng. Hệ quả kép trong chính đợt vá này: `getPaidAssigneeIds()` (payroll-lock.ts:58) sẽ trả về userId lạ đó, nên nếu tenant B từng có người được giao task trong workspace A, chốt sửa tiền bị bật/tắt theo dữ liệu do người ngoài đưa vào.

**Bằng chứng**

```
payroll-actions.ts:35  `const workspacePrisma = getWorkspacePrisma(workspaceId)`   // ← không có profileId
payroll-actions.ts:70-76
    const targetInScope = await workspacePrisma.user.findUnique({
        where: { id: data.userId }, select: { id: true },
    })
    if (!targetInScope) return { error: 'Nhân sự này không thuộc workspace/hồ sơ hiện tại.' }

prisma-workspace.ts:14-23  const bypassModels = ['Profile','User','Workspace','WorkspaceMember',...]
prisma-workspace.ts:118    const isBypassed = bypassModels.includes(model)      // 'User' → true
prisma-workspace.ts:141    if (!isBypassed) baseWhere.workspaceId = currentWorkspaceId   // BỎ QUA
prisma-workspace.ts:143    if (currentProfileId && !hasNoProfile) { ... }                // BỎ QUA (undefined)
prisma-workspace.ts:167    (args as any).where = baseWhere                               // = { id: data.userId }

Đối chiếu khuôn ĐÚNG có sẵn ngay trong cùng file:
payroll-actions.ts:155-159  workspacePrisma.user.findMany({ where: { role: 'USER', workspaces: { some: { workspaceId } } } })
```

**Phán quyết của người bác bỏ** (mức gốc HIGH → **MEDIUM**)

CANNOT REFUTE — the patch is verifiably a no-op. payroll-actions.ts:35 `const workspacePrisma = getWorkspacePrisma(workspaceId)` passes NO profileId, so inside the extension `currentProfileId` is undefined. prisma-workspace.ts:14-23 lists 'User' in `bypassModels`; line 118 `const isBypassed = bypassModels.includes(model)` → true; line 141 `if (!isBypassed) baseWhere.workspaceId = currentWorkspaceId` → skipped; line 143 `if (currentProfileId && !hasNoProfile)` → skipped (undefined). Line 167 therefore assigns `where = { id: data.userId }` verbatim. The new check at payroll-actions.ts:70-76 is literally `globalPrisma.user.findUnique({ where: { id } })` — it only rejects a userId that exists NOWHERE. I looked for an upstream gate: verifyWorkspaceAccess(workspaceId,'ADMIN') at line 33 authenticates the ACTOR only; nothing else touches data.userId before the upsert at line 78. The correct predicate exists 80 lines below in the same file (payroll-actions.ts:155-159 `workspaces: { some: { workspaceId } }`), which proves the author knew the shape. SEVERITY LOWERED from HIGH to MEDIUM on residual impact, not on mechanism: the forged Payroll row is written with `workspaceId: workspaceId` (line 98) so it lives in the attacker's OWN workspace — no cross-tenant READ; and getPayrollData filters users by workspace membership (line 158) so the row is invisible in the payroll UI. Concrete harm is money-data pollution + a bogus entry in getPaidAssigneeIds (payroll-lock.ts:58-66), and it requires ADMIN plus a known foreign user id (realistically obtainable only for same-profile users listed in assignee pickers). The finding's real value is that a control shipped as 'fixed' in the commit message ('confirmPayment đối chiếu data.userId qua client CÓ PHẠM VI') provides zero enforcement — exactly failure mode #1, trusting the comment instead of the mechanism.

**Vá đề xuất**

Dùng đúng vị ngữ mà `getPayrollData` trong cùng file đã dùng: `prisma.user.findFirst({ where: { id: data.userId, workspaces: { some: { workspaceId } } } })`, hoặc gọi `isAssigneeInWorkspaceProfile(data.userId, workspaceId)` (đã có trong src/lib/workspace-membership.ts và đang được bulk-task-actions dùng). Tuyệt đối không dựa vào getWorkspacePrisma cho model nằm trong bypassModels.

---

### MEDIUM · `95be7eb` · R3-2 — Khoá kỳ lương vẫn TỰ ĐỔI ĐƯỢC: khoá tra cứu là TÊN workspace, mà đổi tên chỉ cần ADMIN

- **Loại:** INCOMPLETE_FIX
- **Vị trí:** `src/lib/payroll-lock.ts:43`
- **Cáo buộc:** Commit gọi "MỤC LỚN NHẤT" là việc khoá tra cứu cũ (`task.createdAt`) TỰ ĐỔI ĐƯỢC. Bản vá chuyển khoá sang `extractPayrollCycle(workspace.name)` — nhưng tên workspace cũng do người dùng ghi được, qua `renameWorkspaceAction` chỉ gác ở mức ADMIN. Cùng lúc, `extractPayrollCycle` fail-OPEN: tên không khớp `MM/YYYY` thì trả về THÁNG/NĂM HIỆN TẠI. Nghĩa là (a) một ADMIN đổi tên workspace là mở lại được chốt tiền của kỳ đã trả, và (b) mọi workspace có tên không parse được thì chốt tự hết hiệu lực vào ngày 1 mỗi tháng.

**Kịch bản hỏng**

Workspace tên "07 / 2026", kỳ 07/2026 đã có PayrollLock.isLocked và Payroll PAID. Một ADMIN (KHÔNG phải OWNER, nên không gọi được `revertMonthlyBonus`) vào Cài đặt workspace, đổi tên thành "Tháng 7 - 2026" (đọc y hệt, KHÔNG khớp regex `(\d{1,2})\s*/\s*(\d{4})`). `resolvePayrollCycle` lập tức trả về tháng hiện tại → không tìm thấy PayrollLock, `getPaidAssigneeIds` rỗng → `checkPayrollCycleClosed` trả `closed:false`. Admin sửa tự do `jobPriceUSD`/`value` của mọi task đã trả lương, rồi đổi tên về "07 / 2026". Nhật ký chỉ để lại hai dòng `workspace.updated`; không có dòng nào ở `payroll.bonus_reverted`. Biến thể KHÔNG cần ác ý: bất kỳ workspace nào tên không chứa MM/YYYY (vd "Hustly Team") thì đúng 00:00 ngày 1 tháng sau, chốt của kỳ trước tự mở cho mọi ADMIN.

**Bằng chứng**

```
payroll-lock.ts:38-56
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } })
    const { month, year } = extractPayrollCycle(workspace?.name)
    const lock = await prisma.payrollLock.findUnique({ where: { month_year_workspaceId: { month, year, workspaceId } } ... })

payroll-cycle.ts:24-27  // Fallback: workspace name không có format MM/YYYY → dùng tháng/năm hiện tại
    const now = new Date()
    return { month: now.getMonth() + 1, year: now.getFullYear() }

workspace-actions.ts:111-129
    export async function renameWorkspaceAction(workspaceId: string, newName: string) {
        const { userId } = await verifyWorkspaceAccess(workspaceId, 'ADMIN')   // ← chỉ ADMIN
        await prisma.workspace.update({ where: { id: workspaceId }, data: { name: newName } })

(so sánh: chính commit này siết revertMonthlyBonus lên OWNER + cờ xác nhận + audit chặn — bonus-actions.ts:90-94, 112-123)
```

**Phán quyết của người bác bỏ** (mức gốc HIGH → **MEDIUM**)

CANNOT REFUTE. Verified the chain: payroll-lock.ts:41-51 reads `workspace.name` then `extractPayrollCycle(workspace?.name)`; payroll-cycle.ts:15 matches `/(\d{1,2})\s*\/\s*(\d{4})/` and lines 24-26 fall back to the CURRENT month/year on no match. The lock row is then looked up by the composite `{ month, year, workspaceId }` (payroll-lock.ts:47), so a changed month/year = a different key = `lock` undefined = `isLocked: false`, and getPaidAssigneeIds/isAssigneePaid (lines 60, 76) likewise filter on month/year and return empty. workspace-actions.ts:111-129 gates renaming at `verifyWorkspaceAccess(workspaceId,'ADMIN')` and writes `data: { name: newName }` unconditionally — no PayrollLock/Payroll check. I tried to refute on 'documented owner decision': the commit does record 'kỳ lương xác định theo THÁNG CỦA WORKSPACE' as an owner call, but that ratifies the SOURCE of the cycle, not the consequence that a rename silently reopens a settled cycle — and it directly defeats the OWNER-only gate this same commit added at bonus-actions.ts:90-94, since an ADMIN who cannot call revertMonthlyBonus can reach the same end state with two renames. The non-malicious variant is also real: for any workspace whose name lacks MM/YYYY (e.g. 'Hustly Team'), calculateMonthlyBonus wrote the PayrollLock under the month current AT LOCK TIME (bonus-actions.ts:196, 457-473), so on the 1st of the next month resolvePayrollCycle returns a new key and the gate opens by itself. LOWERED to MEDIUM: requires ADMIN, the rename leaves an audit trail with before/after names (workspace-actions.ts:131-139), and the same name-derived key was already used by confirmPayment/revertPayment/calculateMonthlyBonus before this commit — so it is an inherited weakness this patch extended rather than created.

**Vá đề xuất**

Không suy kỳ lương từ một trường tự do người dùng ghi được. Hoặc (a) đọc kỳ từ chính hàng PayrollLock/Payroll mới nhất của workspace (`payrollLock.findFirst({ where: { workspaceId }, orderBy: [{year:'desc'},{month:'desc'}] })`) rồi mới đối chiếu, hoặc (b) thêm cột `payrollMonth/payrollYear` bất biến trên Workspace, hoặc tối thiểu: fail-CLOSED khi tên không parse (coi như đóng) và chặn `renameWorkspaceAction` khi workspace đã có PayrollLock/Payroll PAID.

---

### MEDIUM · `95be7eb` · R3-3 — Nhánh PAID của chốt (nhánh DUY NHẤT còn sống sau khi trả lương) bị vô hiệu chỉ bằng một lần bỏ gán người

- **Loại:** INCOMPLETE_FIX
- **Vị trí:** `src/lib/payroll-lock.ts:94`
- **Cáo buộc:** `checkPayrollCycleClosed` chỉ hỏi `isAssigneePaid` khi `assigneeId` khác null — quyết định này được ghi trong chú thích. Nhưng KHÔNG đường nào làm rỗng `assigneeId` được gác chốt lương. Nghiêm trọng hơn: `confirmPayment` TỪ CHỐI chạy khi `PayrollLock.isLocked` (payroll-actions.ts:51-53), nên một kỳ ĐÃ TRẢ LƯƠNG trong luồng bình thường KHÔNG có lock — nhánh `isLocked` coi như tắt, và nhánh `isAssigneePaid` là chốt duy nhất còn hiệu lực. Bỏ gán người là gỡ nó.

**Kịch bản hỏng**

Kỳ 07/2026 đã `confirmPayment` cho editor X (⇒ không có PayrollLock, có Payroll PAID). ADMIN muốn nâng `value` của 10 task đã trả của X. Bước 1: tick 10 task → Gán hàng loạt → "Bỏ gán" (`bulkAssignTasks(ids, null, ws)`) — không truy vấn Payroll, đi qua. Bước 2: Sửa hàng loạt → đổi `value` — lúc này `money.assigneeId === null` nên `blocked` = false, ghi thành công, `wageVND`/`profitVND` cũng bị ghi đè. Bước 3: gán lại X, đặt lại status 'Hoàn tất'. Kết quả cuối: task về đúng trạng thái cũ với SỐ TIỀN MỚI, bảng lương đã trả theo số CŨ, không toast cảnh báo nào, không dòng audit nào nói tới lương. Toàn bộ chốt mới bị đi vòng bằng ba thao tác ADMIN thông thường.

**Bằng chứng**

```
payroll-lock.ts:84-97
    const { month, year, isLocked } = await resolvePayrollCycle(workspaceId)
    if (isLocked) return { closed: true, ... reason: 'LOCKED' }
    if (assigneeId && (await isAssigneePaid(workspaceId, month, year, assigneeId))) { ... }
    return { closed: false, month, year, reason: null }

payroll-actions.ts:47-53  (confirmPayment)
    if (cycleLock?.isLocked) return { error: `Kỳ lương ${month}/${year} đã bị KHÓA...`, code: 'PAYROLL_LOCKED' }

bulk-task-actions.ts:814-825  (bulkAssignTasks — verifyWorkspaceAccess(...,'ADMIN'), KHÔNG có một truy vấn Payroll nào)
        } else {
            // UNASSIGN (Back to Global Pool)
            updateData.assigneeId = null
            ...
            updateData.status = 'Đang đợi giao'

bulk-task-actions.ts:297  const touchesMoney = 'jobPriceUSD' in data || 'value' in data   // 'assigneeId' KHÔNG kích hoạt chốt
```

**Phán quyết của người bác bỏ** (mức gốc HIGH → **MEDIUM**)

CANNOT REFUTE on mechanism. payroll-lock.ts:92-96: `if (isLocked) return closed; if (assigneeId && await isAssigneePaid(...))` — a null assignee only meets the cycle-wide flag. bulk-task-actions.ts:814-825 is the unassign branch of bulkAssignTasks: `updateData.assigneeId = null` with `verifyWorkspaceAccess(workspaceId,'ADMIN')` at line 782 and not one Payroll/PayrollLock query in the whole function (I read 778-896). The re-read at bulk-task-actions.ts:312-321 happens AFTER that write, so on the next call `money.assigneeId` is null and line 331-333 computes `blocked = cycle.isLocked || false`. The premise that the isLocked branch is dead in a paid cycle also checks out: calculateMonthlyBonus sets the lock (bonus-actions.ts:457-473) and confirmPayment refuses while locked (payroll-actions.ts:51-53), so a cycle that actually has PAID rows has no lock. bulkUpdateStatus's drag-drop path is a second door — bulk-task-actions.ts:925-928 clears assigneeId with no payroll query either. LOWERED from HIGH to MEDIUM because the same ADMIN has a shorter, already-existing path to the same outcome: revertPayment (payroll-actions.ts:179-222) is ADMIN-gated and its only guard is `lock?.isLocked` (line 200), which is false in exactly the paid-not-locked state — so an ADMIN can simply delete the PAID row, edit the money, and re-confirm. The unassign trick is therefore a real hole in the new gate but not a uniquely severe one; the gate was never ADMIN-proof in the PAID state.

**Vá đề xuất**

Trong `checkPayrollCycleClosed`, khi `assigneeId` là null vẫn phải hỏi thêm: task này có `assigneeId` cũ nào đã PAID trong kỳ không (lưu vết qua audit/`assignedById`), hoặc đơn giản hơn — gác `bulkAssignTasks`/`bulkUpdateTaskDetails` ở nhánh đổi `assigneeId` bằng chính `checkPayrollCycleClosed` với assignee HIỆN TẠI trước khi cho phép bỏ gán.

---

### MEDIUM · `95be7eb` · R3-4 — TaskDetailModal chế độ bulk: chốt chặn ghi tiền nhưng UI báo THÀNH CÔNG và hiển thị số tiền MỚI chưa hề vào DB

- **Loại:** NEW_BUG
- **Vị trí:** `src/components/tasks/TaskDetailModal.tsx:258`
- **Cáo buộc:** Bản vá đổi `bulkUpdateTaskDetails` từ "luôn ghi" thành "bỏ qua âm thầm + trả `skippedPayrollLocked`", rồi chỉ dạy MỘT trong HAI nơi gọi đọc trường đó. `TaskDetailModal.saveSingle` (nơi gọi thứ hai, chính là thẻ Tài chính) bỏ qua `skippedPayrollLocked`, thấy `res.success === true` là bắn toast XANH rồi `return true` — và `handleSaveFinance` dùng giá trị trả về đó để cập nhật lạc quan `setForm`/`setLocalTask` với SỐ TIỀN MỚI.

**Kịch bản hỏng**

ADMIN tick 5 task thuộc kỳ đã trả lương, mở TaskDetailModal, sửa 'Giá job (USD)' 300 → 500, bấm Lưu. Server bỏ qua cả 5 (`count: 0`). Modal hiện toast MÀU XANH "Đã cập nhật 0 task", đóng ô sửa, và ô Tài chính trên màn hình đổi sang 500 USD. Không có một chữ nào nói kỳ lương đã đóng. Admin đóng modal, tin là đã sửa xong, và tiếp tục ra quyết định (báo giá / đối soát) dựa trên con số 500 chỉ tồn tại trong state React. Ở chế độ MỘT task, cùng file dòng 272 nuốt luôn câu `payrollClosedMessage` mà commit này viết ra (`toast.error('Lưu thất bại')` cứng), nên admin cũng không bao giờ biết lý do là kỳ lương.

**Bằng chứng**

```
TaskDetailModal.tsx:257-264 (saveSingle)
        if (isBulkMode && bulkSelectedIds) {
            const res = await bulkUpdateTaskDetails(bulkSelectedIds, patch, workspaceId) as any
            if (res?.success) {
                toast.success(`Đã cập nhật ${res.count ?? bulkSelectedIds.length} task`)
                return true
            }

TaskDetailModal.tsx:444-456 (handleSaveFinance)
        const ok = await saveSingle({ jobPriceUSD: ..., value: ... })
        if (ok) {
            setForm((p) => ({ ...p, jobPriceUSD: ..., value: ... }))
            setLocalTask((p) => (p ? { ...p, jobPriceUSD: ..., value: ... } : null))
            setEditingFinance(false)

bulk-task-actions.ts:401-405 — server trả { success: true, count: 0, skippedPayrollLocked: [...] } khi TẤT CẢ bị chặn (không phải { error }).
```

**Phán quyết của người bác bỏ** (mức gốc HIGH → **MEDIUM**)

CANNOT REFUTE — verified line by line. bulk-task-actions.ts:401-405 returns `{ success: true, count: taskIds.length - skippedTitles.length, skippedPayrollLocked: skippedTitles }` even when every task was skipped (count 0, no `error` key). TaskDetailModal.tsx:257-264 only reads `res?.success` and fires `toast.success('Đã cập nhật 0 task')` then `return true`; handleSaveFinance at lines 444-457 uses that return to run `setForm`/`setLocalTask` with the NEW jobPriceUSD/value, so the modal displays money that never reached the DB. This file is NOT in the commit's diffstat — the author patched the server and taught only BulkEditTaskModal.tsx:114-135 to read `skippedPayrollLocked`, missing the second caller (failure mode #2, patching one call site). I checked reachability: `bulkSelectedIds` is passed with real selections from NewDesktopTaskTable.tsx:860 and TaskWorkflowTabs.tsx:1034, and TaskMainSection is rendered at TaskDetailModal.tsx:684-713 with no isBulkMode prop, so the Finance card is live in bulk mode. The single-task half is equally real: update-task-details.ts:83-86 returns `{ error: payrollClosedMessage(gate) }`, and TaskDetailModal.tsx:272 hardcodes `toast.error('Lưu thất bại')`, discarding the very message this commit created. LOWERED to MEDIUM: the green toast still literally prints the true count ('0 task'), the page revalidates, and the stale optimistic value dies on refresh — so it misleads rather than corrupts stored data.

**Vá đề xuất**

Trong `saveSingle`: đọc `res.skippedPayrollLocked`; nếu mảng khác rỗng → `toast.warning` liệt kê task và `return false` khi `res.count === 0` (để không cập nhật lạc quan). Ở nhánh một-task, thay `toast.error('Lưu thất bại')` bằng `toast.error(res?.error ?? 'Lưu thất bại')`.

---

### MEDIUM · `b62ed3d` · R4-1 — Hạn tuyệt đối 90 ngày bị vô hiệu hoàn toàn qua POST /api/profile/select — route này ký lại session JWT mà không hề đọc authAt

- **Loại:** INCOMPLETE_FIX
- **Vị trí:** `src/app/api/profile/select/route.ts:89`
- **Cáo buộc:** SESSION_ABSOLUTE_MAX_AGE chỉ được cưỡng chế ở ĐÚNG MỘT nơi (src/middleware.ts:178). Nhưng middleware KHÔNG phải bề mặt gia hạn phiên duy nhất: /api/profile/select cũng ký lại một session JWT mới và Set-Cookie, và nó không tham chiếu authAt hay SESSION_ABSOLUTE_MAX_AGE. Tệ hơn, middleware return sớm cho mọi path bắt đầu bằng '/api' (middleware.ts:26-32) nên route này nằm hoàn toàn ngoài vòng kiểm soát vừa thêm. Đây đúng kiểu 'vá ở nơi gọi, không vá ở điểm nghẽn': grep toàn repo cho SESSION_ABSOLUTE_MAX_AGE/authAt chỉ ra middleware.ts:177-178 là điểm cưỡng chế duy nhất.

**Kịch bản hỏng**

Kẻ tấn công có một bản sao chuỗi session JWT (đúng mô hình đe doạ mà N8 đặt ra). JWT là JWS ký chứ không mã hoá, nên hắn base64-decode payload và đọc được claim `profileId`/`sessionProfileId`. Cứ ≤7 ngày một lần hắn gửi: `curl -X POST https://hustlytasker.xyz/api/profile/select -H 'Cookie: session=<JWT đánh cắp>' -H 'Content-Type: application/json' -d '{"profileId":"<lấy từ payload>"}'`. Route trả 200 kèm `Set-Cookie: session=<JWT MỚI>` — chuỗi token hoàn toàn mới, exp +1 tuần, authAt vẫn là mốc cũ nhưng KHÔNG AI ĐỌC. Lặp vô hạn ⇒ mốc 90 ngày (quyết định của chủ dự án) không bao giờ chạm tới, đúng lỗ hổng N8 mà commit này tuyên bố đã đóng. Chốt duy nhất còn lại là isSessionLive nội tuyến ở route (LOCKED + sessionVersion), tức nạn nhân PHẢI chủ động bấm 'đăng xuất mọi thiết bị' — mà kịch bản của N8 chính là nạn nhân không hề biết để mà bấm.

**Bằng chứng**

```
src/app/api/profile/select/route.ts:75-97 —
        const newPayload = {
            ...session,
            user: {
                ...session.user,
                sessionProfileId: profileId 
            }
        };
        const expires = session.expires ? new Date(session.expires) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        newPayload.expires = expires;
        const { encrypt } = await import('@/lib/auth');
        const newSessionToken = await encrypt(newPayload);   // ← không có ttl ⇒ mặc định '1 week' (jwt.ts:30)
        ...
        const sessionCookieString = `session=${newSessionToken}; Path=/; HttpOnly; ...`;
        response.headers.append('Set-Cookie', sessionCookieString);

Đối chiếu điểm cưỡng chế duy nhất, src/middleware.ts:177-179 —
        const sessionAge = Date.now() - (sessionPayload.user.authAt ?? 0)
        const withinAbsoluteWindow = sessionAge < SESSION_ABSOLUTE_MAX_AGE * 1000
        if (msLeft > 0 && msLeft < (SESSION_MAX_AGE * 1000) / 2 && withinAbsoluteWindow) {

và src/middleware.ts:26-31 (route /api không bao giờ chạy qua đoạn refresh trên) —
        pathname.startsWith('/api') ||
        ...
    ) {
        return NextResponse.next()
    }

grep toàn repo: `SESSION_ABSOLUTE_MAX_AGE` chỉ xuất hiện ở src/lib/jwt.ts:22 (định nghĩa) và src/middleware.ts:3,178 (dùng). Không nơi nào khác.
```

**Phán quyết của người bác bỏ** (mức gốc HIGH → **MEDIUM**)

XÁC NHẬN CƠ CHẾ — không bác bỏ được. (1) Middleware thật sự không bao giờ chạm route này: src/middleware.ts:201 `matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)']` loại /api ở tầng cấu hình, và src/middleware.ts:26 `pathname.startsWith('/api') || … return NextResponse.next()` loại lần hai. (2) src/app/api/profile/select/route.ts:89 `const newSessionToken = await encrypt(newPayload);` — gọi KHÔNG có tham số ttl ⇒ src/lib/jwt.ts:30 `export async function encrypt(payload: any, ttl: string = '1 week')` cấp exp mới 1 tuần; và newPayload (route.ts:75-81) chép nguyên `...session.user` nên authAt được MANG THEO nhưng KHÔNG AI ĐỌC trong toàn file. (3) Tôi đã grep `authAt|SESSION_ABSOLUTE_MAX_AGE` trên toàn src/: chỉ có middleware.ts:177-178 (nơi cưỡng chế duy nhất), lib/auth.ts:20-22,39-40 (nơi ghi claim), lib/jwt.ts:20,22 (định nghĩa). Đúng như người tố cáo nói. (4) Tôi cố tìm gate tầng trên và KHÔNG có: route chỉ có getSession() (src/lib/auth.ts:115-124 — chỉ decrypt, không đọc DB, tự ghi chú 'KHÔNG check sessionVersion ở đây'), rồi LOCKED (route.ts:40) và sessionVersion (route.ts:43) — cả hai chỉ chặn khi NẠN NHÂN đã chủ động thu hồi, đúng tình huống N8 giả định nạn nhân không biết. Không có CSRF token, không kiểm Origin; call site thật (src/components/dashboard/DashboardTopBar.tsx:62, UserHomeTopBar.tsx:108) xác nhận hợp đồng là POST JSON {profileId} + cookie, tái lập bằng curl được. (5) Tôi cũng kiểm hai đường ký lại phiên khác xem có bypass mềm hơn không: src/actions/user-actions.ts:67 và src/actions/profile-actions.ts:595 đều gọi `login({...session.user, sessionVersion})` — thao tác này RESET authAt = Date.now(), nhưng cả hai nằm sau `bcrypt.compare(currentPassword, user.password)` (user-actions.ts:52 / profile-actions.ts:571) nên cần mật khẩu thật ⇒ không phải bypass. Vậy /api/profile/select là đường vòng DUY NHẤT, và nó vô hiệu hoá hoàn toàn mốc tuyệt đối trên nhánh đó. HẠ MỨC HIGH→MEDIUM: sổ cái gốc docs/security-audit/SWEEP_2026-07-30.md:147 ghi '#### [?] N8 — Medium'. Đây là chốt KIỀM CHẾ hậu-xâm-nhập (tiền đề: kẻ tấn công đã cầm JWT hợp lệ), không phải chốt kiểm soát truy cập; bản vá lỗi ở chỗ bỏ sót nhánh chứ không tạo lỗ mới. Sửa không trọn một mục Medium = Medium, không nâng lên High.

**Vá đề xuất**

Thêm cùng một gác vào /api/profile/select trước khi ký lại (và tốt hơn là đưa nó vào một helper dùng chung với middleware): `const authAt = (session.user as any).authAt ?? 0; if (Date.now() - authAt >= SESSION_ABSOLUTE_MAX_AGE * 1000) return 401`. Đồng thời kẹp exp của token mới không vượt quá `authAt + SESSION_ABSOLUTE_MAX_AGE`.

---

### MEDIUM · `1c00055` · R5-1 — Trần 20 GB không chặn được cơ chế OOM mà chính route.ts đã mổ xẻ — OOM là THEO TỆP, không theo tổng

- **Loại:** WRONG_ASSUMPTION
- **Vị trí:** `src/lib/review/download-zip.ts:23`
- **Cáo buộc:** Chú thích của bản vá khẳng định trần 20 GB "chặn được kịch bản ... đã làm OOM function 3009 MB trên production". Sai. Post-mortem nằm ngay đầu route mà bản vá phục vụ nói rõ bộ nhớ tiêu tốn ≈ kích thước MỘT tệp (vòng `await entryDone` chỉ ghìm GIỮA các tệp), nên một tệp đơn đủ lớn vẫn giết function ở tổng byte thấp hơn trần rất nhiều. Trần TỔNG là đại lượng sai. Sổ ghi chép cũng đã tự nói điều này (SWEEP_2026-07-30.md:266: phương án (A) "KHÔNG xoá được nguy cơ OOM vì byte vẫn chui qua function"), nhưng commit lại trình bày nó như đã chữa.

**Kịch bản hỏng**

Nhân viên (MEMBER bình thường, không cần ác ý) chọn một thư mục giao hàng chứa một master ProRes 4K ~4 GB (hợp lệ: VIDEO_MAX_BYTES = 5 GB) và bấm Tải cả thư mục. totalBytes ≈ 4 GB < 20 GB ⇒ trần KHÔNG kích hoạt ⇒ function đọc tệp từ R2 nhanh hơn trình duyệt nhận ⇒ vượt 3009 MB ⇒ instance bị giết ⇒ KHÔNG có phản hồi HTTP ⇒ trình duyệt quay vòng vĩnh viễn. Đúng sự cố production 2026-07-29, không đổi gì. Ngược lại, trần 20 GB gần như không bao giờ chạm được trong 300s (maxDuration) nên nó chỉ chặn đúng những trường hợp mà timeout đã chặn sẵn.

**Bằng chứng**

```
download-zip.ts:17-23 — "20 GB: ... chặn được kịch bản 'chọn thư mục gốc lớn nhất rồi bấm tải' đã làm OOM function 3009 MB trên production"; const MAX_ZIP_BYTES = 20 * 1024 * 1024 * 1024

src/app/api/review/download-zip/route.ts:5-11 — "Sự thật: byte phải chui qua function, nên bộ nhớ function tiêu tốn = (byte ĐỌC được từ R2) − (byte trình duyệt ĐÃ NHẬN) ... hiệu số đó phình lên xấp xỉ kích thước file. Vòng `await entryDone` bên dưới chỉ chặn giữa CÁC file — bên trong MỘT file thì không có gì ghìm cả. Log production đã chứng minh: 'instance was killed because it ran out of available memory' trên chính route này, với một video 964 MB."

src/lib/review/media-constants.ts:80 — export const VIDEO_MAX_BYTES = BigInt(5 * 1024 * 1024 * 1024)
```

**Phán quyết của người bác bỏ** (mức gốc HIGH → **MEDIUM**)

KHÔNG BÁC BỎ ĐƯỢC — cơ chế đúng như người tìm lỗi mô tả, và chính sổ ghi chép đã nói thế.

(a) Cơ chế OOM là THEO TỆP, không theo tổng: src/app/api/review/download-zip/route.ts:5-11 — "bộ nhớ function tiêu tốn = (byte ĐỌC được từ R2) − (byte trình duyệt ĐÃ NHẬN) ... hiệu số đó phình lên xấp xỉ kích thước file. Vòng `await entryDone` bên dưới chỉ chặn giữa CÁC file — bên trong MỘT file thì không có gì ghìm cả." Và :9-11 ghi log production: instance bị giết "với một video 964 MB" — tức NGƯỠNG GIẾT THẬT là dưới 1 GB một tệp, thấp hơn trần tổng 20 GB hai chữ số lần.

(b) Chú thích bản vá khẳng định ngược lại: src/lib/review/download-zip.ts:19-21 — "20 GB: ... chặn được kịch bản 'chọn thư mục gốc lớn nhất rồi bấm tải' đã làm OOM function 3009 MB trên production." Một thư mục chứa một master 4 GB (hợp lệ, VIDEO_MAX_BYTES = 5 GB tại src/lib/review/media-constants.ts:80) cho totalBytes ≈ 4 GB < MAX_ZIP_BYTES ⇒ chốt ở :127/:155 KHÔNG kích hoạt ⇒ đúng sự cố 2026-07-29 lặp lại nguyên vẹn.

(c) Sổ ghi chép đã tự nói điều này trước khi vá: docs/security-audit/SWEEP_2026-07-30.md, mục NEW-internal-zip-no-cap, ❓Cần quyết — phương án (A) "KHÔNG xoá được nguy cơ OOM vì byte vẫn chui qua function (chính chú thích route.ts:16-18 nói vậy)". Bản vá chọn (A) rồi viết chú thích như thể đã chữa.

HẠ TỪ HIGH XUỐNG MEDIUM: (i) bản vá KHÔNG tạo ra lỗ mới và không làm rủi ro OOM nặng thêm — nó là rủi ro có sẵn; (ii) cảnh báo ĐÚNG vẫn còn nguyên ở đầu chính route đó (route.ts:14-17: "ĐÓ LÀ GIẢM NHẸ, KHÔNG PHẢI CHỮA KHỎI: một thư mục đủ lớn vẫn giết được function ... Chưa làm."), kèm nhãn "⚠️ ĐỌC TRƯỚC KHI MỞ RỘNG ĐƯỜNG NÀY" — nên bán kính hiểu nhầm hẹp hơn người tìm lỗi giả định; (iii) trần 20 GB VẪN có tác dụng thật, chỉ là với đại lượng khác: chi phí egress. Khiếm khuyết còn lại là chú thích khẳng định một tác dụng không có — đúng kiểu lỗi "tin mô tả thay vì truy cơ chế" đã tái diễn trong chiến dịch này, nên vẫn phải sửa lời văn.

**Vá đề xuất**

Trần phải đặt THEO TỆP, không theo tổng: từ chối (hoặc chuyển sang URL ký sẵn cho client tự tải) mọi version có sizeBytes vượt một ngưỡng an toàn dưới bộ nhớ function (ví dụ ~1 GB với 3009 MB), và sửa lại chú thích để không khẳng định đã chữa OOM. Nếu giữ trần tổng thì phải nói rõ nó chỉ chặn CHI PHÍ/EGRESS chứ không chặn OOM.

---

### MEDIUM · `1c00055` · R5-2 — Trần byte cộng dồn `sizeBytes` do CHÍNH client khai báo và không bao giờ được đối chiếu lại với object thật trên R2

- **Loại:** INCOMPLETE_FIX
- **Vị trí:** `src/lib/review/download-zip.ts:126`
- **Cáo buộc:** Commit tự khoe đã bắt được bẫy `?? 0` che select thiếu `sizeBytes`. Nhưng bẫy sâu hơn nằm ở chính trường đó: `ReviewVersion.sizeBytes` được ghi DUY NHẤT từ giá trị client tự khai ở bước initiate, và `completeUpload` tuy đọc kích thước THẬT bằng headObject nhưng chỉ SO SÁNH với capForKind rồi vứt đi — không bao giờ ghi lại vào DB. Vậy trần byte mới đang đo một con số do đúng kẻ nó định chặn (MEMBER) tự chọn.

**Kịch bản hỏng**

MEMBER (editor/freelancer, hoặc tài khoản bị chiếm) gọi thẳng POST /api/review/uploads/initiate với sizeBytes="1" rồi PUT lên URL ký sẵn một tệp 4,9 GB thật (dưới VIDEO_MAX_BYTES nên completeUpload chấp nhận, và DB vẫn giữ sizeBytes=1). Lặp lại N lần vào một thư mục. Sau đó GET /api/review/download-zip?folders=<thư mục đó>: totalBytes = N byte, trần 20 GB không bao giờ chạm, function stream vài trăm GB — trần byte trở thành trang trí đúng với kẻ tấn công mà mục NEW-internal-zip-no-cap nêu tên ("bất kỳ tài khoản có WorkspaceMember mức MEMBER").

**Bằng chứng**

```
download-zip.ts:126 — totalBytes += Number(cv.sizeBytes ?? 0)  và :154 — totalBytes += sizeById.get(x.versionId) ?? 0

src/app/api/review/uploads/initiate/route.ts:16,32-33 — sizeBytes: z.string().regex(/^\d+$/…) … sizeBytes: BigInt(parsed.data.sizeBytes)   ← client tự khai

src/lib/review/upload-service.ts:576-587 — "[C1] ... `initiate` only checked the CLIENT-declared sizeBytes and the presigned PUT/parts pin no Content-Length, so the real object can far exceed the cap" ; const stored = await headObject(session.r2Key); if (stored && BigInt(stored.size) > capForKind(version.mediaKind)) { … }  ← chỉ REJECT khi vượt cap, KHÔNG có prisma.reviewVersion.update({ data: { sizeBytes: stored.size } }). Grep toàn repo: `sizeBytes:` chỉ được set ở upload-service.ts:255/346/812/916, tất cả đều = input.sizeBytes.
```

**Phán quyết của người bác bỏ** (mức gốc MEDIUM → **MEDIUM**)

KHÔNG BÁC BỎ ĐƯỢC — tôi đã đi hết mọi đường ghi `sizeBytes` và không tìm được chỗ nào đối chiếu lại với object thật.

(a) Nguồn duy nhất là client tự khai: src/app/api/review/uploads/initiate/route.ts:16 `sizeBytes: z.string().regex(/^\d+$/…)` → :33 `sizeBytes: BigInt(parsed.data.sizeBytes)`; src/lib/review/upload-service.ts:255 `sizeBytes: input.sizeBytes` trong `createVersionWithRetry`. (Đường task-upload/initiate/route.ts:18,34 y hệt.)

(b) `completeUpload` ĐỌC kích thước thật nhưng vứt đi: upload-service.ts:576-586 — chú thích [C1] tự nói "`initiate` only checked the CLIENT-declared sizeBytes and the presigned PUT/parts pin no Content-Length, so the real object can far exceed the cap"; mã bên dưới `const stored = await headObject(session.r2Key); if (stored && BigInt(stored.size) > capForKind(version.mediaKind)) { … }` — chỉ SO SÁNH với cap rồi bỏ, KHÔNG có update nào.

(c) Tôi grep toàn bộ `reviewVersion.update` / `updateMany` trong src/ (28 chỗ: comments.ts:438/558, folders.ts:1221…1613, inngest.ts:98…456, purge.ts:118-119, share-*.ts, upload-service.ts:289/431/543/624/983/1056, versions.ts:177…349) — KHÔNG chỗ nào ghi `sizeBytes`. Kể cả nhánh Mux/transcode (inngest.ts) cũng không sửa lại. Vậy DB giữ vĩnh viễn con số client khai.

Đường khai thác cụ thể đứng vững: MEMBER khai `sizeBytes:"1"`, mimeType video → initiateUpload chấp nhận (:149 chỉ chặn ≤0, :152 chỉ chặn > cap), `computePartSize(1)` cho single presigned PUT không pin Content-Length → PUT thật 4,9 GB → completeUpload thấy 4,9 GB < VIDEO_MAX_BYTES 5 GB nên promote READY, DB vẫn `sizeBytes = 1`. download-zip.ts:126 và :142/:154 cộng đúng con số 1 đó ⇒ MAX_ZIP_BYTES không bao giờ chạm ⇒ trần byte vô hiệu với đúng kẻ tấn công mà mục này nêu tên.

GIỮ MEDIUM (không nâng): thiệt hại còn bị chặn bởi hai chốt khác trong cùng hàm — `MAX_ZIP_FILES = 1000` (:16, kiểm ở :157/:159) và chính bộ đếm mới `limitDb('zip:'+userId+':'+workspaceId, 12, 600)` (:109). Và theo R5-1 thì trần byte vốn không phải chốt OOM, nên cái bị vô hiệu ở đây là chốt CHI PHÍ/EGRESS, không phải chốt sập dịch vụ. Ghi chú công bằng cho bản vá: đây là điểm yếu CÓ SẴN của trường `sizeBytes`, nhưng bản vá này là thứ đầu tiên biến nó thành một chốt an ninh, nên trách nhiệm kiểm chứng thuộc về bản vá.

**Vá đề xuất**

Ghi kích thước THẬT về DB trong completeUpload (`prisma.reviewVersion.update({ where: { id: version.id }, data: { sizeBytes: BigInt(stored.size) } })` ngay sau khi headObject xác nhận và trước khi promote READY). Chừng nào chưa làm, trần byte chỉ có giá trị với dữ liệu tải qua UI và phải ghi rõ như vậy.

---

### MEDIUM · `1c00055` · R5-3 — `portal-req-profile:{profileId}` là xô chung số phận cấp TENANT — đúng lỗi commit tuyên bố loại bỏ, chỉ khác là bán kính rộng gấp trăm lần

- **Loại:** WORSE_THAN_BUG
- **Vị trí:** `src/actions/share-portal-actions.ts:1366`
- **Cáo buộc:** Luận điểm trung tâm của commit là "xô theo LINK là XÔ CHUNG SỐ PHẬN" và bộ đếm bền không tự lành sau cold-start nên biến lỗ lạm dụng thành lỗ chặn dịch vụ. Nhưng tầng "người nhận" mà bản vá thêm vào lại khoá theo `scope.profileId` — tức TOÀN BỘ tenant — với hạn mức 20/giờ, bền, `failClosed: true`, và được tính TRƯỚC cả bước kiểm tra input. Cùng hình dạng ở :1750 với `portal-comment-mgr:{assignedById}` (60/giờ, chung cho mọi khách của một Manager, mọi link).

**Kịch bản hỏng**

Người từng nhận một link /share đã chuyển tiếp (hoặc một khách cũ chưa bị revoke) của agency X gọi `submitClientRequestViaToken` 20 lần với payload rỗng, từ 2 IP (tầng IP là 10/giờ). Sau ~1 phút, MỌI khách hàng của MỌI workspace thuộc profile X không gửi được yêu cầu việc nào cho tới hết giờ đó, và bộ đếm bền không tự lành. Một cron mỗi đầu giờ = khoá vĩnh viễn với giá 20 request/giờ. Trước bản vá, chốt in-memory theo link không tạo được hiệu ứng này (reset mỗi cold-start, và phạm vi chỉ một link).

**Bằng chứng**

```
share-portal-actions.ts:1360-1368 —
{
    const ip = await getRequestIp()
    if (ip !== 'unknown') { const ipRl = await limitDb(`portal-req-ip:${ip}`, 10, 60*60, { failClosed: true }); … }
    const adminRl = await limitDb(`portal-req-profile:${scope.profileId}`, 20, 60 * 60, { failClosed: true })
    if (!adminRl.success) return { success: false, error: 'Too many requests. Please try again later.' }
}
// :1371 mới bắt đầu validate input — tức payload rác cũng đốt được quota

Đối chiếu chính lời commit (:1355-1357): "xô theo LINK là xô chung số phận, và bộ đếm BỀN thì không tự lành sau cold-start nữa, nên ai cầm link chuyển tiếp chỉ cần bắn hết quota là khách THẬT mất quyền gửi yêu cầu."
```

**Phán quyết của người bác bỏ** (mức gốc MEDIUM → **MEDIUM**)

KHÔNG BÁC BỎ ĐƯỢC — tôi đã thử bác theo hướng "chủ ý và có tài liệu" và nó không đủ.

Hướng bác đã cân nhắc: file này có học thuyết rõ ràng rằng xô theo NGƯỜI NHẬN là hợp lệ dù dùng chung — share-portal-actions.ts:626-629 (`portal-notify-inbox:{inboxKey}` 10/24h) gọi đó là "chốt SẮC". Theo học thuyết đó, `profileId` ĐÚNG là người nhận (mỗi lượt gửi 1 email cho MỖI OWNER/ADMIN của profile). Nhưng học thuyết đó không xoá được hệ quả, và bản thân commit đã dùng chính hệ quả này để bác bỏ khoá-theo-link.

Mã thật: share-portal-actions.ts:1360-1368 — tầng IP `portal-req-ip:{ip}` 10/giờ failClosed, rồi `portal-req-profile:${scope.profileId}` 20/giờ, `failClosed: true`, BỀN. Xác nhận thứ tự: validate input mới bắt đầu ở :1370-1375 (`typeof input.workspaceId !== 'string'`…) và validate link ở :1387-1408 — tức payload rác VẪN đốt quota.

Hai kịch bản hỏng, cả hai đều cụ thể:
· Có kẻ tấn công: người cầm link chuyển tiếp (đúng mô hình đe doạ mà mục N9 nêu ở SWEEP_2026-07-30.md: "link được chuyển tiếp, khách cũ, link chưa revoke") bắn 20 lượt từ 2 IP ⇒ MỌI khách của MỌI workspace thuộc profile đó mất quyền gửi yêu cầu tới hết giờ; bộ đếm bền nên không tự lành sau cold-start; cron mỗi giờ = khoá vĩnh viễn với giá 20 request/giờ. Trước bản vá, `rateLimit()` in-memory theo shareLinkId không tạo được hiệu ứng này (reset mỗi cold-start, phạm vi một link).
· KHÔNG cần kẻ tấn công: vì limiter đứng TRƯỚC mọi validate, một khách thật điền sai link raw-footage 20 lần (SharePortalClient.tsx:55 gọi thẳng action, lỗi trả về từ :1388) là khoá toàn tenant.

Cùng hình dạng ở :1749-1752 `portal-comment-mgr:${task.assignedById}` 60/giờ — chung cho mọi khách của một Manager trên MỌI link; người cầm link bắn 60 lượt (2 IP, tầng IP 30/giờ) là mọi khách hàng của Manager đó không bình luận được nữa.

GIỮ MEDIUM, không nâng lên HIGH: đây là chặn dịch vụ có giới hạn thời gian trên một bề mặt khách, không phải rò dữ liệu hay vượt quyền, và tầng IP buộc kẻ tấn công phải xoay IP. Không hạ được xuống LOW vì đường tự-DoS không cần kẻ tấn công là có thật và bán kính là toàn tenant.

**Vá đề xuất**

Nếu vẫn muốn tầng người nhận thì nới hạn mức lên mức phản ánh lưu lượng thật của cả tenant (hoặc khoá theo (profileId, canonical inbox của từng admin) như `portal-notify-inbox` đã làm), đặt SAU khi input đã hợp lệ để rác không đốt quota, và cân nhắc chỉ chặn phần GỬI EMAIL chứ không chặn việc tạo ClientTaskRequest — khách vẫn gửi được yêu cầu, chỉ gộp email lại.

---

### MEDIUM · `d5aaef1` · R7-1 — claim_task là cửa GIAO VIỆC thứ 5 với userId tuỳ ý — vô hiệu hoá toàn bộ chốt thẻ đỏ vừa thêm

- **Loại:** INCOMPLETE_FIX
- **Vị trí:** `mcp-server/src/services/marketplace-service.ts:129`
- **Cáo buộc:** Bản vá bỏ qua claimTask với lý do 'web cũng KHÔNG chặn đường tự-nhận-việc'. Lý do đó SAI VỀ HÌNH DẠNG TOOL: `claim_task` của MCP nhận `userId` làm THAM SỐ do người gọi truyền, tức nó là một cửa GIAO VIỆC cho người khác, không phải tự-nhận. Trên web, `claimTask` lấy userId TỪ PHIÊN nên admin không dùng nó để giao việc cho ai được. Vì vậy `assertNotRedCarded` cắm ở 4 cửa kia bị đi vòng bằng đúng một lời gọi tool anh em, và toàn bộ vẫn nằm trong bề mặt MCP.

**Kịch bản hỏng**

Agent/người điều khiển MCP client gọi `assign_task({ workspaceId, taskId, assigneeId: <editor Rank D> })` → bị từ chối 'Không thể giao Task: ... Phạt thẻ đỏ (Rank D)'. Agent thử tool kế tiếp trong danh sách (hành vi retry BÌNH THƯỜNG, không cần ác ý): nếu chợ đang đóng thì `toggle_marketplace({ workspaceId, enabled: true })`, rồi `claim_task({ workspaceId, taskId, userId: <chính editor Rank D đó> })`. Task đó đang `assigneeId: null` + status 'Đang đợi giao' — đúng tiền đề mà assign_task nhắm tới — nên qua hết 4 chốt ở :154-159, và :162-175 ghi assigneeId = editor Rank D. Kết quả: nhân sự đang bị phạt thẻ đỏ NHẬN ĐƯỢC việc qua MCP, đúng cái P6-SWEEP-1 tuyên bố đã đóng. Kèm theo, nhật ký ghi `action:'task.assigned', actorUserId: userId` (:184-193) nên vết kiểm toán nói chính editor đó tự nhận việc, trong khi thực tế service-account MCP giao — chốt bị đi vòng mà bản ghi lại trông sạch.

**Bằng chứng**

```
mcp-server/src/services/marketplace-service.ts:119-129 —
```
export async function claimTask(
    wsId: string, profileId: string, taskId: string, userId: string,
) {
    await validateWorkspaceAccess(wsId)
    if (!userId) throw new Error('userId is required to claim a task')
    // [AUDIT HT-036 fix] The claiming user must be a member of this workspace.
    await assertWorkspaceMember(wsId, userId)   // ← KHÔNG có assertNotRedCarded
```
mcp-server/src/tools/marketplace.ts:59-63 —
```
            workspaceId: z.string()...,
            taskId: z.string()...,
            userId: z.string().describe('User ID of the person claiming the task'),
```
Đối chiếu web, src/actions/claim-actions.ts:128-143 —
```
export async function claimTask(taskId: string, workspaceId: string) {
    const session = await getSession()
    ...
    const access = await verifyWorkspaceAccess(workspaceId, 'MEMBER')
    userId = access.userId          // ← userId LẤY TỪ PHIÊN, không nhận từ ngoài
```
Ghi thật sự xảy ra ở marketplace-service.ts:162-175: `tx.task.updateMany({ ... data: { assigneeId: userId, status: 'Nhận task', claimSource: 'MARKET', ... } })`.
Bổ sung: `toggle_marketplace` cũng là tool MCP (tools/marketplace.ts:13-32) nên điều kiện tiên quyết duy nhất (marketplaceOpen) cũng do chính người gọi bật được.
```

**Phán quyết của người bác bỏ** (mức gốc HIGH → **MEDIUM**)

KHÔNG bác bỏ được — mọi mắt xích đều đúng như mã thật.

(1) Hình dạng tool: mcp-server/src/tools/marketplace.ts:56-78 đăng ký `claim_task` với schema `{ workspaceId, taskId, userId }`, mô tả nguyên văn 'Claim a marketplace task for a specific user' — `userId` do NGƯỜI GỌI truyền, không lấy từ bất kỳ danh tính nào. Handler :64-72 truyền thẳng `params.userId` xuống service. Đối chiếu web src/actions/claim-actions.ts:139-142 `const access = await verifyWorkspaceAccess(workspaceId, 'MEMBER'); userId = access.userId` — userId LẤY TỪ PHIÊN. Vậy lập luận 'web cũng KHÔNG chặn đường tự-nhận-việc' (guards.ts:37-40 + commit message) đúng về WEB nhưng KHÔNG áp được cho MCP: hai hàm cùng tên nhưng khác bản chất — một cái tự-nhận, một cái giao-cho-người-khác.

(2) Không có gate nào ở tầng trên. Tôi đã map hết call site guard: assign-service.ts:31/33, :191/193, task-service.ts:70/73, :333/336 đều có cặp assertWorkspaceMember + assertNotRedCarded; marketplace-service.ts:129 là chỗ DUY NHẤT còn `assertWorkspaceMember` trần. guards.ts:15-24 chỉ truy WorkspaceMember. `validateWorkspaceAccess` chỉ khoá phạm vi profile/workspace. Tool được đăng ký thật: mcp-server/src/index.ts:33 `registerMarketplaceTools(server)`.

(3) Đường ghi có thật: marketplace-service.ts:162-175 `tx.task.updateMany({ where: { id, version, assigneeId: null }, data: { assigneeId: userId, status: 'Nhận task', claimSource: 'MARKET', ... } })`. Tiền đề chỉ là 4 điều kiện ở :138-159 (chợ mở, task tồn tại, chưa archive, assigneeId null, status 'Đang đợi giao') — đúng lớp task mà assign_task nhắm tới, và `toggle_marketplace` cũng là tool MCP (tools/marketplace.ts:13-32).

(4) Điểm bồi thêm mà người tìm lỗi nói đúng và tôi xác nhận: marketplace-service.ts:181-189 ghi `actorUserId: userId` kèm chú thích 'Đây là thao tác MCP DUY NHẤT có người thật đứng sau: người tự nhận việc' — chú thích này cũng dựa trên cùng tiền đề sai, nên vết kiểm toán ghi editor Rank D 'tự nhận việc' trong khi service-account MCP mới là bên gọi.

HẠ từ HIGH xuống MEDIUM (không phải bác bỏ):
· Sổ cái docs/security-audit/SWEEP_2026-07-30.md:177 xếp chính P6-SWEEP-1 là Medium, và :183 nêu rõ hai lựa chọn (A)/(B) — việc LOẠI claimTask là quyết định có ghi chép, chỉ là quyết định đó được đưa ra trên một mô tả sai hình dạng tool, nên không đủ để bác bỏ.
· Không phải leo thang quyền: người gọi MCP đã là service-account cấp profile, cùng một chủ thể ở cả 4 cửa kia — đây là đi vòng chốt NGHIỆP VỤ, không vượt ranh giới tenant.
· Bề mặt hẹp hơn assign_task: chỉ với task đang `assigneeId: null` + status 'Đang đợi giao' + chợ đang mở, và việc bật chợ nay đã để lại vết (marketplace-service.ts:38-48).
· Luật thẻ đỏ vốn không phải hàng rào kín: tôi tự kiểm và xác nhận src/actions/admin-actions.ts:86-140 (createTask) không có một truy vấn monthlyRank nào, nên cùng hiệu ứng đạt được trên web dễ hơn — giá trị biên của cửa MCP này vì thế thấp hơn mức HIGH.

**Vá đề xuất**

Hoặc (a) cắm `await assertNotRedCarded(wsId, userId)` ngay sau `assertWorkspaceMember` ở marketplace-service.ts:129 — hợp lệ vì MCP claim_task KHÔNG phải đường tự-nhận (userId đến từ ngoài), nên không tạo lệch với web claimTask vốn khoá theo phiên; hoặc (b) nếu muốn giữ nguyên ngữ nghĩa 'tự-nhận', bỏ tham số `userId` khỏi tool và không cho MCP claim thay người khác. Sửa luôn chú thích ở guards.ts:37-40 vì lập luận hiện tại dựa trên tiền đề sai.

---

### LOW · `8dde6eb` · R-2 — Cổng H3 mới dùng vị từ YẾU HƠN bất biến CLIENT-không-bao-giờ-nội-bộ của chính repo

- **Loại:** INCOMPLETE_FIX
- **Vị trí:** `src/actions/workspace-actions.ts:176`
- **Cáo buộc:** Bản vá gác bằng `getProfileRole(...) !== null`. getProfileRole trả về MỌI vai, kể cả CLIENT. Mọi vị từ ProfileAccess khác trong repo đều loại CLIENT tường minh — và một lần đã là bug HIGH (PE-1). Nên mục tiêu 'chặn profileId lạ' đạt được, nhưng bề mặt liệt kê workspace vẫn mở cho tài khoản portal CLIENT của chính tenant đó.

**Kịch bản hỏng**

Một tài khoản portal giữ ProfileAccess(role='CLIENT') trên profile P của agency gửi request Next-Action tới getWorkspacesForProfile(P). getProfileRole trả 'CLIENT' ≠ null ⇒ qua cổng ⇒ nhận id/name/description của TOÀN BỘ workspace ACTIVE của agency. Hàng rào CLIENT ở src/app/[workspaceId]/layout.tsx:128-131 không cứu được vì server action không đi qua render trang. Chính các id đó là tham số đầu vào của mọi action workspace-scoped khác, tức là khôi phục đúng primitive liệt kê mà H3 lập ra để đóng.

**Bằng chứng**

```
workspace-actions.ts:174-181
    const { getProfileRole } = await import('@/lib/profile-permissions')
    const hasAccess =
        (await getProfileRole(session.user.id, profileId)) !== null ||
        (await prisma.user.findUnique({ ... }))?.profileId === profileId
    if (!hasAccess) return []

profile-permissions.ts:24-31 — getProfileRole trả `access?.role ?? null`, KHÔNG loại CLIENT.
security.ts:109-119 — `} else if (profileAccess?.role === 'CLIENT') { ... workspaceRole = null }` kèm chú thích '[AUDIT PE-1 — fix HIGH] CLIENT is a view-only portal grant'.
profile-permissions.ts:128-129 — `if (access?.role === 'CLIENT') return false` trong canAccessWorkspace.
```

**Phán quyết của người bác bỏ** (mức gốc MEDIUM → **LOW**)

Sự kiện kỹ thuật ĐÚNG, nhưng hệ quả bị thổi phồng ⇒ hạ MEDIUM→LOW chứ không bác bỏ. Đúng: workspace-actions.ts:174-181 gác bằng `(await getProfileRole(...)) !== null`, và profile-permissions.ts:24-31 trả `access?.role ?? null` — KHÔNG loại CLIENT, trong khi security.ts:109-119 (fix PE-1) và profile-permissions.ts:128-129 đều loại tường minh. Tôi đã tìm gate trên và không có: `grep -rn getWorkspacesForProfile src/` chỉ ra ĐÚNG MỘT dòng — chính định nghĩa ở workspace-actions.ts:152, KHÔNG file nào gọi ⇒ không có layout/route nào chắn, chỉ còn đường POST Next-Action, đúng như người tố cáo nói. Nhưng phần 'khôi phục đúng primitive mà H3 đóng' là SAI: H3 là liệt kê XUYÊN TENANT (ai đăng nhập cũng truyền profileId lạ), và bản vá đóng đúng cái đó; một CLIENT chỉ đọc được workspace của CHÍNH tenant họ đã có ProfileAccess. Và các id lấy được không mở thêm cửa nào: mọi action workspace-scoped đi qua verifyWorkspaceAccess, nơi nhánh CLIENT ở security.ts:109-119 đặt workspaceRole=null ⇒ ném IDOR Blocked ở dòng 145-148. Người tố cáo cũng không dựng được một action nào bỏ qua cổng đó. Thiệt hại cụ thể còn lại: lộ id/name/description workspace (select ở dòng 190) cho một tài khoản portal legacy — LOW. Lưu ý thêm ủng hộ 'có thật': không còn code nào TẠO ProfileAccess role CLIENT (grep chỉ thấy nơi ĐỌC/loại trừ), nhưng repo vá rất nhiều chỗ cho trường hợp này (member-actions.ts:394-404 nói rõ 'User.role bình thường nhưng PA(role=CLIENT) tồn tại') ⇒ hàng legacy có thật ở prod, tài khoản vẫn đăng nhập được.

**Vá đề xuất**

const role = await getProfileRole(session.user.id, profileId); const hasAccess = (role !== null && role !== 'CLIENT') || legacyUserProfileIdMatch — giữ nguyên nhánh legacy User.profileId như bản vá đã làm.

---

### LOW · `8dde6eb` · R-3 — Trong chính file được vá, getTrashedClients còn một quan hệ lồng chưa scope (_count)

- **Loại:** INCOMPLETE_FIX
- **Vị trí:** `src/actions/crm-actions.ts:462`
- **Cáo buộc:** Commit khẳng định `projects` là quan hệ lồng duy nhất bị bỏ sót — đúng trong phạm vi getClientDetail. Nhưng getTrashedClients trong cùng file vẫn có một include lồng KHÔNG lọc workspaceId, đúng lớp lỗi mà extension không tự chèn (prisma-workspace.ts chỉ chèn vào args.where ở tầng ngoài, không đi vào include).

**Kịch bản hỏng**

Một profile ADMIN được cấp quyền SAU khi các workspace cũ đã tồn tại (security.ts:106 hạ họ xuống MEMBER ở những workspace đó, tức họ không mở được các workspace ấy) vào /{ws}/admin/client-trash. Mỗi thẻ khách trong Thùng rác hiển thị số task/hoá đơn cộng gộp trên MỌI workspace của profile, gồm cả workspace họ không truy cập được — vừa lộ khối lượng công việc/hoá đơn của tháng-team khác, vừa làm con số ở Thùng rác mâu thuẫn với danh sách CRM (getClients) vốn đã scope theo workspace.

**Bằng chứng**

```
crm-actions.ts:453-465
        const clients = await wp.client.findMany({
            where: { status: 'SOFT_DELETED', OR: [...] },
            include: {
                _count: { select: { tasks: true, subsidiaries: true, invoices: true } },
            },
            orderBy: { deletedAt: 'desc' },
        })

Đối chiếu trong CÙNG file, hai hàm kia đều lọc tường minh:
crm-actions.ts:67-72  projects: { where: { workspaceId } }, tasks: { where: { workspaceId } }
crm-actions.ts:698-710 tasks/invoices/projects đều { where: { workspaceId } } kèm chú thích 'The middleware does NOT inject workspaceId into nested relation includes'.
```

**Phán quyết của người bác bỏ** (mức gốc LOW → **LOW**)

Xác nhận bằng mã, không bác bỏ được, giữ LOW (đúng mức người tố cáo tự chấm). crm-actions.ts:459-462 `include: { _count: { select: { tasks: true, subsidiaries: true, invoices: true } } }` — không có where. prisma-workspace.ts:137-167 chỉ ghi vào `args.where` ở TẦNG NGOÀI (`baseWhere`), không hề đụng tới `include`/`select`, và 'Client' nằm trong bypassModels (dòng 14-23) nên ngay cả workspaceId cũng không được chèn ⇒ `_count` đếm toàn profile. Đối chứng trong CÙNG file đúng như trích dẫn: getClients ở dòng 64-72 lọc tường minh `projects: { where: { workspaceId } }, tasks: { where: { workspaceId } }` kèm chú thích 'the task/project counts shown on each card stay scoped to THIS workspace'. Và con số ĐƯỢC HIỂN THỊ thật: src/app/[workspaceId]/admin/client-trash/page.tsx:20-22 đọc `c._count?.tasks ?? 0`, `_count?.invoices ?? 0` ⇒ thẻ Thùng rác mâu thuẫn với thẻ CRM cho cùng một khách. Không nâng mức: dữ liệu chỉ là CON SỐ tổng hợp và không bao giờ vượt ranh giới profile (Client thuộc đúng một profile), người xem đã phải qua verifyWorkspaceAccess(...,'ADMIN'); thêm nữa migration gộp Client chưa chạy trên prod nên hiện tại hầu hết hàng vẫn là bản sao theo từng workspace, biên độ sai lệch nhỏ. Ghi chú: đây là mục BỎ SÓT (tồn tại từ trước), không phải do bản vá gây ra — và chú thích của commit tự giới hạn phạm vi 'ở đó' = getClientDetail nên không phải mô tả sai.

**Vá đề xuất**

_count: { select: { tasks: { where: { workspaceId } }, subsidiaries: true, invoices: { where: { workspaceId } } } } — hoặc ghi rõ trong chú thích rằng con số này CỐ Ý là toàn-profile, để lần sau không ai đọc nhầm.

---

### LOW · `95be7eb` · R3-5 — Task bị chốt lương mất TOÀN BỘ các field khác trong cùng lô, nhưng toast chỉ nói "không đổi được SỐ TIỀN"

- **Loại:** NEW_BUG
- **Vị trí:** `src/actions/bulk-task-actions.ts:334`
- **Cáo buộc:** Khi `blocked`, vòng lặp `continue` TRƯỚC `tx.task.update` — nghĩa là deadline, notes, notes_en, resources, references, productLink, collectFilesLink, type, assigneeId trong cùng lần sửa lô cũng không được ghi. Nhưng thông điệp trả về và toast phía client chỉ nói về tiền, nên người dùng tin rằng phần phi-tiền đã áp dụng.

**Kịch bản hỏng**

ADMIN chọn 20 task, mở Sửa hàng loạt, đặt `deadline = 05/08/2026` VÀ `value = 1.200.000`. 3 task thuộc kỳ đã trả lương → bị `continue` → deadline của 3 task đó GIỮ NGUYÊN hạn cũ đã qua. Toast vàng chỉ nói "3 task KHÔNG đổi được số tiền vì kỳ lương đã đóng". Admin kết luận deadline đã dời cho cả 20. Cron `check-deadline` tiếp tục đánh 3 task đó là quá hạn và bật `isPenalized` cho editor — phạt oan trên một thay đổi admin tưởng đã làm.

**Bằng chứng**

```
bulk-task-actions.ts:328-346
                if (touchesMoney && cycle) {
                    const money = moneyById.get(id)
                    if (!money) continue
                    const blocked = cycle.isLocked || (money.assigneeId ? paidAssigneeIds.has(money.assigneeId) : false)
                    if (blocked) { skippedTitles.push(money.title); continue }   // ← bỏ qua CẢ tx.task.update ở dòng 369

BulkEditTaskModal.tsx:128-135
            if (skipped.length > 0) {
                toast.warning(`${skipped.length} task KHÔNG đổi được số tiền vì kỳ lương đã đóng: ` + ...)

(và dòng 117: `Đã cập nhật ${dirtyCount} field × ${appliedCount} task` — dirtyCount vẫn đếm cả field phi-tiền)
```

**Phán quyết của người bác bỏ** (mức gốc MEDIUM → **LOW**)

Mechanism CONFIRMED, harm narrative PARTLY WRONG. bulk-task-actions.ts:334-337 does `skippedTitles.push(money.title); continue` inside the per-id loop, before the single `tx.task.update` at line 369 — so a blocked task loses deadline/notes/notes_en/resources/references/productLink/type/assigneeId from the same submit, and BulkEditTaskModal.tsx:89-92 does send them all in one `bulkUpdateTaskDetails(selectedTaskIds, nonStatusPatch, ...)` call. Two corrections that cut the severity: (1) the finder's downstream claim is false — I read src/app/api/cron/check-deadline/route.ts:142-195 and the overdue branch sets `data: { status: 'Quá hạn' }` and sends a TASK_OVERDUE notification; it never touches `isPenalized`, so there is no 'phạt oan' and no bonus impact. (2) The UI is less misleading than claimed: BulkEditTaskModal.tsx:116-117 computes `appliedCount = selectedTaskIds.length - skipped.length` and the main toast already reports the reduced count ('Đã cập nhật 2 field × 17 task'), so only the warning wording at lines 129-133 ('KHÔNG đổi được số tiền') is imprecise. A concrete wrong outcome does survive — the 3 skipped tasks keep their old past-due deadline, the cron flips them to 'Quá hạn' and pings the editor for a deadline the admin believes was moved — so this is a downgrade, not a refutation. LOW.

**Vá đề xuất**

Tách hai việc: với task bị chặn, vẫn ghi phần phi-tiền (loại `jobPriceUSD`/`value`/`wageVND`/`profitVND` khỏi `taskUpdateData` rồi update), và sửa câu toast thành "…bị bỏ qua HOÀN TOÀN (kể cả deadline/ghi chú)" nếu chọn giữ hành vi hiện tại.

---

### LOW · `95be7eb` · R3-6 — bulkUpdateTaskStatus: nhận diện "đã ghi được" bằng cách đọc lại `status = newStatus` → vẫn gửi email + ghi nhật ký cho thay đổi do NGƯỜI KHÁC làm

- **Loại:** INCOMPLETE_FIX
- **Vị trí:** `src/actions/bulk-task-actions.ts:647`
- **Cáo buộc:** Bản vá tuyên bố "Chỉ những task ĐÃ ghi được mới đi vào nhật ký + email", nhưng cách nhận diện là một SELECT `status = newStatus` chứ không phải tổng `count` mà các `updateMany` trả về. Task mà người khác vừa đặt sang ĐÚNG `newStatus` sẽ không khớp `status: fromStatus` (ta không ghi) nhưng LẠI khớp `status: newStatus` (ta đếm là đã ghi). Đây chính là kịch bản tranh chấp phổ biến nhất — hai admin cùng bấm một nút trên cùng một lô.

**Kịch bản hỏng**

Admin A và admin B cùng tick 30 task đang 'Đang thực hiện' và cùng bấm "Hoàn tất". A chạy trước: 30 dòng được ghi, 30 email digest gửi đi. B chạy sau: `updateMany where status:'Đang thực hiện'` khớp 0 dòng (đã là 'Hoàn tất'), nhưng `appliedRows` where `status:'Hoàn tất'` trả đủ 30 → `staleCount = 0`, `validTasks` giữ nguyên 30 → B ghi thêm một dòng audit `task.bulk_status_updated count:30` và GỬI LẠI 30 email "đã cập nhật status" cho từng editor, đồng thời trả về `count: 30` cho giao diện của B. Đúng cái mà commit message nói đã chặn ("trước đây sẽ gửi email cho một thay đổi không xảy ra") vẫn xảy ra.

**Bằng chứng**

```
bulk-task-actions.ts:638-657
        for (const [fromStatus, ids] of idsByReadStatus) {
            await prisma.task.updateMany({ where: { id: { in: ids }, workspaceId, status: fromStatus }, data: updateData })
        }   // ← giá trị .count bị VỨT BỎ
        const appliedRows = await prisma.task.findMany({
            where: { id: { in: validTasks.map((t) => t.id) }, workspaceId, status: newStatus },
            select: { id: true },
        })
        const appliedIds = new Set(appliedRows.map((r) => r.id))
        const staleCount = validTasks.length - appliedIds.size
```

**Phán quyết của người bác bỏ** (mức gốc MEDIUM → **LOW**)

Technical criticism CORRECT, timing narrative SLOPPY. bulk-task-actions.ts:638-643 discards every `updateMany` return value, and lines 647-652 decide 'we wrote it' by re-reading `where: { ..., status: newStatus }` — absolute state, not authorship — so any row another writer already moved to newStatus is counted as ours. That false positive is real in the interleaved window (B reads at line 578 → A commits → B's compare-and-set at 640 matches 0 → B's verify at 647 sees newStatus → staleCount 0, audit + 30 digest emails at 668-749). The finder's own 'A fully before B' story does NOT work through the path they describe: B re-reads at line 578 and would group under `fromStatus = 'Hoàn tất'`, so `updateMany where status:'Hoàn tất'` matches all 30 and genuinely writes (version+1) — the duplicate emails happen there for a different reason, not via the detection flaw. I also confirmed FSM cannot save it: fsm-config.ts validateTransition is stubbed to `return { isValid: true }` unconditionally, so nothing filters an already-applied status. LOWERED to LOW: the blast radius is duplicate digest emails and one inflated audit count/`count` return — no money, access, or data-integrity consequence.

**Vá đề xuất**

Cộng dồn `count` do mỗi `updateMany` trả về theo từng nhóm `fromStatus`; nếu cần danh sách id, dùng `updateManyAndReturn` (Prisma 5.14+) hoặc đọc lại kèm `updatedAt >= tStart`/`version` để phân biệt "ta ghi" với "đã trùng sẵn".

---

### LOW · `95be7eb` · R3-7 — recordPayment: cửa sổ chống trùng 60 giây bỏ qua `paidAt` → từ chối khoản thu THẬT khi nhập bù nhiều kỳ cùng số tiền

- **Loại:** WORSE_THAN_BUG
- **Vị trí:** `src/actions/payment-actions.ts:82`
- **Cáo buộc:** Khoá chống trùng gồm (workspaceId, clientId, amount, invoiceId, createdAt trong 60s) — thiếu `paidAt`, tức là thiếu đúng trường phân biệt hai khoản thu khác kỳ. Với khách trả phí duy trì cố định hằng tháng (số tiền giống hệt nhau), thao tác nhập bù bình thường bị chặn, và câu báo lỗi khẳng định khoản đó "vừa được ghi" — dẫn người nhập tới kết luận sai là đã có rồi.

**Kịch bản hỏng**

Kế toán nhập bù sổ thu cho khách X: phí duy trì 20.000.000đ ngày 31/01 → lưu OK; đổi ô ngày sang 28/02, giữ nguyên 20.000.000đ, bấm lưu (khoảng 15 giây sau) → bị từ chối với câu "Khoản thu giống hệt vừa được ghi cách đây dưới một phút". Kế toán đọc câu đó, tin là hệ thống đã có, đóng modal. Sổ thu thiếu 20.000.000đ ⇒ công nợ khách X bị báo dư 20 triệu ⇒ đi đòi nhầm một khoản đã thu.

**Bằng chứng**

```
payment-actions.ts:81-97
        const DEDUP_WINDOW_MS = 60_000
        const duplicate = await prisma.payment.findFirst({
            where: { workspaceId, clientId, amount, invoiceId: linkedInvoiceId,
                     createdAt: { gte: new Date(Date.now() - DEDUP_WINDOW_MS) } },
            select: { id: true },
        })
        if (duplicate) return { success:false, error: 'Khoản thu giống hệt vừa được ghi cách đây dưới một phút...' }

schema.prisma:811-812   amount Decimal @default(0)   /   paidAt DateTime @default(now())   ← paidAt do người dùng nhập, KHÔNG có trong khoá
RecordPaymentModal.tsx:53-56 — modal GIỮ NGUYÊN amount sau khi lưu, người dùng chỉ đổi ô ngày rồi bấm lại → hai lần bấm cách nhau vài giây.
```

**Phán quyết của người bác bỏ** (mức gốc MEDIUM → **LOW**)

CANNOT REFUTE the mechanism. payment-actions.ts:81-97 keys the 60s window on `{ workspaceId, clientId, amount, invoiceId: linkedInvoiceId, createdAt: { gte: ... } }` — `paidAt` (payment-actions.ts:61-62, the only field that distinguishes two genuine back-dated receipts) is absent, and the rejection message asserts the payment 'vừa được ghi'. The client conditions hold too: RecordPaymentModal.tsx:58-62 clears only `note` and `method` on success, leaves `amount` and `paidAt` populated and the modal open, so changing just the date and re-submitting lands inside the window. schema.prisma confirms Payment.amount is a plain Decimal with no unique constraint, so nothing else dedupes. LOWERED to LOW for two reasons the finder omitted: the commit explicitly documents the trade-off as an owner decision ('60 giây đủ chặn double-click… mà vẫn cho ghi hai khoản thu thật trùng số nếu cách nhau hơn một phút'), and the failure is loud and fully recoverable — the operator sees an explicit red toast (RecordPaymentModal.tsx:64) and the still-visible 'Lịch sử thu' list (lines 140-168) shows the second entry is missing, so the 'sổ thu thiếu 20 triệu' outcome needs the operator to ignore both signals.

**Vá đề xuất**

Đưa `paidAt` vào khoá chống trùng (`paidAt: paidAt`), hoặc chỉ áp cửa sổ khi `input.paidAt` vắng mặt/bằng hôm nay. Và sửa câu lỗi thành dạng hỏi lại ("đã có khoản thu giống hệt ngày dd/mm — vẫn ghi thêm?") thay vì khẳng định.

---

### LOW · `95be7eb` · R3-8 — finance-helpers thêm `isArchived:false` cho tập "thực tế" nhưng bảng lương/bonus vẫn KHÔNG lọc → chi phí trên dashboard thấp hơn tiền thực trả

- **Loại:** REGRESSION
- **Vị trí:** `src/lib/finance-helpers.ts:75`
- **Cáo buộc:** Bản vá đồng bộ tập "thực tế" với tập "dự kiến" (cùng loại task lưu trữ), nhưng nguồn tính LƯƠNG lại không đổi: `calculateMonthlyBonus` và trang /admin/payroll gom task theo `status = 'Hoàn tất'` KHÔNG kèm `isArchived`. Trước bản vá hai bên khớp nhau; sau bản vá `totalWageVND` (chi phí) hụt đúng phần task lưu-trữ-và-hoàn-tất, trong khi editor VẪN được trả tiền cho chúng.

**Kịch bản hỏng**

Một task 'Hoàn tất' của editor X, wage 3.000.000đ, sau đó bị chuyển 'Đã hủy' (đặt isArchived=true) rồi được kéo/đổi status về 'Hoàn tất' (đường `bulkUpdateStatus` drag-drop, bulk-task-actions.ts:899-944, không hề xoá cờ isArchived — chính chú thích ở share-portal-actions.ts:497-502 mô tả đúng trạng thái desync này). Bảng lương và `calculateMonthlyBonus` vẫn cộng 3.000.000đ cho X và trả tiền. Dashboard Tài chính (5 trang dùng chung helper) sau bản vá KHÔNG còn cộng 3.000.000đ vào `totalWageVND` ⇒ `netProfit` báo cao hơn thực tế đúng 3.000.000đ mỗi task loại này, và không có chỗ nào đối soát ra chênh lệch.

**Bằng chứng**

```
finance-helpers.ts:75   where: { status: 'Hoàn tất', isArchived: false }          // ← MỚI
finance-helpers.ts:91-97 totalWageVND = Σ (wageVND ?? value) trên completedTasks
finance-helpers.ts:114   netProfit: totalRevenueVND - totalWageVND

bonus-actions.ts:213-222 (calculateMonthlyBonus — KHÔNG đổi)
        const completedTaskAggregates = await workspacePrisma.task.groupBy({
            by: ['assigneeId'],
            where: { workspaceId, assigneeId: { not: null }, status: SALARY_COMPLETED_STATUS },
            _sum: { value: true }, _count: { _all: true }
        })

app/[workspaceId]/admin/payroll/page.tsx:51-56 — tasks: { where: { workspaceId, status: { in: [SALARY_COMPLETED_STATUS, ...] } } }  // cũng không lọc isArchived
```

**Phán quyết của người bác bỏ** (mức gốc MEDIUM → **LOW**)

CANNOT REFUTE the divergence. finance-helpers.ts:75 is now `where: { status: 'Hoàn tất', isArchived: false }` and totalWageVND/netProfit are derived from that set (lines 91-97, 114). The salary side was not touched: bonus-actions.ts:213-222 groups by assigneeId on `{ workspaceId, assigneeId: { not: null }, status: SALARY_COMPLETED_STATUS }` with no isArchived predicate, and src/app/[workspaceId]/admin/payroll/page.tsx includes `tasks: { where: { workspaceId, status: { in: [SALARY_COMPLETED_STATUS, ...SALARY_PENDING_STATUSES] } } }`, also unfiltered. Reachability of an archived+'Hoàn tất' row checks out: task-actions.ts:143 `const archiveUpdate = newStatus === 'Đã hủy' ? { isArchived: true } : {}` and bulk-task-actions.ts:619-621 set the flag, while the drag-drop path bulk-task-actions.ts:916-943 changes status back without ever clearing `isArchived`. schema.prisma:363 confirms `isArchived Boolean @default(false)` non-null, so there is no NULL-exclusion surprise — the gap is exactly the archived-and-completed rows. LOWERED to MEDIUM→LOW: this is a dashboard-reporting inconsistency (netProfit overstated by the wage of such rows) with no security or stored-data impact, the change itself is an explicit owner decision with a release-impact warning in the code comment (finance-helpers.ts:65-74), and it only bites workspaces that actually have archived+completed tasks.

**Vá đề xuất**

Chọn MỘT định nghĩa "task tính tiền" và áp cho cả hai phía: hoặc thêm `isArchived: false` vào `calculateMonthlyBonus` + trang payroll, hoặc bỏ khỏi finance-helpers. Nếu giữ nguyên chênh lệch có chủ đích thì phải hiện một dòng đối soát trên trang Tài chính.

---

### LOW · `38550a8` · R-38550a8-1 — Chú thích "đã sửa" trong sanitize.ts trỏ tới hàm KHÔNG TỒN TẠI (`sanitizePortalLink`) — nơi chốt thật là `cleanLink`

- **Loại:** WRONG_ASSUMPTION
- **Vị trí:** `src/lib/sanitize.ts:32`
- **Cáo buộc:** Một trong hai mục đích tự tuyên bố của commit là ĐÍNH CHÍNH chú thích bảo mật sai ("chú thích sai về bảo mật là cách người sau lập luận sai"). Nhưng bản đính chính cho `LINK_MAX_LEN` lại ghi tên một hàm không hề tồn tại trong repo. Tên đúng là `cleanLink`.

**Kịch bản hỏng**

Người kiểm toán/lập trình viên sau này muốn xác minh trần độ dài cho link khách gửi qua cổng chia sẻ (chống DoS/phình DB — đúng lý do `sanitize.ts:16-17` nêu). Họ grep `sanitizePortalLink` theo đúng chỉ dẫn của chú thích → 0 kết quả. Hai kết cục đều xấu: (a) kết luận `LINK_MAX_LEN` là hằng mồ côi và gỡ/nới nó, làm mất trần 2000 ký tự trên ba ô link khách chưa-auth tự điền ở `submitClientRequestViaToken`; hoặc (b) bỏ qua không kiểm `cleanLink`, tức bỏ sót đúng điểm nghẽn duy nhất đang chốt. Đây là lặp lại nguyên xi kiểu lỗi #1 của chiến dịch (tin chú thích thay vì truy cơ chế) — lần này do chính hunk sửa-chú-thích tạo ra.

**Bằng chứng**

```
src/lib/sanitize.ts:31-35 (sau bản vá):
```
/**
 * Client-submitted resource link cap. Nơi dùng thật: `sanitizePortalLink` trong
 * share-portal-actions.ts (đường link khách tự điền ở wizard v2).
 */
export const LINK_MAX_LEN = 2000
```
`git grep -rn "sanitizePortalLink" -- .` → CHỈ 1 hit, chính là dòng chú thích trên. Không có định nghĩa nào.
Nơi dùng THẬT, src/actions/share-portal-actions.ts:1206-1212:
```
/** URL sanity: trimmed http(s) link, control/tag stripped, length-capped. */
function cleanLink(raw: string | undefined): string {
    return sanitizeClientText(raw || '', LINK_MAX_LEN)
}
```
`cleanLink` là nơi duy nhất tiêu thụ `LINK_MAX_LEN`, và nó chốt các ô link khách tự điền của wizard v2: :1387 `rawFootage`, :1395 vòng lặp cho collectFile/bRoll (`const c = cleanLink(v)`).
Đối chiếu: chú thích cho `TITLE_MAX_LEN` (:24-30) thì ĐÚNG — `submitClientRequestViaToken` dùng ở :1384, `createSubClientViaToken` (định nghĩa :1473) dùng ở :1494. Chỉ mục LINK_MAX_LEN sai.
```

**Phán quyết của người bác bỏ** (mức gốc LOW → **LOW**)

KHÔNG BÁC BỎ ĐƯỢC — sự kiện đúng nguyên văn.

(1) Chú thích sau bản vá, src/lib/sanitize.ts:31-35 (đã đọc trực tiếp):
```
/**
 * Client-submitted resource link cap. Nơi dùng thật: `sanitizePortalLink` trong
 * share-portal-actions.ts (đường link khách tự điền ở wizard v2).
 */
export const LINK_MAX_LEN = 2000
```
(2) `git grep -n "sanitizePortalLink" -- .` trên cây HEAD trả ĐÚNG 1 hit: chính dòng sanitize.ts:32. Không có định nghĩa, không có import, không nằm ở mission-control/** (đã loại trừ). Không phải mã ở nhánh khác — tôi grep ngay trên worktree claude/security-remediation-2026-07.
(3) Nơi tiêu thụ THẬT duy nhất, share-portal-actions.ts:1207-1208:
```
function cleanLink(raw: string | undefined): string {
    return sanitizeClientText(raw || '', LINK_MAX_LEN)
}
```
cùng hai nơi gọi :1388 `looksLikeUrl(rawFootage)` (sau `cleanLink(input.rawFootage)` ở :1387) và :1396 trong vòng lặp collectFile/bRoll. Ngoài `cleanLink`, `LINK_MAX_LEN` chỉ xuất hiện ở dòng import :34 và dòng khai báo sanitize.ts:35 — không consumer nào khác.
(4) Không viện được lý do (c) "chủ ý và có tài liệu": chính thông điệp commit 38550a8 liệt kê `sanitizePortalLink` là một trong ba tên "ghi đúng", tức tác giả tin hàm đó tồn tại — đây là nhầm lẫn, không phải quy ước. Tôi cũng grep toàn bộ docs/security-audit/ cho `sanitizePortalLink` → 0 hit, nên không có tài liệu nào hợp thức hoá tên này.
(5) Đối chứng cho thấy chỉ mục LINK_MAX_LEN sai, còn mục TITLE_MAX_LEN (sanitize.ts:24-30) thì ĐÚNG: `TITLE_MAX_LEN` được dùng ở share-portal-actions.ts:1384 (trong `submitClientRequestViaToken`) và :1494 (trong `createSubClientViaToken`) — khớp y hệt chú thích. Vậy người tìm lỗi khoanh vùng chính xác.

ĐIỀU CHỈNH — có mộtGATE người tìm lỗi bỏ qua, nhưng nó chỉ làm YẾU kịch bản chứ không xoá được khiếm khuyết: nhánh (a) trong failureScenario ("kết luận hằng mồ côi → gỡ nó → mất trần 2000 ký tự") KHÔNG thể xảy ra âm thầm, vì `LINK_MAX_LEN` được import tường minh ở share-portal-actions.ts:34 (`import { sanitizeClientText, FEEDBACK_MAX_LEN, RATING_FEEDBACK_MAX_LEN, TITLE_MAX_LEN, LINK_MAX_LEN } from '@/lib/sanitize'`); xoá export là `tsc --noEmit` gãy ngay, trần không thể biến mất không ai hay. Chỉ còn nhánh (b) — grep hụt rồi bỏ sót đúng điểm nghẽn `cleanLink` khi kiểm toán — là thật, và đó thuần tuý là chi phí định hướng, 0 tác động runtime.

Giữ nguyên LOW: đây là khiếm khuyết tài liệu DO CHÍNH HUNK sửa-chú-thích của commit này tạo ra, trong một commit tự tuyên bố mục tiêu là dẹp chú thích bảo mật sai. Đúng loại, đúng mức.

**Vá đề xuất**

Sửa chú thích thành: "Nơi dùng thật: `cleanLink` (share-portal-actions.ts:1207) — bọc `sanitizeClientText` cho rawFootage/collectFile/bRoll ở wizard v2."

---

### LOW · `38550a8` · R-38550a8-2 — Xoá `createTaskViaToken` nhưng bỏ lại hàm phụ trợ duy-nhất-phục-vụ-nó `notifyProfileAdmins` — nay là mã chết mang chú thích mô tả luồng đã bị gỡ

- **Loại:** INCOMPLETE_FIX
- **Vị trí:** `src/actions/share-portal-actions.ts:790`
- **Cáo buộc:** Commit tuyên bố gỡ trọn đường v1 và luận điểm của nó là "đường ghi mồ côi = bẫy chờ". Nhưng `notifyProfileAdmins` — hàm fan-out thông báo chỉ tồn tại để phục vụ `createTaskViaToken` — vẫn nằm lại và nay KHÔNG có nơi gọi nào, kèm doc-comment mô tả một luồng không còn tồn tại.

**Kịch bản hỏng**

Người sau cần cắm lại một đường "khách gửi việc" (hoặc mở rộng hộp thư yêu cầu) mở file, thấy hai hàm tên gần giống nhau, và doc-comment của `notifyProfileAdmins` nói đúng thứ họ cần ("client submitted a brand-new task"). Họ gọi nhầm hàm cũ → thông báo phát ra với `type: 'TASK_STATUS_CHANGED'` và một `taskId` bắt buộc, tức pipeline email chọn nhầm template (không phải `taskClientSubmitted`) và admin nhận thư báo "trạng thái task đổi" cho một yêu cầu chưa có Task. Chính là loại "bề mặt mồ côi kéo người sau đi sai" mà commit này viện dẫn để xoá 4 vùng kia.

**Bằng chứng**

```
src/actions/share-portal-actions.ts:784-812 (còn nguyên sau bản vá):
```
/**
 * Notify the profile's OWNER/ADMIN staff that a client submitted a brand-new task.
 * A fresh client-submitted task has no assignee/assigner yet, so `notifyStaff`
 * ... route to the profile admins instead.
 */
async function notifyProfileAdmins(profileId: string, title: string, body: string, taskId: string) {
    ...
        const notif = await createNotificationInternal({
            userId, type: 'TASK_STATUS_CHANGED', title, body, taskId, actorId: undefined,
        })
```
`git grep -n "notifyProfileAdmins(" -- src` → CHỈ dòng 790 (định nghĩa). Nơi gọi duy nhất trước đây nằm trong thân `createTaskViaToken` vừa bị xoá (xem diff: `await notifyProfileAdmins(scope.profileId, 'Khách gửi yêu cầu mới', ...)`).
Hàm thay thế của v2 là một hàm KHÁC, :1283 `notifyProfileAdminsOfRequest`, và nó dùng `type: 'TASK_CLIENT_SUBMITTED'` (:1298) chứ không phải `TASK_STATUS_CHANGED`.
(Không gây lỗi biên dịch vì tsconfig.json không bật `noUnusedLocals` — nên tsc/build xanh đúng như commit ghi.)
```

**Phán quyết của người bác bỏ** (mức gốc LOW → **LOW**)

KHÔNG BÁC BỎ ĐƯỢC — sự kiện đúng, nhưng tôi bổ sung một cơ chế người tìm lỗi không nêu, và nó CHỐT mức LOW chứ không nâng.

(1) Hàm còn nguyên sau bản vá, src/actions/share-portal-actions.ts:784-812 (đã đọc):
```
/**
 * Notify the profile's OWNER/ADMIN staff that a client submitted a brand-new task.
 * ... route to the profile admins instead.
 */
async function notifyProfileAdmins(profileId: string, title: string, body: string, taskId: string) {
```
(2) Đã chết thật: `git grep -n "notifyProfileAdmins" -- src` chỉ ra :790 (định nghĩa), :806 và :810 (hai chuỗi console.error của chính nó) — không có nơi gọi nào. Ba hit còn lại là hàm KHÁC (`notifyProfileAdminsOfRequest` :1283/:1316/:1320/:1448) và hai chú thích ở src/lib/notification-email.ts:258, src/lib/review/notify.ts:9.
(3) Xác nhận nguyên nhân là chính commit này: `git grep -n "notifyProfileAdmins" 38550a8^ -- src/actions/share-portal-actions.ts` cho thấy TRƯỚC bản vá có đúng một nơi gọi ở dòng 1311, và diff của 38550a8 xoá chính khối đó (`- await notifyProfileAdmins(\n- scope.profileId,\n- 'Khách gửi yêu cầu mới', ...`) cùng thân `createTaskViaToken`. Vậy khẳng định "phụ trợ duy-nhất-phục-vụ-nó" là chính xác.
(4) Khác biệt hai hàm cũng đúng như tố cáo: hàm chết dùng `type: 'TASK_STATUS_CHANGED'` (:799) + `taskId` bắt buộc; hàm v2 sống dùng `type: 'TASK_CLIENT_SUBMITTED'` (:1298) + `metadata` và `taskId: null` (:1313), với docblock :1277-1282 nói rõ "no Task exists yet".
(5) Không có tài liệu nào hợp thức hoá việc giữ lại: commit ghi tường minh HAI ngoại lệ được cố ý giữ (`getSubmitOptionsViaToken`, `forceFlush`/`eventBuffer`) nhưng im lặng về `notifyProfileAdmins`; docs/security-audit/* grep `notifyProfileAdmins` → 0 hit. Nên loại trừ lý do bác bỏ (c) "chủ ý và có tài liệu".

CƠ CHẾ NGƯỜI TÌM LỖI BỎ QUA (làm hẹp phạm vi, KHÔNG bác bỏ): file mở đầu bằng `'use server'` (share-portal-actions.ts:1), nhưng `notifyProfileAdmins` khai báo `async function` KHÔNG có `export`. Trong Next.js chỉ export mới thành endpoint gọi được qua header Next-Action, nên đây KHÔNG phải bề mặt ghi truy cập được từ ngoài — khác hẳn `createTaskViaToken` (vốn `export async function`, đúng là bẫy chờ có thật). Tức đây thuần tuý là vệ sinh mã + chú thích lạc hướng, không phải lỗ hổng chờ.

Giữ LOW: kịch bản hỏng đòi người sau phải VIẾT MÃ MỚI gọi nhầm hàm, không phải lỗi kích hoạt được hôm nay. Nhưng cáo buộc đứng vững — commit lấy chính lý lẽ "bề mặt mồ côi kéo người sau đi sai" để xoá 4 vùng, rồi bỏ lại một hàm mồ côi mang docblock mô tả đúng luồng vừa bị gỡ ('client submitted a brand-new task'), nằm cách hàm thay thế 470 dòng và tên chỉ khác hậu tố.

**Vá đề xuất**

Xoá `notifyProfileAdmins` (:784-812) cùng lượt với `createTaskViaToken`, hoặc nếu muốn giữ thì thêm một dòng chú thích chỉ thẳng sang `notifyProfileAdminsOfRequest` là đường v2 duy nhất còn đúng.

---

### LOW · `b62ed3d` · R4-2 — Trần tuyệt đối thật sự là 120 ngày, không phải 90 — bản vá chỉ chặn gia hạn chứ không kẹp hạn của token cuối cùng

- **Loại:** WRONG_ASSUMPTION
- **Vị trí:** `src/middleware.ts:183`
- **Cáo buộc:** jwt.ts:11 mô tả hằng số là 'HẠN TUYỆT ĐỐI của một phiên, tính từ lần ĐĂNG NHẬP THẬT' và commit ghi 'middleware từ chối gia hạn khi phiên đã quá SESSION_ABSOLUTE_MAX_AGE = 90 ngày'. Nhưng mã chỉ dùng cửa sổ 90 ngày làm điều kiện CÓ ĐƯỢC GIA HẠN HAY KHÔNG; khi được gia hạn nó luôn cấp trọn SESSION_MAX_AGE = 30 ngày mà không kẹp theo ngân sách tuyệt đối còn lại. Nên phiên sống được tối đa 90 + 30 = 120 ngày, vượt 30 ngày so với con số chủ dự án duyệt.

**Kịch bản hỏng**

Token bị đánh cắp ở ngày thứ 88 kể từ lần đăng nhập thật. Kẻ giữ token mở MỘT trang không-/api bất kỳ (ví dụ GET /<ws>/dashboard). sessionAge = 88 ngày < 90 ⇒ withinAbsoluteWindow = true ⇒ middleware cấp cookie mới hạn TRỌN 30 ngày. Token đó dùng được tới ngày 118-119 — tức 29 ngày sau cái mốc 'tuyệt đối' mà chủ dự án đã duyệt, và trong suốt quãng đó không còn chốt thời gian nào nữa. Người vận hành đọc hằng số/commit sẽ tin phiên chết ở ngày 90 và lập kế hoạch ứng cứu theo con số sai.

**Bằng chứng**

```
src/lib/jwt.ts:11 và :22 —
 * [AUDIT SWEEP-2026-07-30 · N8] HẠN TUYỆT ĐỐI của một phiên, tính từ lần ĐĂNG NHẬP THẬT.
export const SESSION_ABSOLUTE_MAX_AGE = 60 * 60 * 24 * 90 // 7_776_000s

src/middleware.ts:179-187 — không có phép kẹp nào theo authAt khi tính hạn mới:
        if (msLeft > 0 && msLeft < (SESSION_MAX_AGE * 1000) / 2 && withinAbsoluteWindow) {
            const fresh = await encrypt(
                { user: sessionPayload.user, expires: new Date(Date.now() + SESSION_MAX_AGE * 1000) },
                `${SESSION_MAX_AGE}s`,
            )
            finalResponse.cookies.set('session', fresh, {
                maxAge: SESSION_MAX_AGE,
```

**Phán quyết của người bác bỏ** (mức gốc LOW → **LOW**)

XÁC NHẬN — không có phép kẹp nào. Đọc nguyên khối src/middleware.ts:179-193: `if (msLeft > 0 && msLeft < (SESSION_MAX_AGE * 1000) / 2 && withinAbsoluteWindow) { const fresh = await encrypt({ user: sessionPayload.user, expires: new Date(Date.now() + SESSION_MAX_AGE * 1000) }, `${SESSION_MAX_AGE}s`); finalResponse.cookies.set('session', fresh, { maxAge: SESSION_MAX_AGE, … }) }` — `withinAbsoluteWindow` (src/middleware.ts:178) chỉ là ĐIỀU KIỆN VÀO, còn hạn cấp ra luôn là hằng SESSION_MAX_AGE = 30 ngày (src/lib/jwt.ts:8), không trừ đi ngân sách còn lại theo authAt. Nên phiên sống được tới ~90+30 ngày, trong khi src/lib/jwt.ts:11 mô tả hằng số là 'HẠN TUYỆT ĐỐI của một phiên, tính từ lần ĐĂNG NHẬP THẬT' và jwt.ts:19 chốt '90 ngày (quyết định của chủ dự án)'. Tôi đã kiểm kịch bản có thật sự chạm được ~120 ngày không, vì refresh còn đòi msLeft < 15 ngày: người dùng ngắt quãng (đăng nhập ngày 0 → exp 30; ghé ngày 29 → exp 59; ghé ngày 58 → exp 88; ghé ngày 87, msLeft=1d<15d và sessionAge=87<90 ⇒ refresh → exp ngày 117) chạm được; trường hợp xấu nhất refresh ở ngày 89.99 cho exp ~119.99. Vậy con số thật vượt 27-30 ngày so với con số được ghi trong tài liệu và trong commit. Không bác bỏ được bằng 'chủ ý': không chỗ nào trong mã hay chú thích thừa nhận cái đuôi +30 ngày này. Giữ LOW: hệ quả chỉ là 30 ngày sống thêm của token đã bị đánh cắp cộng với việc người vận hành lập kế hoạch ứng cứu theo con số sai — không tạo đường truy cập mới.

**Vá đề xuất**

Kẹp hạn mới theo ngân sách tuyệt đối còn lại: `const remainingAbs = Math.floor((authAt + SESSION_ABSOLUTE_MAX_AGE * 1000 - Date.now()) / 1000); const ttl = Math.min(SESSION_MAX_AGE, remainingAbs); if (ttl > 0) { ...encrypt(..., `${ttl}s`); cookies.set(..., { maxAge: ttl }) }` — hoặc sửa lại chú thích/commit cho khớp thực tế 120 ngày.

---

### LOW · `1c00055` · R5-5 — /api/review/download-zip vẫn không có HEAD handler — Next 16 chạy GET để trả lời HEAD, dựng nguyên zip; mục HEAD bị bỏ im lặng khỏi bản vá

- **Loại:** INCOMPLETE_FIX
- **Vị trí:** `src/app/api/review/download-zip/route.ts:45`
- **Cáo buộc:** Mục NEW-internal-zip-no-cap trong sổ nêu ba phần: không rate-limit, không trần byte, VÀ "không chặn HEAD". Commit làm hai phần đầu và bỏ phần HEAD mà không nhắc một chữ nào trong thông điệp. Route sinh đôi công khai đã có sẵn HEAD-405 kèm chú thích giải thích đúng hành vi của Next 16.

**Kịch bản hỏng**

MEMBER (đúng kẻ tấn công mà mục này nêu tên) gửi HEAD /api/review/download-zip?folders=<id thư mục lớn> kèm cookie phiên. Next chạy GET, collectZipFiles dựng plan, archiver stream toàn bộ byte từ R2 — nhưng thân phản hồi bị loại bỏ nên KHÔNG có backpressure từ mạng người dùng, tức hiệu số (byte đọc − byte đã nhận) phình nhanh nhất có thể ⇒ OOM function 3009 MB nhanh và rẻ hơn cả GET, và kẻ tấn công không tốn băng thông tải xuống. Trần 12/10 phút chỉ giới hạn tần suất, không đóng đường này; và mỗi lần như vậy còn đốt luôn hạn mức tải hợp lệ của chính tài khoản đó.

**Bằng chứng**

```
src/app/api/review/download-zip/route.ts — chỉ export: runtime(:25), dynamic(:26), maxDuration(:28), GET(:45). Không có `export async function HEAD`.

src/app/api/share/[token]/download-zip/route.ts:81-84 —
/** Next 16 auto-implements HEAD by running GET — which would spin up a whole zip for a
 *  link-checker that never reads the body. Answer it explicitly instead. */
export async function HEAD() { return new NextResponse(null, { status: 405, headers: { Allow: 'GET' } }) }

docs/security-audit/SWEEP_2026-07-30.md:263-264 — "không rate-limit, không trần byte, và không chặn HEAD ... hoặc chỉ cần HEAD/link-checker chạm URL là function dựng cả zip vì không có HEAD handler"
```

**Phán quyết của người bác bỏ** (mức gốc MEDIUM → **LOW**)

KHÔNG BÁC BỎ ĐƯỢC VỀ SỰ KIỆN — mục HEAD đúng là biến mất khỏi bản vá mà không một chữ giải thích, dù sổ nêu nó là một trong ba phần.

(a) Sổ nêu ba phần: docs/security-audit/SWEEP_2026-07-30.md, NEW-internal-zip-no-cap, **Vấn đề**: "không rate-limit, không trần byte, và không chặn HEAD"; **Đường khai thác** bước (4): "hoặc chỉ cần HEAD/link-checker chạm URL là function dựng cả zip vì không có HEAD handler". Commit message mục 5 chỉ nói "Thêm 12/10 phút theo NGƯỜI GỬI + trần 20 GB" — không nhắc HEAD, không nêu lý do bỏ.

(b) Route vẫn không có HEAD: tôi đọc hết src/app/api/review/download-zip/route.ts — chỉ export `runtime`(:25), `dynamic`(:26), `maxDuration`(:28), `GET`(:45). Không có `export async function HEAD`.

(c) Route sinh đôi đã có sẵn bản mẫu 3 dòng kèm lý do: src/app/api/share/[token]/download-zip/route.ts:81-85 — "Next 16 auto-implements HEAD by running GET — which would spin up a whole zip for a link-checker that never reads the body. Answer it explicitly instead." + `export async function HEAD() { return new NextResponse(null, { status: 405, headers: { Allow: 'GET' } }) }`. package.json:95 xác nhận `"next": "16.1.6"`, đúng phiên bản chú thích đó nói tới.

HẠ TỪ MEDIUM XUỐNG LOW, vì phần "thiệt hại" của cáo buộc yếu hơn phần "sự kiện":
· Chính bản vá này đã đóng đường lặp: `limitDb('zip:'+access.userId+':'+workspaceId, 12, 600, { failClosed: true })` (download-zip.ts:109) chạy TRONG collectZipFiles, mà HEAD chạy GET nên nó cũng đếm — tức HEAD bị chặn ở đúng 12 lượt/10 phút y như GET, không có đường vòng.
· Actor bắt buộc là tài khoản đã đăng nhập có quyền review (requireReviewAccess ở :98 chạy TRƯỚC), không phải bộ quét thư ngoài Internet — khác hẳn mục unsub-get-mutates cùng commit.
· Luận điểm "không backpressure ⇒ OOM nhanh hơn GET" là SUY ĐOÁN chưa chứng minh: nó phụ thuộc việc Next 16 tiêu thụ hay huỷ ReadableStream khi phương thức là HEAD, và người tìm lỗi không đọc được mã đó. Nếu runtime huỷ stream thì gần như không byte nào bị đọc. Tôi không loại trừ khả năng đó, nhưng cũng không tính nó vào mức độ.
Còn lại là chi phí thật nhưng nhỏ: một HEAD (từ prefetch cùng-origin hoặc extension) vẫn chạy hết truy vấn DB + getFolderManifest và đốt một suất trong 12 suất hợp lệ của chính người dùng đó.

**Vá đề xuất**

Thêm `export async function HEAD() { return new NextResponse(null, { status: 405, headers: { Allow: 'GET' } }) }` vào src/app/api/review/download-zip/route.ts — sao y route công khai; hoặc nếu cố ý bỏ thì phải ghi lý do vào commit/sổ thay vì để mục biến mất.

---

### LOW · `1c00055` · R5-6 — Bốn chốt N9 mới không dùng `tooManyAttempts()` — với failClosed, một sự cố DB báo cho khách "Too many requests" và chặn toàn bộ đường ghi của cổng khách

- **Loại:** REGRESSION
- **Vị trí:** `src/actions/share-portal-actions.ts:1364`
- **Cáo buộc:** Chính file này, ở :545-556, đã dựng helper `tooManyAttempts(rl)` cho ĐÚNG tình huống này (bài học HT-015 vòng 2: "Với failClosed, một sự cố của limiter (thiếu bảng RateLimitBucket, statement timeout) cũng trả success=false ... tức khách bị báo 'quá nhiều lần thử, đợi khoảng 60 phút' cho một lỗi máy chủ mà họ không gây ra"). Bốn chốt mới bỏ qua helper đó và in câu cứng. Đồng thời, ba trong bốn đường ghi này TRƯỚC ĐÂY dùng `rateLimit()` in-memory — thứ không thể lỗi — nên bản vá đưa thêm một điểm hỏng chung cho toàn bộ đường ghi của cổng khách.

**Kịch bản hỏng**

Neon vào cold-start / hết connection pool / statement timeout trong vài chục giây. limitDb ném lỗi ⇒ với failClosed:true tất cả trả success=false ⇒ khách trên cổng /share không bình luận, không gửi yêu cầu, không thả cảm xúc, không tạo thương hiệu con được, và màn hình báo "Too many requests. Please try again later." — đổ lỗi cho khách, và đợi bao lâu cũng không hết vì nguyên nhân không phải hạn mức. Trước bản vá, ba trong bốn đường này dùng bộ đếm in-memory nên sự cố DB không thể chặn chúng.

**Bằng chứng**

```
share-portal-actions.ts:1364/1367/1487/1741/1751/1830 — tất cả đều dạng:
    if (!ipRl.success) return { success: false, error: 'Too many requests. Please try again later.' }
(không đọc `rl.errored`)

Đối chiếu :545-556 — "[AUDIT HT-015 — vòng 2] PHÂN BIỆT 'BẠN LÀM QUÁ NHIỀU' VỚI 'PHÍA CHÚNG TÔI HỎNG' ... if (rl.errored) return { success: false, error: 'Something went wrong on our side...' }"

rate-limit-db.ts:52 — return { success: !opts.failClosed, remaining: 0, retryAfterSec: windowSec, errored: true }
```

**Phán quyết của người bác bỏ** (mức gốc LOW → **LOW**)

KHÔNG BÁC BỎ ĐƯỢC — tôi đã đọc cả helper lẫn bốn chốt mới; sự bất nhất là có thật và nó nằm trong CÙNG MỘT FILE.

(a) Helper tồn tại, đúng cho tình huống này, và ghi rõ bài học: share-portal-actions.ts:547-560 — "[AUDIT HT-015 — vòng 2] PHÂN BIỆT 'BẠN LÀM QUÁ NHIỀU' VỚI 'PHÍA CHÚNG TÔI HỎNG'. Với failClosed, một sự cố của limiter (thiếu bảng RateLimitBucket, statement timeout) cũng trả success=false ... tức khách bị báo 'quá nhiều lần thử, đợi khoảng 60 phút' cho một lỗi máy chủ mà họ không gây ra và đợi bao lâu cũng không hết" → `if (rl.errored) return { … 'Something went wrong on our side…' }`. Các chốt CŨ trong file dùng đúng helper này (:619, :623, :625, :636, :686).

(b) Bốn chốt mới bỏ qua nó, in câu cứng, không đọc `rl.errored`: :1364, :1367, :1741, :1751, :1830 — tất cả dạng `return { success: false, error: 'Too many requests. Please try again later.' }` (và :1488 cho subclient). Trường tồn tại và đã được trả về: rate-limit-db.ts:52 `return { success: !opts.failClosed, remaining: 0, retryAfterSec: windowSec, errored: true }`.

(c) Phần "thêm điểm hỏng chung" cũng đúng theo diff: ba trong bốn đường (`submitClientRequestViaToken`, `postCommentViaToken`, `toggleReactionViaToken`) trước đây là `rateLimit()` in-memory — không thể lỗi — nay là `limitDb` + `failClosed: true`, tức phụ thuộc bảng `RateLimitBucket` (rate-limit-db.ts:32-39). Chính commit message tự cảnh báo điều này: "bảng RateLimitBucket phải có trên prod (mục chờ anh xác nhận từ đợt HT-015 — nay có thêm 8 chốt failClosed phụ thuộc vào nó)". Đây đúng dạng "gate fail-closed phụ thuộc một BẢNG có thể không tồn tại ở prod".

GIỮ LOW, không nâng: rủi ro "bảng không tồn tại" gần như đã bị loại trừ về mặt thực nghiệm — nếu bảng thiếu thì các chốt failClosed CÓ SẴN đã hỏng từ trước, gồm api/r/[slug]/unlock/route.ts:25, api/share/[token]/download-zip/route.ts:98 và requestPortalNotifyEmail :618-636 (tức mở /share đặt email đã hỏng). Và trong một sự cố DB thật thì `resolveShareToken` (chạy trước, :1347/:1474/:1726/:1819) cũng hỏng, nên phần lớn cổng khách chết vì lý do khác trước khi tới limiter. Hệ quả còn lại là chất lượng thông báo — đổ lỗi cho khách trong một cửa sổ sự cố hẹp (statement timeout riêng của bảng đó), đúng LOW.

**Vá đề xuất**

Dùng `tooManyAttempts(ipRl)` / `tooManyAttempts(adminRl)` cho cả bốn chốt (helper đã có sẵn trong file, cùng kiểu RateLimitResult), và cân nhắc để tầng IP fail-OPEN (giữ failClosed cho tầng người nhận là đủ để chặn bơm email).

---

### LOW · `b581e3a` · R3-1 — Chốt ghi raw-footage bỏ `profileRole` → profile ADMIN của workspace cũ bị khoá khỏi Multi-Hook Map (trước đây ghi được)

- **Loại:** REGRESSION
- **Vị trí:** `src/actions/raw-footage-actions.ts:171`
- **Cáo buộc:** `assertCanWriteRawFootage` chỉ đọc `workspaceRole`. Nhưng `verifyWorkspaceAccess` HẠ một profile ADMIN xuống 'MEMBER' khi `workspace.createdAt < profileAccess.grantedAt` (security.ts:106 → nhánh fallback 132-141). Người đó vẫn vào được /admin (cổng là `verifyProfileAdminAccess`, honour `profileRole`) và vẫn được truyền `isAdmin={true}` nên NÚT SỬA SƠ ĐỒ HIỆN RA, nhưng `saveHookGraph` từ chối. `loadTaskOrFail` lấy `access.workspaceRole` mà VỨT `access.profileRole` — đúng nửa giá trị mà bản vá nói là 'trước đây bị bỏ'.

**Kịch bản hỏng**

Chị Lan có ProfileAccess role=ADMIN cấp ngày 2026-05-01; workspace "07 / 2026"… không, lấy workspace W tạo 2026-01-01 (cũ hơn grantedAt). Chị vào /admin (qua được), mở task detail, tab Assets, bấm "Sửa sơ đồ", kéo lại Multi-Hook Map 20 phút, bấm Lưu → toast "Chỉ quản lý hoặc người được giao task này mới sửa được sơ đồ dựng." Toàn bộ chỉnh sửa mất (state cục bộ, không lưu nháp). TRƯỚC commit này thao tác đó CHẠY (chốt cũ chỉ đòi MEMBER). Chị là quản lý thật, nhưng thông báo nói chị không phải quản lý.

**Bằng chứng**

```
raw-footage-actions.ts:143  `workspaceRole = access.workspaceRole ?? null`  (profileRole bị bỏ)
raw-footage-actions.ts:171-174
    const isWorkspaceAdmin = r.workspaceRole === 'OWNER' || r.workspaceRole === 'ADMIN'
    if (isWorkspaceAdmin) return null
    if (r.task.assigneeId && r.task.assigneeId === r.session?.user?.id) return null
    return { error: 'Chỉ quản lý hoặc người được giao task này mới sửa được sơ đồ dựng.' }

security.ts:106  `} else if (profileAccess?.role === 'ADMIN' && workspace.createdAt >= profileAccess.grantedAt) {` → ngược lại rơi xuống 132-141 `workspaceRole = 'MEMBER'`
security.ts:180-191 `verifyProfileAdminAccess` = vị từ chuẩn của repo: `workspaceRole OWNER/ADMIN || profileRole OWNER/ADMIN`, chú thích ghi rõ nó tồn tại để 'covers a profile ADMIN viewing a workspace created BEFORE their grant'.
nav-access.ts:27-29 (chính repo xác nhận tình huống này CÓ THẬT): 'Một profile ADMIN được cấp quyền SAU khi workspace ra đời bị verifyWorkspaceAccess hạ xuống MEMBER (security.ts:106) → qua được cổng /admin'
src/app/[workspaceId]/admin/layout.tsx:61-65  `const navAccess = await deriveNavAccess(workspaceId); if (!navAccess.admin) redirect(...)`
src/app/[workspaceId]/admin/page.tsx:411  `isAdmin={true}` → NewDesktopTaskTable:856 `isAdmin={isAdmin}` → TaskDetailModal:728 `onEditMap={handleEditMap}` → TaskResourcesSection.tsx:63 `{isAdmin && …}` (nút Sửa sơ đồ)
```

**Phán quyết của người bác bỏ** (mức gốc MEDIUM → **LOW**)

Cơ chế ĐÚNG, tôi dựng lại được nguyên đường: security.ts:106 `} else if (profileAccess?.role === 'ADMIN' && workspace.createdAt >= profileAccess.grantedAt) {` → workspace CŨ hơn grantedAt rơi xuống nhánh fallback security.ts:141 `workspaceRole = 'MEMBER'`; security.ts:184-186 `verifyProfileAdminAccess` vẫn cho qua nhờ `access.profileRole === 'OWNER' || access.profileRole === 'ADMIN'`; admin/layout.tsx:61-65 gác bằng `deriveNavAccess` (nav-access.ts:63 gọi đúng verifyProfileAdminAccess) → vào được /admin; admin/page.tsx:411 `isAdmin={true}` HARDCODE → NewDesktopTaskTable.tsx:859 `isAdmin={isAdmin}` → TaskDetailModal.tsx:720 → TaskResourcesSection.tsx:63 `{isAdmin && …}` nút 'Sửa map'. Trước bản vá `loadTaskOrFail` chỉ cần MEMBER nên `saveHookGraph` CHẠY; nay raw-footage-actions.ts:171 chỉ đọc `workspaceRole` nên TỪ CHỐI. Regression có thật → KHÔNG bác bỏ. HẠ xuống LOW vì ba dữ kiện người tìm lỗi bỏ qua: (1) chính lớp người dùng đó ĐÃ bị chặn khỏi mọi đường ghi admin khác trên cùng cái board — `createTask` đòi `verifyWorkspaceAccess(workspaceId, 'ADMIN')` (admin-actions.ts:90) và `createTasksFromBatch` cũng vậy (velox-batch-actions.ts:137) — nên bản vá chỉ kéo raw-footage về ngang luật đang chi phối, không đẻ ra luật chặn mới; (2) đây là quyết định CÓ TÀI LIỆU: SWEEP_2026-07-30.md mục P1-021 '❓Cần quyết' liệt kê (a)/(b)/(c) và khuyến nghị (b) với khuôn task-management-actions.ts:101-102 vốn cũng chỉ đọc `workspaceRole`; (3) KHÔNG mất dữ liệu như cáo buộc mô tả: TaskDetailModal.tsx:137-145 khi lỗi chỉ `toast.error(...)`, KHÔNG `setEditingMap(false)`, KHÔNG xoá `editGraph` — bản sửa 20 phút vẫn nằm nguyên trên màn hình, người dùng chỉ không lưu được. Giá trị còn lại của phát hiện: nút hiện ra rồi mới từ chối (UI nói dối), và `assertCanWriteRawFootage` lệch với vị từ admin chuẩn của repo.

**Vá đề xuất**

Trả thêm `profileRole` từ `loadTaskOrFail` (`access.profileRole`) và cho `assertCanWriteRawFootage` chấp nhận `profileRole === 'OWNER' || 'ADMIN'` — tức đúng vị từ `verifyProfileAdminAccess` (security.ts:184-186) mà repo đã chốt là vị từ admin duy nhất an toàn.

---

### LOW · `b581e3a` · R3-2 — Lý do GIỮ rebind push là SAI trên mã client: người dùng B không bao giờ bấm "Bật đẩy", nên rò chéo A→B vẫn còn nguyên và audit mới không bao giờ chạy

- **Loại:** WRONG_ASSUMPTION
- **Vị trí:** `src/actions/push-actions.ts:46`
- **Cáo buộc:** Bản vá cố ý KHÔNG bịt rebind, lập luận: 'máy dùng chung, A đăng xuất rồi B bật thông báo trên CÙNG trình duyệt ⇒ endpoint không đổi, dòng cũ vẫn trỏ về A ⇒ thông báo của A đẩy sang thiết bị B'. Tôi đi kiểm client: `PushNotificationToggle` đọc `pushManager.getSubscription()` — đăng ký này thuộc về TRÌNH DUYỆT/ORIGIN, KHÔNG thuộc về tài khoản. B đăng nhập trên máy đó thấy nút ở trạng thái ĐÃ BẬT ("Tắt đẩy") nên KHÔNG có lý do gì bấm bật ⇒ `savePushSubscription` không được gọi ⇒ nhánh rebind (và audit mới) KHÔNG BAO GIỜ chạy ⇒ hàng DB vẫn `userId = A` và thông báo của A tiếp tục đẩy tới thiết bị B đang dùng. Không có `pushsubscriptionchange` trong public/sw.js và không nơi nào khác gọi `savePushSubscription`.

**Kịch bản hỏng**

Máy chung ở văn phòng: editor A bật thông báo đẩy rồi đăng xuất (không bấm "Tắt đẩy"). Editor B đăng nhập trên đúng trình duyệt đó; nút hiển thị "Tắt đẩy" nên B không làm gì. Admin giao task cho A → `sendWebPushToUser(A)` → thông báo "New task assigned — <tên khách> / <tên video>" hiện trên màn hình máy B đang dùng. Đây CHÍNH LÀ kịch bản bản vá nêu ra để biện minh cho việc giữ rebind, nhưng rebind không chạy nên không có gì được sửa và cũng KHÔNG có dòng audit `push.subscription_rebound` nào để đối chiếu.

**Bằng chứng**

```
push-actions.ts:46-51 (lý do): '⚠️ KHÔNG vá bằng cách bỏ `userId` khỏi nhánh update … A đăng xuất rồi B bật thông báo trên CÙNG trình duyệt … Vá tối thiểu: GIỮ rebind, nhưng làm nó CÓ VẾT'
PushNotificationToggle.tsx:46-48
    const reg = await navigator.serviceWorker.getRegistration('/sw.js')
    const existing = reg ? await reg.pushManager.getSubscription() : null
    if (!cancelled) setSubscribed(Boolean(existing))
PushNotificationToggle.tsx:113,119  `onClick={subscribed ? disable : enable}` … `{subscribed ? 'Tắt đẩy' : 'Bật đẩy'}`  → B thấy 'Tắt đẩy', `enable()` không chạy
grep toàn repo: chỉ PushNotificationToggle.tsx:73 gọi `savePushSubscription`; public/sw.js chỉ có listener 'push' + 'notificationclick', KHÔNG có 'pushsubscriptionchange'
web-push.ts:40-72  `findMany({ where: { userId } })` → gửi title+body thật tới endpoint đó
```

**Phán quyết của người bác bỏ** (mức gốc MEDIUM → **LOW**)

Kiểm mã client thì cáo buộc ĐÚNG, và còn đúng hơn người tìm lỗi nghĩ ở một chỗ. PushNotificationToggle.tsx:46-48 đọc `reg.pushManager.getSubscription()` (đăng ký thuộc ORIGIN/trình duyệt, không thuộc tài khoản) → :113 `onClick={subscribed ? disable : enable}` nên B thấy 'Tắt đẩy' và `enable()` không chạy; grep toàn repo: `savePushSubscription` chỉ có ĐÚNG MỘT nơi gọi là PushNotificationToggle.tsx:73; public/sw.js chỉ có 'install'/'activate'/'push'/'notificationclick' — KHÔNG có 'pushsubscriptionchange'; /api/auth/logout/route.ts thu hồi token nhưng KHÔNG xoá PushSubscription và không unsubscribe. Bổ sung: ngay cả đường 'B bấm Tắt rồi bấm Bật' cũng không chạm nhánh rebind — `deletePushSubscription` scope theo người gọi (push-actions.ts:109 `deleteMany({ where: { endpoint, userId } })`) nên KHÔNG xoá được dòng của A, còn `sub.unsubscribe()` làm lần subscribe sau sinh endpoint MỚI ⇒ upsert đi nhánh create. Tức nhánh rebind chéo người dùng trên thực tế CHỈ tới được bằng cách gọi thẳng server action với endpoint người khác (đúng kịch bản tấn công), đảo ngược lập luận đánh đổi ghi trong chú thích push-actions.ts:46-51. HẠ xuống LOW (không phải MEDIUM): rò này CÓ TRƯỚC bản vá và bản vá không làm nặng thêm; chính sổ kiểm toán xếp PUSH-REBIND là Low và ghi rõ hệ quả chiếm endpoint là 'GIẾT được kênh push đó (không cướp đọc được)'; nội dung rò trên máy dùng chung là tiêu đề task/tên client mà nhân sự cùng tenant vốn đã thấy trên board. Giá trị thật của phát hiện là: chú thích biện minh cho việc KHÔNG vá dựa trên một luồng client không tồn tại — đúng kiểu lỗi 'tin mô tả thay vì truy cơ chế'.

**Vá đề xuất**

Đừng dựa vào việc B tự bấm bật. Ở nơi khởi tạo (PushNotificationToggle useEffect) khi đã có `existing` thì vẫn gọi `savePushSubscription` để rebind về người đang đăng nhập (hoặc thêm một action `claimPushSubscription(endpoint)`); hoặc hủy đăng ký ở đường /api/auth/logout. Chừng nào chưa có, đừng ghi trong chú thích rằng kịch bản máy dùng chung đã được xử lý.

---

### LOW · `b581e3a` · R3-4 — Compare-and-set của bulkUpdateTaskStatus đếm NHẦM task do người khác vừa đổi sang cùng trạng thái là "mình đã ghi" → email digest + audit báo sai

- **Loại:** INCOMPLETE_FIX
- **Vị trí:** `src/actions/bulk-task-actions.ts:647`
- **Cáo buộc:** Cách cắt `validTasks` thì ĐÚNG (lọc rồi thay tại chỗ, mọi consumer phía dưới đọc cùng mảng — audit:674, email:699, count:762 đều nhất quán). Khiếm khuyết nằm ở VỊ TỪ đọc lại: nó hỏi "task này hiện có status = newStatus không", chứ không hỏi "lượt updateMany của TÔI có chạm nó không". Task bị người khác đổi sang đúng newStatus giữa lúc đọc và lúc ghi sẽ bị tính là đã ghi thành công. Commit này tự nhận là vòng soát lại bản vá bulk-task-actions.ts (mục 0) nhưng chỉ bắt lỗi transaction, bỏ sót chỗ này.

**Kịch bản hỏng**

Hai admin cùng chọn 10 task ở 'Revision' và bấm chuyển 'Hoàn tất' cách nhau vài giây. Admin1 ghi trước. `updateMany` của Admin2 khớp 0 hàng (status đã là 'Hoàn tất' ≠ fromStatus 'Revision'), nhưng đọc lại thấy status = 'Hoàn tất' nên cả 10 vào `applied`: `staleCount = 0` (giấu mất xung đột), audit ghi Admin2 đã đổi 10 task mà anh ta không đổi, và mỗi editor nhận HAI email digest cho cùng một lần đổi trạng thái. Lưu ý: khối này do commit 95be7eb tạo, commit b581e3a là vòng soát lại cùng file và không bắt.

**Bằng chứng**

```
bulk-task-actions.ts:638-651
    for (const [fromStatus, ids] of idsByReadStatus) {
        await prisma.task.updateMany({ where: { id: { in: ids }, workspaceId, status: fromStatus }, data: updateData })
    }
    const appliedRows = await prisma.task.findMany({
        where: { id: { in: validTasks.map((t) => t.id) }, workspaceId, status: newStatus },
        select: { id: true },
    })
    const appliedIds = new Set(appliedRows.map((r) => r.id))
    const staleCount = validTasks.length - appliedIds.size
```

**Phán quyết của người bác bỏ** (mức gốc LOW → **LOW**)

Cơ chế ĐÚNG, tôi xác nhận trên mã: bulk-task-actions.ts:638-641 ghi bằng `updateMany({ where: { id: { in: ids }, workspaceId, status: fromStatus } })` (không lấy `result.count`), rồi :644-651 đọc lại bằng vị từ TRẠNG THÁI ĐÍCH `status: newStatus` — nên task bị người khác đẩy sang đúng newStatus giữa hai thời điểm bị tính là 'mình đã ghi': `staleCount = 0`, audit :668-679 ghi `count: validTasks.length` cho một lượt ghi 0 hàng, và vòng digest :699-720 gửi lại email cho đúng nhóm người nhận. KHÔNG bác bỏ. Giữ LOW (không nâng) vì hai lý do đo được: trạng thái cuối trong DB vẫn ĐÚNG (cả hai admin muốn cùng newStatus), và hàm này KHÔNG ghi tiền — `updateData` chỉ có status/version/deadline/assigneeId/isArchived, nên hệ quả tối đa là một email digest trùng + một dòng audit thổi phồng số. Lưu ý phạm vi cho người điều phối: khối này KHÔNG nằm trong commit b581e3a — `git show b581e3a -- src/actions/bulk-task-actions.ts` chỉ có ĐÚNG MỘT hunk `@@ -302,19 +302,31 @@` trong `bulkUpdateTaskDetails` (gỡ `tx.task.findUnique` khỏi transaction), còn compare-and-set này nằm trong `bulkUpdateTaskStatus` và thuộc 95be7eb. Mục 0 của commit chỉ tự nhận sửa lỗi transaction, không tuyên bố soát lại cả file — nên xếp đây là nợ tồn của 95be7eb chứ không phải 'bỏ sót' của b581e3a.

**Vá đề xuất**

Dùng số hàng thật sự ghi được: cộng dồn `result.count` của từng `updateMany` và lấy chính tập id theo từng nhóm fromStatus (hoặc đọc lại kèm `updatedAt`/`version` đã tăng) thay vì hỏi lại trạng thái đích.

---

### LOW · `d5aaef1` · R7-3 — readCronKey được tạo ở 'điểm nghẽn' nhưng KHÔNG route nào dùng — chú thích mô tả một cơ chế không tồn tại

- **Loại:** INCOMPLETE_FIX
- **Vị trí:** `src/lib/cron-auth.ts:38`
- **Cáo buộc:** Nửa thứ hai của bản vá CRON-TIMING (gom cách đọc khoá về một chỗ) được VIẾT nhưng không được CẮM. `readCronKey` không có một nơi gọi nào; cả 7 route vẫn giữ khối đọc header riêng và vẫn khác nhau. Chú thích ngay trên hàm khẳng định điều ngược lại. Đây đúng là kiểu lỗi lặp lại của chiến dịch — 'helper đúng mà không đặt ở điểm nghẽn thì không giúp ai' — chỉ là lần này rơi vào chính hàm sinh ra để chữa nó. KHÔNG có đường khai thác: phần bảo mật thật (safeEqual) đã cắm đủ 7/7, và không route nào đọc khoá từ query string.

**Kịch bản hỏng**

Không phải lỗ hổng — là bẫy cho vòng sau. Người bảo trì đọc chú thích :32-36 sẽ tin cách đọc khoá đã tập trung, rồi (a) thêm route cron thứ 8 bằng `readCronKey` và route đó im lặng KHÔNG chấp nhận header `x-cron-key` mà check-deadline vẫn chấp nhận, hoặc (b) 'dọn' check-deadline:19 cho khớp helper và làm hỏng bất kỳ trình gọi ngoài nào đang dùng `x-cron-key`. Rủi ro là đứt lịch cron im lặng (send-digest/check-deadline chạy mỗi giờ), không phải rò bí mật.

**Bằng chứng**

```
src/lib/cron-auth.ts:31-44 —
```
 * Đọc khoá cron từ request theo cùng một thứ tự ở mọi route ...
 * Gom lại để 7 route không có 7 cách đọc hơi khác nhau.
 */
export function readCronKey(request: Request): string | null {
    const headerKey = request.headers.get('x-cron-secret')
```
`grep -rn "readCronKey" src/ scripts/` → đúng 1 dòng, chính là dòng định nghĩa :38. Không nơi gọi.
Cách đọc vẫn lệch trong thực tế: src/app/api/cron/check-deadline/route.ts:17-20 —
```
    const headerKey =
        request.headers.get('x-cron-secret') ||
        request.headers.get('x-cron-key') ||
        null
```
còn src/app/api/cron/auth-cleanup/route.ts:23 chỉ `request.headers.get('x-cron-secret')`, và `readCronKey` cũng không biết tới `x-cron-key`.
```

**Phán quyết của người bác bỏ** (mức gốc LOW → **LOW**)

KHÔNG bác bỏ được — dữ kiện đúng 100%, tôi kiểm lại bằng máy.

(1) `grep -rn readCronKey src/ scripts/ mcp-server/` trả về ĐÚNG MỘT dòng: src/lib/cron-auth.ts:38 — chính dòng định nghĩa. Không có một nơi gọi nào. Hàm là export chết ngay từ commit sinh ra nó.

(2) Chú thích src/lib/cron-auth.ts:31-36 viết ở THÌ HIỆN TẠI như một cơ chế đang chạy: 'Đọc khoá cron từ request theo cùng một thứ tự ở MỌI ROUTE ... Gom lại để 7 route không có 7 cách đọc hơi khác nhau.' Không route nào import nó, nên phát biểu này sai về thực tế.

(3) Bảy cách đọc vẫn lệch thật. Tôi đọc cả 7 route: check-deadline/route.ts:17-20, cleanup-notifications:14-18, hard-delete-profiles:24-28, hard-delete-workspaces:24-28, review-janitor:17-21, send-digest:14-18 đều nhận `x-cron-secret || x-cron-key`; còn auth-cleanup/route.ts:23 chỉ nhận `request.headers.get('x-cron-secret')`. `readCronKey` (:38-44) KHÔNG biết tới `x-cron-key` — tức nếu ai đó cắm nó vào, 6 route kia sẽ ÂM THẦM mất header thứ hai chúng đang chấp nhận.

(4) Đúng như người tìm lỗi tự nói: KHÔNG có đường khai thác. Phần bảo mật thật đã cắm đủ — `safeEqual` xuất hiện và được dùng ở cả 7 route (check-deadline:32, auth-cleanup:31, cleanup-notifications:29, hard-delete-profiles:38, hard-delete-workspaces:37, review-janitor:29, send-digest:28), 0 route còn `key !== secret`, và không route nào đọc khoá từ query string.

GIỮ LOW, không nâng không hạ: đây là mã chết + một chú thích mô tả cơ chế chưa tồn tại — đúng loại 'tin mô tả thay vì truy cơ chế' mà chiến dịch đang chống, và trớ trêu là commit message của chính bản vá này tuyên bố 'Helper đúng mà không đặt ở điểm nghẽn thì không giúp ai' trong khi nửa thứ hai của nó rơi đúng vào lỗi đó. Rủi ro là đứt lịch cron im lặng ở vòng bảo trì sau (send-digest/check-deadline chạy theo giờ), không phải rò bí mật. Không đủ để bác bỏ vì đây là dữ kiện kiểm chứng được trong mã, không phải suy đoán.

**Vá đề xuất**

Chọn một trong hai, đừng để lửng: (a) thay 7 khối đọc header bằng `const key = readCronKey(request)` và quyết định dứt khoát có giữ `x-cron-key` trong helper hay không; hoặc (b) xoá `readCronKey` và sửa chú thích :32-36 để không hứa một cơ chế chưa tồn tại.

---

### LOW · `83b0aea` · R8-1 — loadTaskDetail vẫn KHÔNG có vị từ sở hữu — bản vá thu hẹp `client` nhưng để nguyên nửa còn lại mà chính sổ ghi chép của finding này đã nêu; mọi MEMBER đọc được chi tiết ĐẦY ĐỦ của MỌI task trong workspace (gồm frameUsername/framePassword)

- **Loại:** INCOMPLETE_FIX
- **Vị trí:** `src/lib/task-detail-loader.ts:82`
- **Cáo buộc:** Commit đóng finding NEW-nested-client-full-row-to-editors bằng cách thu hẹp quan hệ lồng `client`. Nhưng mục ĐƯỜNG KHAI THÁC của chính finding đó trong docs/security-audit/SWEEP_2026-07-30.md:271 viết rõ: «Diện rộng hơn ở /{workspaceId}/task/{taskId}: loadTaskDetail … chỉ `task.findUnique({ where: { id: taskId } })` — extension chèn workspaceId/profileId nhưng KHÔNG có điều kiện assigneeId, nên một editor mở được chi tiết task của người khác». Bản vá không chạm vào vế này, và commit message cũng KHÔNG liệt kê nó trong mục HOÃN. Vì `include: TASK_INCLUDE` không kèm `select` ở tầng Task, findUnique trả VỀ TOÀN BỘ cột scalar của Task, còn sanitizeTaskListForUser chỉ set null 3 cột (jobPriceUSD/exchangeRate/profitVND). Toàn bộ object đó được truyền thẳng làm prop cho một component 'use client' ⇒ nằm nguyên trong RSC flight payload — đúng kỹ thuật đọc trộm mà finding này mô tả.

**Kịch bản hỏng**

Editor B (ProfileAccess role USER ⇒ workspaceRole 'MEMBER') mở chợ việc (marketplace) và ghi lại `id` của 50 task chưa giao — payload marketplace trả thẳng `id: t.id`. Editor A nhận (claim) một trong số đó; từ lúc này task không còn xuất hiện ở /dashboard của B (query lọc `assigneeId: userId`). Nhưng B gõ tay `/{workspaceId}/task/{taskId đã ghi}` → [workspaceId]/layout.tsx chỉ kiểm quyền truy cập WORKSPACE (đạt), loadTaskDetail không kiểm sở hữu → trả về task của A. B mở tab Network đọc RSC flight và thấy nguyên: `framePassword` + `frameUsername` (tài khoản frame.io dùng chung của team), `notes_vi` (brief nội bộ), `resources` / `fileLink` / `collectFilesLink` / `submissionFolder` (link raw footage + thư mục giao hàng của khách), `wageVND` / `value`. Không bước nào chặn. Sau bản vá 83b0aea, đúng những trường này vẫn đi qua — bản vá chỉ cắt phần `client.*`.

**Bằng chứng**

```
src/lib/task-detail-loader.ts:82-90
    const rawTask = await (workspacePrisma as any).task.findUnique({
        where: { id: taskId },          // ← không có assigneeId / ownership predicate
        include: TASK_INCLUDE,          // ← không select ở tầng Task ⇒ trả HẾT scalar
    })
    if (!rawTask) return { kind: 'notFound' }
    const [task] = serializeDecimal(sanitizeTaskListForUser([rawTask], isAdmin)) as any[]

src/lib/task-sanitize.ts:12  (chỉ 3 cột bị che)
    const SENSITIVE_FIELDS = ['jobPriceUSD', 'exchangeRate', 'profitVND'] as const

prisma/schema.prisma:356-358  (cột nhạy cảm KHÔNG bị che)
    frameUsername    String?
    framePassword    String?
    frameNote        String?           @default("Thông tin tài khoản frame dành cho trường hợp bạn bị out ra khỏi frame của team")

src/app/[workspaceId]/task/[taskId]/page.tsx:17-30 — chỉ gác bằng loadTaskDetail rồi đẩy nguyên object sang client component:
    const [data] = await Promise.all([loadTaskDetail(workspaceId, taskId), ...])
    return <TaskDetailRoute task={data.task} ... />
src/components/tasks/TaskDetailRoute.tsx:1  "use client"

Nguồn taskId cho kẻ khai thác — marketplace phát id cho MỌI member:
src/actions/claim-actions.ts:85-105
    const tasks = await workspacePrisma.task.findMany({ where: { assigneeId: null, isArchived: false }, ..., take: 50 })
    const serialized = tasks.map((t: any) => ({
        id: t.id,

So sánh: các bề mặt khác trong repo CỐ Ý loại 3 cột frame* — src/actions/share-portal-actions.ts:225 «frameUsername / framePassword / frameNote are NOT selected.» và src/components/portal/calm/types.ts:32.
```

**Phán quyết của người bác bỏ** (mức gốc MEDIUM → **LOW**)

KHÔNG BÁC BỎ ĐƯỢC PHẦN SỰ KIỆN — tôi đã đi tìm gate ở tầng trên và không có gate nào. src/lib/task-detail-loader.ts:82-85 đúng là `findUnique({ where: { id: taskId }, include: TASK_INCLUDE })`, và `verifyWorkspaceAccess` ở :73-80 nằm trong try/catch chỉ đặt `isAdmin`, KHÔNG chặn luồng (catch → isAdmin=false rồi VẪN chạy tiếp xuống :82). src/app/[workspaceId]/layout.tsx chỉ chặn CLIENT (clientCheck === 'CLIENT' → redirect '/login') và không có bất kỳ vị từ assignee nào. src/lib/security.ts:131-140 xác nhận ProfileAccess role USER rơi vào nhánh `workspaceRole = 'MEMBER'`, tức actor model của cáo buộc là thật. Nguồn taskId cũng thật: src/actions/claim-actions.ts:104 `id: t.id` phát cho mọi MEMBER (take 50). Và src/components/tasks/TaskDetailRoute.tsx:1 là 'use client' nhận nguyên `task` → toàn bộ scalar (frameUsername/framePassword ở prisma/schema.prisma:356-357, notes_vi, resources, fileLink, wageVND) vào flight payload; src/lib/task-sanitize.ts:12 chỉ che 3 cột tiền. src/types/admin.ts KHÔNG khai báo frame* nhưng đó là hợp đồng TS, không cắt object runtime. Nên đường khai thác tồn tại — refuted=false.

HẠ MEDIUM → LOW vì ba điểm người tìm lỗi không cân:
(1) KHÔNG PHẢI LỖI DO BẢN VÁ, và cũng không phải mục bản vá nhận đóng. Mục 'Vá' của chính finding trong docs/security-audit/SWEEP_2026-07-30.md kê ĐÚNG ba việc: «đổi `client: { include: { parent: true } }` thành `client: { select: {...} }` tại dashboard/page.tsx:115, dashboard/tasks/page.tsx:36 và task-detail-loader.ts:29» — không có chữ nào yêu cầu vị từ sở hữu. Commit làm đủ 3/3. Câu 'diện rộng hơn' nằm ở mục ĐƯỜNG KHAI THÁC là mô tả BÁN KÍNH của rò hàng Client, và bản vá đã thu hẹp `client` ngay tại chính file đó (task-detail-loader.ts:41), tức phần rò-hàng-Client của 'vế còn lại' ĐÃ đóng. Cái còn lại là một gap tiền-tồn tại khác, không phải nửa bị bỏ dở của bản vá này.
(2) TƯ THẾ 'ĐỌC Ở MỨC MEMBER' LÀ CÓ CHỦ ĐÍCH VÀ CÓ GHI CHÉP trong chính sổ cái điều phối đợt vá. Finding P1-021 (SWEEP_2026-07-30.md, mục 'Vá') viết nguyên văn: «đặt chốt assignee-hoặc-admin CHỈ ở 3 đường GHI (…); giữ 2 đường ĐỌC (getRawFootageMap:146, getHookGraph:326) ở mức MEMBER như hiện tại», và mục ĐƯỜNG KHAI THÁC của nó còn coi «taskId … nhìn thấy trên board/URL /<workspaceId>/task/<taskId>» là chuyện bình thường của nhân sự nội bộ. Khuôn mã cũng khớp: src/actions/update-task-details.ts:64-66 chỉ chặn `currentTask.assigneeId !== callerId` ở đường GHI. Đây không đủ để bác bỏ (không có quyết định nào nói riêng về frame*), nhưng đủ để nói bản chất là 'đọc ngang trong cùng tenant giữa nhân sự đã xác thực', không phải một lỗ hổng bị bỏ quên.
(3) BÁN KÍNH BỊ CHẶN Ở HAI HƯỚNG QUAN TRỌNG mà cáo buộc không nói: src/lib/prisma-workspace.ts:141+163 chèn `workspaceId` VÀ `profileId` vào where của findUnique ⇒ KHÔNG có đường chéo-tenant; và doanh thu agency (jobPriceUSD/exchangeRate/profitVND) đã bị strip. Ngoài ra prisma/schema.prisma:358 ghi rõ frame* là 'tài khoản frame của TEAM' — credential dùng chung nội bộ, không phải bí mật cá nhân. Vì vậy: có thật, đáng ghi vào backlog kèm suggestedFix của người tìm lỗi (kèm cảnh báo assignedById), nhưng LOW chứ không MEDIUM.

**Vá đề xuất**

Thêm vị từ sở hữu vào chính chokepoint, không vá ở trang gọi: trong loadTaskDetail, sau khi đã có `isAdmin`, đổi thành `findFirst({ where: { id: taskId, ...(isAdmin ? {} : { assigneeId: userId }) } })` (giữ nguyên trả về `{ kind: 'notFound' }` để không tạo oracle phân biệt 'không tồn tại' vs 'không có quyền'). ⚠️ Trước khi làm phải xác nhận với chủ dự án hai luồng có thể bị chặn oan: (a) `assignedById` (Người quản lý) — người giao việc có cần mở chi tiết task mình giao không; (b) /mc/task/[taskId] đi qua buildMcTaskDrawerData nhưng caller đã admin-gate nên isAdmin=true, không ảnh hưởng. Nếu (a) cần thì dùng `OR: [{ assigneeId: userId }, { assignedById: userId }]`. Riêng frameUsername/framePassword nên thêm bước strip giống share-portal-actions.ts:225 cho mọi người xem không phải assignee, kể cả khi đã có vị từ trên.

---

## Phạm vi đã kiểm và thấy ĐÚNG

### `8dde6eb` — 3-high

ĐÃ KIỂM VÀ THẤY ĐÚNG:
(1) H1 chặn được đường khai thác nêu trong commit: resolveActiveProfileId (prisma-workspace.ts:65-103) chuyển sang workspace.profileId khi người gọi CÓ ProfileAccess ở đó, nên kịch bản 'tạo profile B + workspace W_B rồi mở CRM với claim A' nay lấy dữ liệu của B. Đã tự kiểm lối vòng 'workspace profileId=NULL': signup-actions.ts:275-282, google-auth.ts:223-225, workspace-actions.ts:73-79 đều gán profileId non-null; chỗ duy nhất còn `profileId ?? undefined` là createNextMonthWithRollover (workspace-actions.ts:503) nhưng nó CHỈ kế thừa null từ workspace nguồn, không tự sinh null mới ⇒ không tạo được workspace không-profile để helper rơi về claim.
(2) Lối vòng WorkspaceMember: lo ngại 'có membership trên W_B mà không có ProfileAccess trên B ⇒ helper giữ claim A' KHÔNG mở được bằng self-service — member-actions.ts:836-855 luôn upsert ProfileAccess kèm WorkspaceMember khi accept lời mời, workspace-membership.ts:104-108 cũng vậy.
(3) permanentlyDeleteClient: deleteMany NẰM trong danh sách chèn phạm vi (prisma-workspace.ts:138) nên profileId vẫn được chèn — khẳng định của commit đúng; cascade con/Project do FK ở DB nên delete→deleteMany không đổi hành vi.
(4) H2 sink: đã grep toàn bộ dangerouslySetInnerHTML trong src/**/*.tsx — chỉ còn 6 chỗ, và 5 chỗ render notes đều đã lọc (TaskDetailModal:762 và TaskDetailMobile:456 dùng DOMPurify.sanitize, TaskDrawer:200 dùng ensureExternalLinks, TaskCommentThread:263 dùng renderCommentMarkdown). Không còn sink thô nào khác cho notes_vi.
(5) H2 nguồn: isWorkspaceAdmin được tính ở task-actions.ts:69 TRƯỚC chỗ dùng ở dòng 167 — không phải TDZ/undefined. update-task-details.ts:50-71 xác nhận notes_vi thật sự là cột chỉ-admin (nhánh non-admin chỉ cho productLink + notes_en).
(6) Bản vá H2 KHÔNG chặn nhầm luồng đang chạy: đã grep mọi call site updateTaskStatus — 13 chỗ, tất cả truyền undefined ở vị trí newNotes. DesktopTaskTable.tsx:135 có forward biến `notes`, nhưng cả 4 caller của handleStatusChange (dòng 242, 427, 459, 478, 598) đều không truyền tham số đó ⇒ không có đường ghi hợp lệ nào bị mất âm thầm.
(7) ensureExternalLinks (lib/utils.ts:51-65) chỉ đổi chú thích, thân hàm y nguyên; hai call site đều là 'use client' và giá trị SSR ban đầu của form.notes là chuỗi rỗng nên nhánh fail-closed `typeof window === 'undefined' → ''` không gây lệch hydrate.
(8) H3 không gây hồi quy giao diện: grep toàn repo cho thấy getWorkspacesForProfile KHÔNG có call site nào trong src/** (chỉ xuất hiện trong docs), nên nhánh gác mới không thể làm trống trình chuyển workspace; nhánh legacy User.profileId là phòng xa hợp lý.
(9) Không có truy vấn tuần tự nào bị thêm vào trong $transaction bởi commit này (resolveActiveProfileId luôn chạy TRƯỚC withClientNameLock) ⇒ không tạo thêm rủi ro P2028.

### `95be7eb` — tien-luong

ĐÃ KIỂM VÀ THẤY ĐÚNG:
· Cạm bẫy timeout `$transaction` (mục 7 trong danh sách): commit 95be7eb ĐÚNG LÀ đặt N `tx.task.findUnique` tuần tự bên trong `prisma.$transaction` (bulk-task-actions.ts), và `src/lib/db.ts:18-25` không set `transactionOptions` ⇒ mặc định 5s/2s. NHƯNG commit sau trên cùng nhánh (b581e3a, "tự sửa lỗi bản vá tiền") đã nạp trước `moneyRows` bằng MỘT `findMany` ngoài transaction (bulk-task-actions.ts:312-321) — ở HEAD đã sạch, nên tôi không báo là phát hiện mở.
· `prisma.workspace/payrollLock/payroll` trong payroll-lock.ts: dùng `prisma` toàn cục nhưng MỌI where đều ghi `workspaceId` tường minh; hai nơi gọi (`update-task-details.ts:30-35`, `bulk-task-actions.ts:259`) đều đã qua `verifyWorkspaceAccess` trước. Không có rò tenant ở đây.
· Bẫy `undefined` trong where của Prisma: `payment-actions.ts:65` khai báo `let linkedInvoiceId: string | null = null` (KHÔNG phải undefined) ⇒ `invoiceId: null` dịch thành `IS NULL` đúng ý, không bị bỏ điều kiện.
· Cổng OWNER mới của `revertMonthlyBonus`: `verifyWorkspaceAccess` (security.ts:103-105) đã ánh xạ `profileAccess.role === 'OWNER'` thành `workspaceRole = 'OWNER'`, và `isGlobalAdmin` là hằng false (deprecated) ⇒ vị ngữ kép KHÔNG đá oan OWNER hợp lệ nào. Ba lệnh xoá + auditLog nằm chung một `$transaction` dưới advisory lock theo kỳ — đúng khuôn `calculateMonthlyBonus` (bonus-actions.ts:393) và `voidInvoice`.
· `getPayrollLockStatus` đặt `verifyWorkspaceAccess` TRONG `try` với `catch → { isLocked:false }` — tôi đã kiểm nơi tiêu thụ (BonusCalculator) và giá trị false chỉ làm HIỆN nút, không mở đường ghi nào; đường ghi thật vẫn tự gác. Chấp nhận được.
· Trần 10 workspace / 5 profile: cả hai nay RE-COUNT bên trong transaction sau `pg_advisory_xact_lock` theo user, và ném lỗi có mã riêng được bắt lại thành thông báo tiếng Việt (không nuốt nhầm lỗi khác). Đổi bộ đếm profile sang `role: 'OWNER'` là NỚI trần, không siết — không đá người dùng hợp lệ ra.
· `bulkUpdateTaskDetails`: đồng bộ `wageVND = newValue` và `profitVND = jobPriceUSD*rate - value` khớp CHÍNH XÁC đường một-task (update-task-details.ts:88-97), kể cả fallback `exchangeRate || 26300`. Không lệch công thức.
· `checkPayrollCycleClosed` hỏi CẢ HAI cờ (isLocked HOẶC Payroll PAID) đúng như mô tả; `payrollClosedMessage` phân biệt hai lý do.
· Đính chính chú thích trong `invoice-actions.ts` về lớp chèn tenancy: tôi đã đọc `prisma-workspace.ts` — `$extends({ query: { $allModels: { $allOperations } } })` áp cho mọi client dẫn xuất kể cả `tx` trong interactive transaction; chú thích MỚI (nói lớp chèn CÓ chạy) là đúng, chú thích CŨ là sai.
· Advisory lock cho nhánh trừ `depositBalance` (invoice-actions.ts:466) dùng đúng khuôn `voidInvoice` cùng file; commit tự khai nhánh này hiện bất động — tôi grep toàn repo, xác nhận không dòng nào TĂNG `client.depositBalance`.

CHƯA PHỦ: các thay đổi không thuộc commit này; toàn bộ src/app/[workspaceId]/mc/** và src/components/mission-control/** (đóng băng theo yêu cầu); không chạy được DB thật nên mọi phát hiện dựa trên đọc mã.

### `38550a8` — ma-chet

ĐÃ KIỂM VÀ THẤY ĐÚNG (không có phát hiện):

1) Không có tham chiếu treo cho MỌI thứ bị xoá. `git grep` toàn repo (kể cả mcp-server/, scripts/, prisma/) cho: trackEvent, createTaskViaToken, CreateTaskPanel, contact-actions, searchContacts/sendContactRequest/respondToContactRequest/getContactRequests/getContacts/getBlockedContacts/unblockContact/blockContact, webhooks/calendar → 0 tham chiếu mã chạy; chỉ còn hit trong chú thích của chính commit và trong docs/ (sổ kiểm toán, không phải mã).

2) Webhook lịch — KHÔNG có nhà cung cấp ngoài nào bị gãy. Không nơi nào trong repo đăng ký watch channel/subscription: `src/lib/calendar-sync.ts:53 subscribeToCalendarWebhooks` chỉ `console.log('[Scaffold] ...')`, và bản thân calendar-sync.ts hoàn toàn mồ côi (0 nơi import cả 3 export). Không chuỗi '/api/webhooks/calendar' nào trong src/, vercel.json, next.config.ts, .env.example, middleware.ts. Route bị xoá là stub thuần (chỉ phản chiếu validationToken + console.log, khối ghi DB đang comment).

3) CreateTaskPanel thật sự mồ côi. `src/components/portal/calm/PortalApp.tsx` chỉ import CreateRequestWizard (:13) và CreateSubClientPanel (:14) — luồng v2. Tại commit cha, grep 'CreateTaskPanel' chỉ khớp chính file đó + 1 chú thích. Không nút/menu nào trỏ tới nó.

4) Hai lời khẳng định \"KHÔNG chết, giữ lại\" của commit đều ĐÚNG (tự kiểm, không tin mô tả): `EventLogTable.tsx:10` import và `:63` gọi `forceFlush`; `SharePortalClient.tsx:21,54` gọi `getSubmitOptionsViaToken`. Nếu tin bản kế hoạch mà dọn theo thì đã gãy thật.

5) share-portal-actions.ts giảm 112 dòng là XOÁ THUẦN, không viết lại. Diff chỉ gồm: bỏ trọn thân `createTaskViaToken` + thay bằng khối chú thích. `getSubmitOptionsViaToken` (:1219-1242), `submitClientRequestViaToken` (:1346), `createSubClientViaToken` (:1473) không bị đụng một dòng logic nào.

6) tracking-actions.ts đổi 48 dòng cũng là XOÁ THUẦN. `eventBuffer`/`flushEvents`/`forceFlush` giữ nguyên byte. Xác nhận cơ chế: `prisma.event.createMany` (:47) là nơi ghi Event DUY NHẤT toàn repo, chỉ nhận dữ liệu từ `eventBuffer`, mà nơi push duy nhất là `trackEvent` → sau khi xoá, `forceFlush` là no-op thật (flushEvents:35 return sớm khi buffer rỗng), không DoS, không lộ dữ liệu. Bảng Event rỗng từ trước (commit b35eb48 đã gỡ các nơi gọi trackEvent ở UI) ⇒ KHÔNG phải hồi quy do commit này. Import còn lại (`cookies`, `headers`, `getRequestIpOrNull`, `getSession`) đều còn dùng ở `pingHeartbeat`.

7) sanitize.ts: LOGIC KHÔNG YẾU ĐI. Diff chỉ chạm chú thích; `stripControlChars`, vòng lặp `s.replace(/<[^>]*>?/g,'')` tới khi ổn định, `.trim().slice(0,maxLen)` và cả hai giá trị hằng (200 / 2000) y nguyên. Không có XSS mới.

8) impersonation-actions.ts: đúng 1 dòng chú thích, không đụng `sessionProfileId: currentProfileId` hay bất kỳ nhánh điều kiện nào.

9) Xoá contact-actions.ts không mồ côi một gate nào: `prisma.contact` nay có 0 nơi đọc/ghi toàn repo, nên không có luồng nào còn tin vào trạng thái ACCEPTED/BLOCKED để cho/chặn quyền. Model Contact còn trong schema (:1279) với onDelete: Cascade — dữ liệu cũ nếu có sẽ nằm im, không ảnh hưởng phân quyền.

10) Không có lỗi kiểu-Prisma nào phát sinh: bản vá không thêm/sửa bất kỳ `where`, `select`, `include` hay `$transaction` nào (thuần xoá), nên các bẫy `undefined` trong where / extension không scope quan hệ lồng / `?? 0` che select thiếu / P2028 đều không áp dụng.

11) tsconfig.json KHÔNG bật `noUnusedLocals`/`noUnusedParameters` ⇒ hằng và hàm mồ côi còn lại (`TrackingEventPayload` ở tracking-actions.ts:9, trường tuỳ chọn `createTask?` ở portal/calm/types.ts:229, `notifyProfileAdmins`) không làm gãy tsc/build — tuyên bố \"tsc xanh, build exit 0\" của commit là hợp lý.

12) Không có regression \"404 hàng loạt\"/khoá nhầm người dùng: chỉ đúng một đường dẫn biến mất (/api/webhooks/calendar), middleware.ts không có nhánh đặc biệt nào cho webhook nên không có allowlist treo.

### `b62ed3d` — phien-env

ĐÃ KIỂM VÀ THẤY ĐÚNG:

1. ⚠️ NGHI VẤN SỐ MỘT (authAt có thật sự được ghi vào JWT không) — ĐÃ LOẠI TRỪ, KHÔNG PHẢI LỖI. `authAt: Date.now()` được set thật ở cả hai hàm ký phiên: src/lib/auth.ts:22 (`login`) và :40 (`loginWithProfile`). Grep toàn repo cho `encrypt(` chỉ ra 4 điểm ký: auth.ts:22/38 (có authAt), auth.ts:133/138 (đóng vai), middleware.ts:182 (chép nguyên `user`), profile/select:89 (spread `...session.user`). Mọi cổng đăng nhập thật đều đi qua login/loginWithProfile: auth-actions.ts:382,386 và api/auth/google/callback:94,98 — không còn đường nào khác (grep `set('session'` + `Set-Cookie` toàn src). ⇒ Phiên đăng nhập mới KHÔNG bị `?? 0`, không có kịch bản đăng xuất cứng toàn hệ thống.

2. authAt SỐNG SÓT qua hai đường ký lại: middleware.ts:183 truyền `user: sessionPayload.user` nguyên vẹn; profile/select:77-80 spread `...session.user`. Không nơi nào làm rụng claim.

3. Đóng vai — đúng như commit mô tả: impersonation-actions.ts:100 gọi `createImpersonationSession(session.user, ...)` nên `admin_session` mang authAt của lần đăng nhập thật; phiên đóng vai bị loại khỏi vòng gia hạn bởi `!sessionPayload.user.isImpersonating` (middleware.ts:167). Sau khi thoát đóng vai, msLeft nhỏ ⇒ middleware gia hạn lại bằng authAt gốc.

4. env.ts — KHÔNG có biến nào TRỞ THÀNH BẮT BUỘC. Cả ba khoá trong schema đều `.default()` (env.ts:6-8), nên biến THIẾU vẫn parse được; throw chỉ nổ khi biến CÓ MẶT nhưng SAI (chuỗi rỗng / JWT_SECRET <10 ký tự / NODE_ENV ngoài enum). `next build` an toàn vì thiếu biến ⇒ lấy default ⇒ parse thành công; chốt JWT_SECRET vẫn có miễn trừ IS_BUILD_PHASE (:60-61). Việc cố ý KHÔNG miễn build cho parse-throw có ghi rõ trong chú thích. Không phát hiện đường nào làm sập một hệ thống đang chạy đúng cấu hình.

5. safeNextPath — CHẠY THẬT hàng rào `npx tsx scripts/assert-safe-next-path.ts` → `OK 31/31`, exit 0; con số 31/31 trong commit khớp (27 ca + 4 chuỗi được cho qua ở hậu kiểm). Tự thử thêm các dạng vượt rào ngoài bảng ca: `/%09/evil.com` (không decode ⇒ thành path thường), `/%5C%5Cevil.com`, `/ /evil.com` (space 0x20 giữ lại nhưng WHATWG chỉ bỏ space ở HAI ĐẦU, giữa path bị percent-encode ⇒ vẫn về miền ta), fullwidth solidus `/／ evil.com` và `＼` (không phải ký tự phân tách của WHATWG), cặp surrogate (vòng `for..of` lặp theo code point, `path += ch` nối đủ 2 đơn vị ⇒ không cắt đôi). Chuẩn-hoá-trước-khi-so-khớp còn đóng luôn chiều ngược: `/a<NUL>pi/cron` sau khi lọc thành `/api/cron` ⇒ bị chặn. Chỉ có MỘT consumer của `?next=`: login/page.tsx:25,41 → auth-actions.ts:178, nên không có đường vòng chưa vá.

6. Bốn route OAuth + workspace/first — chốt CHẶN THẬT, không hình thức: `isSessionLive` (profile-permissions.ts:46-56) đọc DB thật, từ chối `role === 'LOCKED'` và `token.sessionVersion < db.sessionVersion`. Vị trí đặt đúng: cả hai callback gọi nó TRƯỚC bước đổi code lấy token và TRƯỚC `integrationToken.upsert` (dropbox/callback:71-74 trước :83; google-drive/callback:69-72 trước :79). Đã kiểm consumer của IntegrationToken — mọi truy vấn đều khoá theo userId (integration-actions.ts:43,80; scan-folder:151-158; settings/page.tsx:54) nên không có đường đọc chéo.

7. scan-folder: chốt mới (route.ts:72-78) TRÙNG LẶP với `verifyWorkspaceAccess(workspaceId,'MEMBER')` ngay sau đó (security.ts:63-81 đã kiểm y hệt LOCKED + sessionVersion). Tốn thêm một `prisma.user.findUnique` mỗi lần gọi — vô hại trên endpoint maxDuration 300s, không báo thành finding.

8. Rate-limit login fail-closed (P1-043): tầng dưới `noLimiterResult()` vốn đã trả `success:false` ở production khi thiếu UPSTASH_*, nên nhánh `catch` mới chỉ phủ trường hợp NÉM lỗi (sự cố mạng) — nhất quán, không tạo đường chặn mới nào ngoài ý muốn. Hệ quả 'Upstash sập ⇒ toàn bộ login trả 429' là đánh đổi có chủ ý đã ghi trong commit. (Ghi nhận nhỏ, không đủ thành finding: nhánh catch mới không gọi `logLoginAttempt`, nên một sự cố Upstash không để lại dấu vết nào trong bảng LoginAttempt.)

9. INNGEST_DEV: đổi sang danh sách cho phép ['', 'false', '0'] sau `.trim().toLowerCase()`. Không tìm thấy nơi nào trong repo đặt INNGEST_DEV, nên không có luồng đang chạy bị chặn nhầm.

10. Prisma/`undefined`-trong-where, extension không scope quan hệ lồng, `?? 0` che select thiếu trường, truy vấn tuần tự trong $transaction: KHÔNG áp dụng — commit này không thêm truy vấn Prisma nào ngoài `isSessionLive` (findUnique theo khoá chính, không có include lồng, không nằm trong transaction).

### `1c00055` — cong-khach

ĐÃ KIỂM VÀ THẤY ĐÚNG:\n\n1. P1-025 (nhánh bỏ-qua-PIN) — vá kín, tôi đã thử tìm đường vòng và không thấy. Đường vòng rõ nhất là \"verify PIN thật cho email của mình rồi POST /identity force:true đổi email phiên sang victim mà giữ emailVerifiedAt\": KHÔNG chạy được, vì share-auth.ts:172-187 `createGuestSession` luôn INSERT hàng GuestSession MỚI (emailVerifiedAt để trống), route /identity không update hàng cũ. `stampsSession` (guest-subscribe.ts:210) vẫn đòi `!guest.emailVerifiedAt && normEmail(guest.email) === email` + PIN đúng. `!isSyntheticGuestEmail` chặn đúng danh tính tổng hợp @review.invalid do createLinkClientGuestSession cấp (share-auth.ts:321-322). Xoá `verifiedAt: { not: undefined }` là đúng (Prisma bỏ qua điều kiện undefined) và không đổi tập kết quả.\n\n2. Khoá theo NGƯỜI, không theo LINK — đã soi TỪNG key mới: `portal-req-ip:{ip}`, `portal-subclient-ip:{ip}`, `portal-comment-ip:{ip}`, `portal-react-ip:{ip}`, `portal-comment-mgr:{assignedById}`, `portal-req-profile:{profileId}`, `zip:{userId}:{workspaceId}`, `attach-init:{userId}`, `client-error:{ip}`. KHÔNG key nào chứa slug/token/shareLinkId. (Vấn đề còn lại là bán kính của tầng người nhận — R5-3 — và ba chốt CŨ ở file khác — R5-4.)\n\n3. Giả mạo IP — `getRequestIp` (share-link-auth.ts:53-66) và `getClientIp` (rate-limit-db.ts:66-77) đều ưu tiên x-real-ip, rồi x-vercel-forwarded-for, và chỉ lấy phần tử PHẢI CÙNG của x-forwarded-for. Xoay header trái không mở được xô mới ⇒ các tầng IP mới không phải chốt giả. Bỏ qua khi ip==='unknown' là đúng (tránh gộp mọi khách vào một xô bền).\n\n4. Bảng RateLimitBucket — có trong prisma/schema.prisma:2052; repo dùng `db push` (chỉ 5 migration cho hàng trăm model) và bảng này ĐANG gánh các route khách đang chạy (`r:unlock`, `r:notif:*`, `share-token-ip`, `share-zip`). Nếu thiếu bảng thì prod đã hỏng từ trước chứ không phải do commit này. Rủi ro thật của 8 chốt failClosed mới là sự cố tạm thời của DB — đã báo ở R5-6.\n\n5. download-zip nhánh cộng dồn — cả HAI nhánh đều có: asset (`currentVersion.sizeBytes` đã được thêm vào select :86, cộng ở :126) và folder (`sizeBytes` thêm vào select :139, map ở :142, cộng ở :154). Không còn nhánh nào cộng 0 do select thiếu. Kiểm tra trần đặt TRƯỚC `entries.push` ở cả hai nhánh; `MAX_ZIP_FILES` break vẫn nguyên vẹn. `collectZipFiles` chỉ có ĐÚNG MỘT nơi gọi (route.ts:49) ⇒ không có đường vòng bỏ qua chốt. (Vấn đề là con số được cộng — R5-2 — và đại lượng được chọn — R5-1.)\n\n6. initiateAttachment — grep toàn repo: chỉ một nơi gọi (src/app/api/review/comment-attachments/initiate/route.ts:15). Đường KHÁCH tương đương đi qua `initiateGuestAttachment` và ĐÃ có chốt riêng (r:attach-init:{slug}:{ip}, 10/60) ⇒ không có bề mặt khách nào lọt qua vì vá ở nơi gọi. Ngưỡng 10/phút theo userId hợp lý với luồng đính kèm ảnh bình luận.\n\n7. /api/notifications/unsubscribe — GET nay CHỈ đọc: `verifyUnsubscribeToken` chạy trước khi render, ghi DB chỉ nằm trong POST (:136-148). Token nhúng vào form bằng `encodeURIComponent` nên không chèn được thuộc tính/HTML. middleware.ts bỏ qua toàn bộ `/api` ⇒ POST tới được, không bị đá về /login. Hình dạng khớp hai route unsubscribe đã có sẵn trong repo (/api/r/unsubscribe, /api/portal-notify/unsubscribe) — quyết định KHÔNG redirect sang trang mới là đúng, `src/app/notifications/unsubscribe` thật sự không tồn tại. Không thấy nơi nào còn trông chờ GET-mutate.\n\n8. request-pin / guest-subscribe — không tìm thấy đường enumerate MỚI do bản vá tạo ra: route vẫn trả duy nhất `apiJson({ status: 'pin_sent' })` cho mọi nhánh (:43, :68, :79), bốn tầng limit đều fail-OPEN nên không tạo khác biệt status, và nhánh gửi PIN là `void sendEmail(...).catch(...)` nên lỗi Resend không đổi thời gian/thân phản hồi. Ngược lại bản vá làm ÍT rẽ nhánh hơn (nhánh bỏ-qua-PIN gần như không còn vào được) ⇒ oracle định thời hẹp lại chứ không rộng ra.\n\n9. log-client-error — chốt chạy TRƯỚC `req.json()`; cố ý fail-open (không failClosed) đúng như mô tả; bỏ qua 'unknown'; trả 204 nên client không retry. `JSON.stringify` vẫn thoát ký tự xuống dòng nên câu \"log-injection\" trong chú thích là mô tả rủi ro cũ, không phải lỗ đang mở.\n\n10. postCommentViaToken — chú thích \"1 email THẬT tới Manager\" đã kiểm là ĐÚNG (createNotificationInternal → maybeSendNotificationEmail, notification-actions.ts:66). Khi `assignedById` là null thì không có tầng người nhận, nhưng cũng KHÔNG có notification/email nào được gửi ⇒ không phải lỗ. Thứ tự tầng IP trước `findScopedTask` đúng như mô tả.\n\n11. Grep xác nhận `rateLimit(` in-memory đã hết sạch trong share-portal-actions.ts (import đã gỡ, thay bằng chú thích :35-37).

### `b581e3a` — phan-quyen-action

Phạm vi đã phủ (đọc file đầy đủ ở trạng thái HEAD, không chỉ diff; đã bỏ qua mc/** và components/mission-control/**):

1) raw-footage-actions.ts — liệt kê ĐỦ 5 export: getRawFootageMap, setRawFootageDisplayType, saveRawFootageMap, getHookGraph, saveHookGraph. Cả 3 đường ghi đều gọi assertCanWriteRawFootage NGAY sau loadTaskOrFail và trước mọi upsert (dòng 211, 263, 400) — đúng như commit tự kiểm; không lọt vào 2 đường đọc. `export interface SaveRawFootageMapArgs` là type-only nên không sinh POST endpoint.

2) ĐIỂM NGHẼN, không phải nơi gọi: grep `taskRawFootage` / `manualGraph` / `veloxMap` toàn src → CHỈ raw-footage-actions.ts chạm bảng này (6 chỗ). Không có đường vòng nested-create qua Task. Chốt nằm đúng chỗ nghẽn.

3) Đường tạo task vẫn chạy: DashboardActionWrapper:85 và :391 gọi saveHookGraph sau createTask/createBatchTasks, mà cả hai đều đòi verifyWorkspaceAccess(...,'ADMIN') (admin-actions.ts:90, bulk-task-actions.ts:68) ⇒ người gọi luôn là workspace ADMIN/OWNER ⇒ chốt mới KHÔNG chặn luồng tạo task. Lỗi lưu map được xử lý bằng toast (không nuốt im lặng).

4) UI xử lý đúng giá trị trả về mới: TaskDetailModal:138 và TaskDetailMobile đều `if ('error' in res) toast.error(...)`, không hiển thị "đã lưu" giả.

5) push-actions.ts — kiểm KHOÁ THẬT trong prisma/schema.prisma:253-264: `endpoint String @unique`, `@@index([userId])`. Upsert theo endpoint là hợp lệ, không thể tạo hai hàng cho cùng endpoint. `deletePushSubscription` vẫn scope `{ endpoint, userId }` nên không gỡ được của người khác. `audit()` nhận workspaceId nullable (AuditLog.workspaceId String?) và `action` là cột String (không phải enum Postgres) ⇒ thêm mã vào AuditAction KHÔNG cần migration, không có nguy cơ P2021/insert lỗi. `previousOwner` đọc có `.catch(() => null)` nên đọc hỏng không chặn đăng ký.

6) leaderboard-actions.ts — chỉ 1 export. Gate mới đóng đúng lỗ hổng KHÔNG-CẦN-ĐĂNG-NHẬP: `getSession()` không chạm DB nên khách vô danh bị trả về ngay, không tạo thêm truy vấn ⇒ không thành DoS mới. `isSessionLive` (profile-permissions.ts:46-56) chặn LOCKED + sessionVersion cũ, đúng khuôn push-actions. Không rò dữ liệu chéo: `unstable_cache` trong Leaderboard.tsx:10-125 nhận (workspaceId, profileId) làm THAM SỐ nên khoá cache đã tách theo tenant — chỉ TAG là toàn cục, đúng như commit tự ghi nợ; `getWorkspacePrisma(workspaceId, profileId)` vẫn scope truy vấn. RefreshLeaderboardButton chỉ hiện với isWorkspaceAdmin và xử lý nhánh lỗi.

7) bulk-task-actions.ts (mục 0 của commit) — hoist findMany là ĐÚNG: `where: { id: { in: taskIds }, workspaceId }` giữ nguyên phạm vi cũ, select đủ 5 trường mà vòng lặp dùng (không có `?? 0` che select thiếu), `resolvePayrollCycle` không bao giờ trả null nên nhánh `touchesMoney && cycle` không tự tắt. Đã đối chiếu src/lib/db.ts: KHÔNG có transactionOptions và KHÔNG có client extension nào ⇒ mặc định 5s vẫn đúng, và không có chuyện extension bỏ scope quan hệ lồng. Ghi chú: trong transaction VẪN còn tối đa 2 findUnique/task (dòng 351, 362) + 1 update/task; tôi KHÔNG báo thành phát hiện vì đường UI thật giới hạn lô nhỏ (NewDesktopTaskTable PER_PAGE = 8, chọn theo trang) và MCP bulk_update_details không gọi action này mà chạy service riêng (mcp-server/src/tools/bulk-ops.ts:20, trần 50) — chưa dựng được kịch bản P2028 cụ thể.

8) Kiểm lại HAI mục commit tuyên bố "không cần vá" thay vì tin lời: (a) availability-actions — ba hàm self-serve đều gọi getCurrentUser, và auth-guard.ts:40-46 THẬT SỰ chặn role==='LOCKED' và so sánh sessionVersion token vs DB; ensureWorkspaceAccess đã bỏ nhánh global-ADMIN (dòng 22-26). Tuyên bố ĐÚNG. (b) task-actions notes_vi — không đọc lại vì thuộc commit khác, nhưng không phát hiện đường ghi notes nào trong 4 file của commit này.

9) Mọi export trong 4 file 'use server' đều có cổng riêng (không dựa cổng route): bulk-task-actions có 6 export, tất cả mở đầu bằng verifyWorkspaceAccess(workspaceId,'ADMIN'); push-actions getVapidPublicKey chỉ trả khoá công khai VAPID (đúng bản chất public).

### `d5aaef1` — mcp-cron

CRON — Kiểm tay 7/7 route trong src/app/api/cron/*: cả 7 đều `import { safeEqual } from '@/lib/cron-auth'` và dùng `if (!safeEqual(key, secret))`; 0 route còn `key !== secret`. KHÔNG route nào đọc khoá từ query string (chỉ header x-cron-secret / x-cron-key / Authorization Bearer) — `readCronKey` cũng không đọc query string. `safeEqual` chặn null/undefined và so độ dài TRƯỚC nên `timingSafeEqual` không thể throw thành 500. `import 'server-only'` an toàn (Next tự alias; payroll-lock.ts đã làm y vậy). Không có route nào ngoài /api/cron dùng CRON_SECRET (chỉ scripts/probe). vercel.json khai 7 cron khớp 7 route.

VERSION / OPTIMISTIC LOCK — Liệt kê BẰNG GREP toàn bộ đường ghi Task trong mcp-server (`task.update|updateMany|create|delete`): 7 đường. 5 đường được vá đúng (assign-service:60 assignTask, :144 unassignTask, :244 bulkAssign, marketplace-service:244 returnTask, task-service:348 updateTaskDetails); 2 đường ĐÃ có sẵn từ trước (marketplace-service:173 claimTask, status-service:79 updateTaskStatus). Không còn đường ghi Task nào thiếu increment. Nhận định của commit rằng sổ đếm thiếu return_task là ĐÚNG. Việc không thêm `where { version }` ở MCP là quyết định đúng (MCP không giữ version của client). Không thấy đường web nào bị chặn oan vì increment thêm.

THẺ ĐỎ — Vị ngữ `assertNotRedCarded` (guards.ts:42-54) scope ĐÚNG theo workspace: `where { userId, workspaceId: wsId }`; MonthlyRank có `@@unique([userId, month, year, workspaceId])` (schema.prisma:1073) nên không có 2 bản ghi cùng tháng cùng workspace, và `orderBy createdAt desc take 1` khớp từng chữ với web (task-management-actions.ts:204-207, bulk-task-actions.ts:794-797). Không có đường lấy nhầm rank của workspace khác. Web `claimTask` (claim-actions.ts:128-199) quả thật KHÔNG chặn Rank D — nửa lập luận đó của commit đúng (nửa còn lại sai, xem R7-1).

CHỐT KỲ LƯƠNG (bản chép) — So từng dòng `mcp-server/src/services/payroll-cycle.ts` với `src/lib/payroll-cycle.ts` + `src/lib/payroll-lock.ts`: regex `(\d{1,2})\s*\/\s*(\d{4})`, chặn tháng 1-12 / năm 2020-2099, fallback về tháng hiện tại — GIỐNG HỆT. Điều kiện đóng (PayrollLock.isLocked HOẶC Payroll status 'PAID' của đúng assignee) giống `checkPayrollCycleClosed`. Khoá composite `month_year_workspaceId` tồn tại thật (schema.prisma:491). `ws.name` thật sự được `validateWorkspaceAccess` select (auth-context.ts:49) nên không có truy vấn thừa và không có `undefined` lọt vào. Chốt đặt ĐÚNG trong nhánh tiền và dùng `currentTask.assigneeId` — khớp update-task-details.ts:83. KHÔNG tìm thấy chỗ nào bản chép fail-open trong khi web fail-closed. Xác nhận đã TRÁNH được bẫy lệch khoá theo `task.createdAt` như commit nói.

TRẦN LÔ 50 — bulk_update_details/bulk_update_status đã `.max(50)` ở Zod (bulk-ops.ts:20, :71). Không có đường lách: `bulk_assign_tasks` tuy không có `.max()` ở Zod nhưng assign-service.ts:197-199 ném ở >50 sau đúng 3 truy vấn, không thành DoS. Mỗi phần tử của bulk chạy `$transaction` RIÊNG nên không dính rủi ro P2028/timeout 5s mặc định của src/lib/db.ts cho cả lô. `update_task_details` KHÔNG được đăng ký làm tool (index.ts + tools/*), nên cửa duy nhất tới `updateTaskDetails` là bulk_update_details — đã bị chặn trần.

KHÁC — mcp-server/dist nằm trong .gitignore:50 nên không có artifact build cũ bị commit đè. Web `updateTaskStatus`/`assignTask` cũng không có chốt kỳ lương, nên việc MCP không gác `update_task_status` là parity chứ không phải bỏ sót. Không thấy `as any` thu hẹp select, không thấy `?? 0` che select thiếu trường, không thấy `undefined` lọt vào `where` do bản vá này. Đã bỏ qua hoàn toàn src/app/[workspaceId]/mc/** và src/components/mission-control/**.

### `83b0aea` — ro-du-lieu-ha-tang

ĐÃ KIỂM VÀ THẤY ĐÚNG:

1) ⚠️ MỤC SỐ MỘT — thu hẹp select `client` (3 chỗ): SẠCH. Tôi grep RUNTIME chứ không tin type. Đi hết mọi vị trí đọc `X.client` trong src/ (~55 chỗ) rồi soi từng consumer của đúng 3 truy vấn đã sửa. Tất cả chỉ đọc `name`, `parent?.name`, `id`: formatClientHierarchy (src/lib/client-hierarchy.ts:24-29 — kiểu ClientNode chỉ có name + parent.name), UserWorkflowTabs.tsx:190-191/448, TasksDataTable.tsx:72-77, TitleCell.tsx:14, MobileTaskCard.tsx:56, mobile/TaskDrawer.tsx:92, DesktopTaskTable.tsx:327-333, NewDesktopTaskTable.tsx:111-112/503, mc-task-drawer-data.ts:83. Grep riêng cho `client?.(tier|depositBalance|aiScore|frictionIndex|paymentRating|inputQuality|email|phone|status|...)` chỉ ra CRM (ClientAnalytics.tsx:74-94, MobileClientDetail.tsx:69-111, ClientsManagerPanel.tsx:286) — nhưng ba chỗ đó ăn dữ liệu từ getClientDetail (crm-actions.ts:693) chứ KHÔNG phải từ task, nên không dính. TaskDetailModal.tsx / TaskDetailMobile.tsx không đọc `client` một lần nào. Không có truy cập động obj['...'] hay spread `...task.client`. Cũng kiểm `client.parent.id` (đã mất vì parent chỉ select name) — không consumer nào đọc. ⇒ Không có runtime-undefined dù `as any` che mất tsc.

2) Bản vá có bỏ sót chỗ nào cùng dạng không: `client: { include: { parent: true } }` còn ở admin/page.tsx:83 và admin/queue/page.tsx:50 — tôi KIỂM CỔNG chứ không tin mô tả: src/app/[workspaceId]/admin/layout.tsx gác bằng deriveNavAccess → `if (!navAccess.admin) redirect(dashboard)`, nên hai chỗ đó chỉ tới tay admin, đúng như commit nói. 6 chỗ còn lại nằm trong /mc/** (vùng đóng băng, ngoài phạm vi).

3) Prisma client extension: đọc src/lib/prisma-workspace.ts:110-220 — extension chỉ chèn vào `where`/`data` TẦNG ĐẦU, không đụng include lồng, nên đổi `include`→`select` ở quan hệ `client` không làm mất/đổi injection nào. Guard fail-closed cho model Client (:128-135) vẫn nguyên.

4) middleware — vòng lặp redirect: KHÔNG có. Tôi liệt kê toàn bộ 69 route ngoài /api trong src/app và đối chiếu từng cái với PROTECTED_SEG. Không route công khai nào bị tóm nhầm. Nhánh token hỏng (:130-143) cũng an toàn: /login không khớp regex ⇒ đi nhánh `next()`, và src/app/login/page.tsx là client component KHÔNG redirect người đã-có-cookie, nên không tạo cặp bật qua bật lại. Nhánh transient (giữ cookie) → /login vẫn render được. Hai nhánh cổng dùng CÙNG một hằng regex nên không lệch nhau. Regex không có cờ `g` ⇒ .test() không dính bẫy lastIndex.

5) middleware — vị từ thứ ba cố ý để nguyên (:116-117): tôi kiểm lời biện minh thay vì tin chú thích. src/app/[workspaceId]/layout.tsx:31-49 đúng là đã backfill profileId từ ProfileAccess đầu tiên và chỉ redirect /login khi thực sự không có ProfileAccess nào. Middleware chạy Edge không có DB ⇒ lập luận «làm nó khớp thật sẽ đá phiên legacy» là ĐÚNG. Để nguyên là quyết định hợp lý.

6) Lời khẳng định «MỘT MỤC HOÁ RA ĐÃ VÁ: getClientDetail projects»: XÁC NHẬN THẬT — src/actions/crm-actions.ts:709 có `projects: { where: { workspaceId } }`, và ba quan hệ lồng còn lại (subsidiaries/tasks/invoices) cũng đã lọc workspaceId.

7) HSTS (next.config.ts:117-118): `max-age=63072000; includeSubDomains`, KHÔNG có `preload` — đúng như mô tả. Áp qua rule `source: '/(.*)'`, và rule `/r/:path*` chỉ ghi đè key `Content-Security-Policy` + thêm X-Frame-Options, KHÔNG đụng key HSTS ⇒ không mất header ở đâu. Tôi tìm bằng chứng subdomain nội bộ chạy HTTP trong repo (vercel.json, next.config.ts, mọi hằng domain trong src/): chỉ thấy `hustlytasker.xyz` và `www.hustlytasker.xyz` (share-portal-actions.ts:358 OWN_HOSTS), đều HTTPS; không có subdomain nội bộ nào trong repo/config. KHÔNG đủ bằng chứng để báo — nhưng lưu ý cho chủ dự án: đây là thứ chỉ hạ tầng thật mới trả lời được, và max-age 2 năm thì gỡ nhầm rất đắt.

8) Không có vấn đề `?? 0` / `?? ''` che select thiếu trường phát sinh từ bản vá này (các `Number(client.depositBalance) || 0` đều nằm ở nhánh CRM không bị thu hẹp), không có truy vấn tuần tự nào được thêm vào $transaction, không có gate nào mới phụ thuộc bảng/biến môi trường có thể vắng ở prod."
