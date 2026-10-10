# Chức năng & thu phí theo gói — đối chiếu với code thật

> Lập 2026-09-08 · nhánh `claude/billing-2026-07` · bản đang chạy ở hustlytasker.xyz (Next.js + SePay).
> Nguồn sự thật: [`src/lib/billing/plans.ts`](../../src/lib/billing/plans.ts) (giá, hạn mức, danh sách
> `PlanFeature`) và [`src/lib/billing/entitlements.ts`](../../src/lib/billing/entitlements.ts) (hàm gate).
> Cột "Chặn theo gói" là kết quả **rà tay từng call-site** ngày lập — không phải ý định thiết kế.
> Khi thêm/bỏ một gate, sửa file này trong **cùng commit**; để lệch là bảng giá nói một đằng, code làm một nẻo.

## 0. Đọc trong 30 giây

| | |
|---|---|
| Gói bán | **Studio** 990.000đ · **Agency** 3.290.000đ · **Scale** 8.290.000đ /tháng (trả năm: 790k · 2.690k · 6.690k /tháng) |
| Ghế mua thêm | 165k · 139k · 109k đ/ghế/tháng — **bán được ngay**, đi vào đơn SePay |
| Free | Không còn là gói bán (D1) — chỉ là sàn nội bộ khi tổ chức bị `LOCKED` |
| Enterprise | Giá thoả thuận, cấp bằng override tay, không qua giỏ hàng |
| Công tắc thu phí | `BILLING_ENFORCEMENT_START` — **chưa đặt trong `.env`** ⇒ hôm nay không ai bị chặn, không ai phải trả |
| Ký hiệu | ✅ có chặn thật (kèm file:dòng) · ❌ bảng giá ghi nhưng code không chặn · ⚪ không cần chặn (mọi gói trả phí đều có) · 🗑 đã gỡ khỏi sản phẩm |

**Kết luận chính:** 13 tính năng có tên trong bảng giá, **6 có gate**, **7 không**. Toàn bộ khoảng cách
Studio → Agency (2.300.000đ/tháng) hiện chỉ được bảo vệ bằng **ghế + dung lượng + xuất XLSX**.

---

## 1. Ma trận chức năng theo gói

| Tính năng (`PlanFeature`) | Studio | Agency | Scale | Đã có trong code? | Chặn theo gói? |
|---|:-:|:-:|:-:|---|---|
| Velox quét thư mục tạo task (`VELOX`) | ✓ | ✓ | ✓ | ✅ `api/integrations/scan-folder` | ✅ [scan-folder/route.ts:132](../../src/app/api/integrations/scan-folder/route.ts) |
| Đăng task lên chợ (`MARKETPLACE_PUBLISH`) | ✓ | ✓ | ✓ | ✅ | ✅ [claim-actions.ts:61](../../src/actions/claim-actions.ts) — nhận task thì mọi gói đều được |
| Bảo vệ link review: mật khẩu / hạn / chặn tải (`SHARE_LINK_PROTECTION`) | ✓ | ✓ | ✓ | ✅ | ✅ [shares.ts:248](../../src/lib/review/shares.ts) |
| Hoá đơn cho khách (`INVOICING`) | ✓ 5/tháng | ✓ | ✓ | ✅ PDF qua Chromium | ✅ [invoice-actions.ts:423](../../src/actions/invoice-actions.ts) — cả trần 5/tháng |
| Cổng khách hàng The Desk (`CLIENT_PORTAL`) | ✓ | ✓ | ✓ | ✅ `/share/[token]` | ✅ [share-link-actions.ts:48](../../src/actions/share-link-actions.ts) + chặn `LOCKED` ở [share-link-auth.ts:165](../../src/lib/share-link-auth.ts) |
| Xuất lương XLSX (`PAYROLL_EXPORT`) | ✗ | ✓ | ✓ | ✅ | ✅ [monthly-tasks-xlsx/route.ts:123](../../src/app/api/exports/monthly-tasks-xlsx/route.ts) |
| Bảng lương đầy đủ (`PAYROLL_FULL`) | ✓ | ✓ | ✓ | ✅ `admin/payroll` | ⚪ mọi gói trả phí đều có; `LOCKED` đã bị khoá cả trang |
| White-label — ẩn thương hiệu (`WHITE_LABEL`) | ✓ | ✓ | ✓ | ⚠️ **nửa vời** — xem §4 | ❌ |
| **Tài chính: P&L + sổ thu + bảng giá** (`FINANCE_SUITE`) | ✗ | ✓ | ✓ | ✅ `admin/finance`, `pricing-rule-actions` | ❌ **Studio dùng được** |
| **Khách tự gửi yêu cầu** (`CLIENT_INTAKE`) | ✗ | ✓ | ✓ | ✅ wizard 5 bước + `admin/requests` | ❌ **Studio dùng được** |
| **MCP cho Claude/GPT** (`MCP`) | ✗ | ✓ | ✓ | ✅ `mcp-server/` — 20 tool, service account theo `MCP_PROFILE_ID` | ❌ — gate được ở khâu **cấp cấu hình** (chỉ phát cho Agency+), code chưa kiểm gói |
| **So sánh phiên bản** (`VERSION_COMPARE`) | ✗ | ✓ | ✓ | ✅ `CompareView.tsx`, `CompareSide.tsx` | ❌ **Studio dùng được** |
| **Phân tích KPI đội ngũ** (`ANALYTICS`) | ✗ | ✓ | ✓ | ✅ `admin/analytics`, bảng xếp hạng | ❌ **Studio dùng được** |

Năm dòng in đậm là **toàn bộ lý do để trả thêm cho Agency** — không dòng nào chặn. [`VAN-HANH.md §7`](VAN-HANH.md)
đã ghi đây là nợ.

Hàm gate dùng ở đâu (để không phải rà lại): `requireFeature` 6 chỗ · `checkSeatCap` 4 chỗ
([create-user.ts:48](../../src/actions/create-user.ts), [member-actions.ts:329](../../src/actions/member-actions.ts),
[member-actions.ts:777](../../src/actions/member-actions.ts), [profile-member-actions.ts:131](../../src/actions/profile-member-actions.ts)) ·
`checkStorageCap` 1 chỗ ([upload-service.ts:56](../../src/lib/review/upload-service.ts)) · `assertWriteAllowed` **0 chỗ** (xem §4).

---

## 2. Hạn mức theo gói

| Hạn mức | Studio | Agency | Scale | Đo được? | Chặn được? |
|---|---|---|---|---|---|
| Ghế bao gồm → trần | 5 → 10 | 15 → 25 | 30 → 60 | ✅ `countBillableSeats` (không tính `CLIENT`, không tính `LOCKED`) | ✅ 4 chỗ tiêu ghế |
| Dung lượng (GB thập phân, theo `liveBytes`) | 250 GB | 1 TB | 3 TB | ✅ `getStorageUsage` | ✅ lúc khởi tạo upload |
| Hoá đơn / tháng | 5 | ∞ | ∞ | ✅ | ✅ |
| **Độ phân giải video** | 1080p | 1080p | **4K** | ❌ | ❌ [mux.ts:88](../../src/lib/review/mux.ts) gửi `video_quality: 'plus'` (= độ phân giải gốc) cho **mọi** gói |
| **Số tổ chức chung hạn mức** | 1 | 3 | 5 | ❌ | ❌ chỉ có ở `plans.ts` + landing; UI gán tổ chức phụ chưa xây |
| **Giữ thùng rác & nhật ký** | 30 ngày | 90 | **365** | ❌ | ❌ `retentionDays` không được đọc ở đâu; landing vẫn bán "365 ngày" cho Scale |
| Khách portal | 10 | ∞ | ∞ | ❌ | ❌ (nhỏ — Studio mới bị ảnh hưởng) |
| Phút video fair-use | 400 | 1.500 | 4.000 | ⚪ cố ý không đo | — điều khoản mềm trong ToS, không phải đồng hồ |

---

## 3. Đã có trong code nhưng **chưa nằm trong bảng giá** — có thể thu tiền

| Chức năng | Ở đâu | Gợi ý gói |
|---|---|---|
| **CRM khách hàng + link chia sẻ CRM** | `admin/crm`, `crm-actions.ts`, `ClientShareLink` | Agency+ — ứng viên rõ nhất, hiện không là `PlanFeature` nào |
| **Nhật ký kiểm toán** | `admin/audit-log`, `audit-actions.ts` | Scale / Enterprise — mặt hàng "doanh nghiệp" kinh điển |
| **Làm việc chéo tổ chức** | `cross-team-actions.ts` | Gắn với hạn mức "số tổ chức" (đang chưa chặn) |
| Lịch làm việc + đăng ký ca | `admin/schedule`, `dashboard/schedule`, `availability-actions.ts` | Agency+ |
| Cấu hình thưởng · uy tín · hồ sơ lỗi | `bonus-*`, `reputation-actions.ts`, `dashboard/errors` | Gộp vào `PAYROLL_FULL` hoặc tách thành "Payroll Pro" |
| Push + email digest + giờ im lặng | `push-actions.ts`, `cron/send-digest` | Email là chi phí Resend theo lượng — hiện không đếm |
| Mission Control (giao diện 2, 31 màn) | `/[workspaceId]/mc/**` | Là "da" khác của cùng dữ liệu — không phải đơn vị bán hợp lý |
| Kết nối Google Drive / Dropbox | `api/integrations/*` | Kết nối miễn phí, quét thư mục đã gate qua `VELOX` — hợp lý, giữ |
| Nhận task từ chợ · bình luận task · đính kèm | — | Cố ý miễn phí mọi gói — giữ |

---

## 4. Bảng giá / landing **quảng cáo nhưng chưa có, hoặc chưa giao đủ**

| Đã bán | Thực tế | Mức độ |
|---|---|---|
| **"Hết hạn → chỉ-đọc 30 ngày, xem + tải được"** ([`VAN-HANH.md §1`](VAN-HANH.md), text trang Gói cước, mẫu email 30 ngày) | [`assertWriteAllowed`](../../src/lib/billing/entitlements.ts) **0 nơi gọi**; [BillingLockGate.tsx:27](../../src/components/billing/BillingLockGate.tsx) chỉ nhìn `LOCKED`, bỏ qua `GRACE` ⇒ tổ chức hết hạn **vẫn ghi bình thường** 30 ngày | 🔴 lời hứa đã in trong email |
| **4K chỉ Scale** | Mux luôn encode độ phân giải gốc cho mọi gói. [plans.ts:225](../../src/lib/billing/plans.ts) tự ghi: encode 4K đắt gấp **3,2×** 1080p, "Agency lỗ" | 🔴 mất tiền mặt ngay, không phải mất doanh thu tiềm năng |
| **White-label** cho mọi gói trả phí | Cổng The Desk nhận logo + màu agency ([PortalApp.tsx:112](../../src/components/portal/calm/PortalApp.tsx)); nhưng link review khách vẫn in cứng **"Sent via HustlyTasker"** ở [GuestReviewApp.tsx:775](../../src/components/review/share/GuestReviewApp.tsx) và [GateScreens.tsx:77](../../src/components/review/share/GateScreens.tsx) | 🟠 giao một nửa |
| Giữ thùng rác & nhật ký 30/90/**365** ngày | Không có cơ chế; cửa sổ dọn là hằng số toàn hệ thống | 🟠 hoặc thực thi, hoặc gỡ khỏi landing |
| "3 tổ chức chung hạn mức" / "5 tổ chức" | Không có UI gán tổ chức phụ, không có chặn | 🟠 như trên |
| Fair-use phút video | Cố ý không đo — chỉ để hiện và viết vào ToS | ⚪ đúng thiết kế, cần ghi rõ trong ToS |

---

## 5. Đã gỡ khỏi sản phẩm

| | Ngày | Còn lại |
|---|---|---|
| 🗑 **Kho phim "Giải trí"** — `/entertainment`, 13 route `/api/ent`, `lib/ent`, `components/ent`, 3 hàm Inngest | 2026-09-08 | 4 bảng `Ent*` + enum `EntCodeRole` **còn trong schema + DB**; asset trên Mux + object R2 (`ent/…`) **chưa dọn**; webhook Mux có guard tombstone cho passthrough `ent:` |
| 🗑 **StudyPlace** (ôn tập SM-2 trong Cài đặt) | 2026-09-08 | Bảng `StudyPlaceProgress` còn trên DB; 1 stub `getStudyPlaceProgress` trả `[]` vì `mc/settings` (vùng không được sửa) vẫn gọi |
| 🗑 Dịch AI ghi chú task | trước đó | `retry-translation-action.ts` là stub báo "đã gỡ để tiết kiệm chi phí" — chính dạng tính năng nên **bán như add-on trả theo lượt** thay vì gỡ |

Drop bảng là `prisma db push` lên production — cần duyệt riêng, không gom vào đợt gỡ code.

---

## 6. Trạng thái thu tiền hôm nay (đo `scripts/billing/measure-usage.ts`, 2026-09-08)

- 52 tổ chức đang hoạt động. **Chưa tổ chức nào có bản ghi gói** — Hustly Team hiện "Chưa có gói" với
  16/3 ghế và 54,1/10 GB (số của sàn Free) ⇒ ngoại lệ D4 (chốt 03/08) **chưa từng được cấp**,
  `scripts/billing/grant-overrides.ts` chưa chạy.
- Nếu bật khoá ngay: **6 tổ chức bị chặn** — Audrey, Carpe Diem, Flow Studio, Hustly Team, Tobi, Vincent.
- Danh sách D4 đã cũ so với ai đang dùng thật (theo `scripts/analytics/active-teams.ts`):

| Team | Ngoại lệ D4 | Hoạt động tháng 9 |
|---|---|---|
| Hustly Team | Scale vĩnh viễn | dùng hàng ngày |
| Vincent Editing Co | 12 tháng | dùng hàng ngày |
| Tobi · Carpe Diem | 12 tháng | **không dấu vết** |
| Audrey | 12 tháng | 2 người vào, 0 task |
| **Kozhi Revenue** | **không có** | dùng thật (2 người, 25 task/tháng) |
| **Flow Studio** | **không có** | mới bắt đầu (9 ghế) |

Kozhi Revenue "vừa gói Free" theo số ghế, nhưng Free không còn là gói bán ⇒ ngày bật khoá vẫn bị khoá.

---

## 7. Thứ tự việc phải làm để thu tiền thật

1. **Vá GRACE** — nối `assertWriteAllowed` vào các action ghi chính. Lời hứa đã in trong email, phải giữ được trước khi gửi.
2. **Chặn 4K theo gói** ở `mux.ts` — dừng chảy máu tiền mặt, sửa một chỗ.
3. **Gate 5 tính năng Agency** (Tài chính, Intake, MCP, So sánh phiên bản, KPI) ở tầng trang/action — để giá Agency có nghĩa.
4. **Sửa "Sent via HustlyTasker"** theo `WHITE_LABEL` — giao đúng thứ đã bán.
5. **Retention + số tổ chức**: thực thi, hoặc gỡ khỏi landing. Để nguyên là quảng cáo thứ không có.
6. **Cập nhật D4** cho đúng người (thêm Kozhi Revenue + Flow Studio, xét lại Tobi/Carpe Diem) rồi chạy `grant-overrides.ts` thật.
7. Quyết số phận **dữ liệu của hai tính năng đã gỡ** (§5): drop bảng + dọn Mux/R2, hay giữ.

Mục 1–2 là việc nhỏ. Mục 3–7 mỗi mục cần chủ sản phẩm chốt một quyết định trước.
