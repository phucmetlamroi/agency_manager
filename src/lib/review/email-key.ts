/**
 * Canonical INBOX key for rate-limit buckets — MỘT câu trả lời cho MỘT câu hỏi.
 *
 * [AUDIT HT-015] Trước đây codebase có HAI hàm trả lời cùng một câu hỏi "hai địa chỉ này có
 * cùng về một hộp thư không", và chúng trả lời NGƯỢC NHAU:
 *  · `canonicalEmailKey` ở luồng khách /r/ (AUDIT L3): cắt '+tag' cho MỌI domain.
 *  · `notifyInboxKey` ở cổng chia sẻ: chỉ cắt cho 15 domain đã biết.
 * Bản nào cũng có lý lẽ riêng, nhưng hai bản cạnh nhau thì bản lỏng hơn chính là bản có hiệu
 * lực với kẻ tấn công — nạn nhân ở domain riêng vẫn bị bắn không giới hạn bằng victim+1@,
 * victim+2@… vì mỗi cách viết là một xô đếm riêng. Nay gộp về một hàm, dùng chung cả hai chỗ.
 *
 * VÌ SAO CHỌN CẮT CHO MỌI DOMAIN, dù lý lẽ phản đối là có thật:
 * một công ty tự dựng mail server CÓ THỂ cấp ops@ và ops+vip@ thành hai hộp thư khác nhau.
 * Nhưng hai kiểu sai lệch không cân nhau chút nào:
 *  · Cắt thừa  → hai địa chỉ thật dùng chung một hạn mức. Phiền, và chỉ phiền khi hạn mức chật.
 *  · Cắt thiếu → chốt chặn KHÔNG TỒN TẠI với mọi domain ngoài danh sách.
 * Nên chọn cắt cho mọi domain, và bù lại bằng hạn mức rộng (10/ngày) để cái giá của việc cắt
 * thừa gần như bằng không. Lần trước đặt 3/giờ mới khiến việc cắt thừa thành lỗi thấy được.
 *
 * ⚠️ Hàm này CỐ Ý LÀM MẤT THÔNG TIN. Chỉ dùng để làm khoá đếm. Không bao giờ lưu, không bao giờ
 * gửi thư tới giá trị nó trả ra — thư luôn gửi tới đúng địa chỉ người dùng đã gõ.
 */
export function canonicalEmailKey(email: string): string {
    const at = email.lastIndexOf('@')
    if (at < 1) return email
    let local = email.slice(0, at)
    let domain = email.slice(at + 1)
    const plus = local.indexOf('+')
    if (plus >= 0) local = local.slice(0, plus)
    // gmail.com và googlemail.com là CÙNG một hộp thư Google và đều bỏ qua dấu chấm — phải gộp
    // về một khoá, không thì mẹo alias này sống sót ở nửa sức (a.b@googlemail.com và ab@gmail.com
    // là một hộp thư, hai xô đếm).
    if (domain === 'googlemail.com') domain = 'gmail.com'
    if (domain === 'gmail.com') local = local.replace(/\./g, '')
    return `${local}@${domain}`
}
