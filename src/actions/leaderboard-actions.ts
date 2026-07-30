'use server'

import { revalidateTag } from "next/cache"
import { getSession } from "@/lib/auth"

/**
 * [AUDIT SWEEP-2026-07-30 fix · P2-012] TRƯỚC ĐÂY KHÔNG CÓ MỘT CỔNG NÀO.
 *
 * Đây là server action, tức một POST endpoint công khai ngay khi có Client Component tham chiếu
 * (`RefreshLeaderboardButton.tsx` có). Hàm không nhận tham số, nên KHÔNG CẦN tài khoản, không cần
 * cookie: một POST rỗng kèm header `Next-Action: <id>` là `revalidateTag('leaderboard')` chạy. Tag
 * lại là TOÀN CỤC, nên mỗi lượt gọi buộc truy vấn tổng hợp leaderboard phải tính lại cho MỌI lượt
 * xem dashboard của MỌI tenant. Lặp ở tần suất cao = đòn khuếch đại chi phí: vài trăm byte gửi đi,
 * đổi lại nhiều truy vấn tổng hợp.
 *
 * Vá tối thiểu, không đổi chữ ký nên không phải sửa client: đòi phiên còn sống, khuôn nguyên văn ở
 * `push-actions.ts`.
 *
 * ⚠️ CÒN LẠI MỘT NỬA, CỐ Ý CHƯA LÀM: tag vẫn là `'leaderboard'` toàn cục, nên một thành viên hợp lệ
 * của tenant A vẫn vô hiệu hoá được cache của tenant B. Đổi thành `leaderboard-${workspaceId}` phải
 * sửa đồng thời bên GHI (`upload-actions.ts`) và bên ĐỌC (`components/dashboard/Leaderboard.tsx`) —
 * lệch một trong ba chỗ là cache không bao giờ được làm mới nữa, và lỗi đó im lặng. Ghi làm nợ thay
 * vì làm dở trong cùng lượt vá.
 */
export async function refreshLeaderboardAction() {
    const session = await getSession()
    if (!session?.user?.id) return { error: 'Unauthorized' }
    const { isSessionLive } = await import('@/lib/profile-permissions')
    if (!(await isSessionLive(session))) return { error: 'Unauthorized' }

    // @ts-ignore
    revalidateTag('leaderboard')
    return { success: true }
}
