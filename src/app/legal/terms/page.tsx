import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const metadata = {
    title: 'Điều khoản dịch vụ - HustlyTasker',
    description: 'Điều khoản sử dụng nền tảng HustlyTasker.',
}

export default function TermsPage() {
    return (
        <div className="min-h-dvh px-4 py-12" style={{
            background: 'radial-gradient(circle at top right, #2d1b5e, #000)'
        }}>
            <div className="max-w-3xl mx-auto">
                <Link
                    href="/signup"
                    className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 mb-6 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Quay lại
                </Link>

                <div className="backdrop-blur-2xl bg-white/[0.04] border border-white/10 rounded-2xl shadow-2xl p-8 md:p-12">
                    <h1 className="text-3xl font-bold text-zinc-100 mb-2">Điều khoản dịch vụ</h1>
                    {/* [BILLING P8] Bản này thêm §3 gói trả phí. Theo chính §8 (báo trước 30 ngày),
                        các thay đổi về PHÍ chỉ có hiệu lực từ ngày ghi trong email thông báo — ngày
                        đó phải ≥ ngày gửi email + 30, và BILLING_ENFORCEMENT_START đặt đúng ngày đó. */}
                    <p className="text-sm text-muted-foreground mb-8">Cập nhật lần cuối: 03/08/2026</p>

                    <div className="prose prose-invert max-w-none space-y-6 text-zinc-300 text-sm leading-relaxed">

                        <section>
                            <h2 className="text-xl font-bold text-zinc-100 mb-3">1. Chấp nhận điều khoản</h2>
                            <p>
                                Khi đăng ký và sử dụng HustlyTasker (&quot;Dịch vụ&quot;), bạn đồng ý tuân thủ
                                các Điều khoản dịch vụ này. Nếu bạn không đồng ý, vui lòng không sử dụng Dịch vụ.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-zinc-100 mb-3">2. Tài khoản người dùng</h2>
                            <p>
                                Bạn chịu trách nhiệm bảo mật mật khẩu tài khoản của mình. HustlyTasker không chịu
                                trách nhiệm cho bất kỳ tổn thất nào do bạn không bảo mật tài khoản. Bạn phải:
                            </p>
                            <ul className="list-disc list-inside space-y-1 mt-2 ml-2">
                                <li>Cung cấp thông tin chính xác và cập nhật</li>
                                <li>Không chia sẻ tài khoản với người khác</li>
                                <li>Báo ngay cho chúng tôi nếu phát hiện truy cập trái phép</li>
                                <li>Tuân thủ pháp luật Việt Nam khi sử dụng Dịch vụ</li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-zinc-100 mb-3">3. Gói dịch vụ và thanh toán</h2>
                            <p>
                                HustlyTasker hoạt động theo mô hình <strong className="text-violet-400">thuê bao trả phí</strong>.
                                Việc sử dụng Dịch vụ yêu cầu một gói đang hiệu lực — kích hoạt bằng thanh toán
                                chuyển khoản, mã dùng thử, hoặc mã quà tặng do HustlyTasker phát hành.
                            </p>
                            <ul className="list-disc list-inside space-y-1 mt-2 ml-2">
                                <li>
                                    <strong>Bảng giá:</strong> niêm yết tại trang &quot;Gói cước&quot; trong ứng dụng,
                                    tính bằng Đồng Việt Nam (VND). Giá tham chiếu USD (nếu hiển thị) chỉ để so sánh,
                                    quy đổi theo tỷ giá do HustlyTasker công bố và có thể điều chỉnh theo quý.
                                </li>
                                <li>
                                    <strong>Thanh toán:</strong> chuyển khoản ngân hàng qua mã QR. Không tự động trừ
                                    tiền — tới kỳ gia hạn, bạn nhận email nhắc và chủ động thanh toán. Số tiền phải
                                    trả là số hiển thị tại thời điểm tạo mã thanh toán.
                                </li>
                                <li>
                                    <strong>Hạn mức lưu trữ:</strong> tính theo dung lượng các tệp đang hiển thị
                                    trong tài khoản (không tính tệp trong thùng rác).
                                </li>
                                <li>
                                    <strong>Sử dụng hợp lý:</strong> mỗi gói có định mức phút video xử lý mỗi tháng
                                    (ghi trên bảng giá). Vượt định mức kéo dài, chúng tôi sẽ liên hệ trao đổi trước
                                    khi áp dụng bất kỳ giới hạn nào.
                                </li>
                                <li>
                                    <strong>Khi gói hết hạn:</strong> dữ liệu chuyển sang chế độ chỉ-đọc trong 30 ngày
                                    (vẫn xem và tải được toàn bộ). Sau đó tài khoản bị khoá; dữ liệu tiếp tục được giữ
                                    và khôi phục đầy đủ ngay khi bạn kích hoạt lại một gói. Không hoàn phí cho phần
                                    thời gian chưa dùng, trừ trường hợp lỗi từ phía chúng tôi.
                                </li>
                                <li>
                                    <strong>Nâng gói giữa kỳ:</strong> số ngày còn lại của gói cũ được quy đổi theo
                                    tỷ lệ giá và cộng vào gói mới (làm tròn có lợi cho bạn).
                                </li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-zinc-100 mb-3">4. Sử dụng được phép</h2>
                            <p>Bạn KHÔNG được:</p>
                            <ul className="list-disc list-inside space-y-1 mt-2 ml-2">
                                <li>Sử dụng Dịch vụ cho mục đích bất hợp pháp</li>
                                <li>Cố gắng phá hoại, hack, hoặc làm gián đoạn hệ thống</li>
                                <li>Sao chép, bán lại hoặc tái phân phối Dịch vụ</li>
                                <li>Tải lên nội dung vi phạm bản quyền hoặc gây hại</li>
                                <li>Tạo nhiều tài khoản để lạm dụng Dịch vụ</li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-zinc-100 mb-3">5. Quyền sở hữu trí tuệ</h2>
                            <p>
                                Dữ liệu bạn tạo (task, comment, file) thuộc sở hữu của bạn. HustlyTasker chỉ có
                                quyền lưu trữ và xử lý để cung cấp Dịch vụ. Mã nguồn, giao diện, và thương hiệu
                                HustlyTasker là tài sản của chúng tôi.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-zinc-100 mb-3">6. Chấm dứt dịch vụ</h2>
                            <p>
                                Chúng tôi có quyền tạm dừng hoặc xóa tài khoản nếu bạn vi phạm Điều khoản.
                                Bạn có thể xóa tài khoản bất cứ lúc nào trong phần Cài đặt. Sau 30 ngày
                                không hoạt động, dữ liệu có thể được xóa vĩnh viễn.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-zinc-100 mb-3">7. Giới hạn trách nhiệm</h2>
                            <p>
                                HustlyTasker được cung cấp &quot;nguyên trạng&quot;. Chúng tôi không bảo đảm
                                Dịch vụ luôn hoạt động không gián đoạn hoặc không có lỗi. Trách nhiệm tối đa của
                                HustlyTasker không vượt quá phí bạn đã trả trong 12 tháng gần nhất.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-zinc-100 mb-3">8. Thay đổi điều khoản</h2>
                            <p>
                                Chúng tôi có thể cập nhật Điều khoản này. Thay đổi quan trọng sẽ được thông báo
                                qua email ít nhất 30 ngày trước khi có hiệu lực. Tiếp tục sử dụng Dịch vụ sau
                                khi thay đổi đồng nghĩa với việc bạn chấp nhận điều khoản mới.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-zinc-100 mb-3">9. Luật áp dụng</h2>
                            <p>
                                Điều khoản này được điều chỉnh bởi pháp luật Việt Nam, bao gồm Luật Bảo vệ
                                Dữ liệu Cá nhân số 91/2025/QH15 và các quy định liên quan.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-zinc-100 mb-3">10. Liên hệ</h2>
                            <p>
                                Mọi câu hỏi vui lòng gửi về:{' '}
                                <a href="mailto:support@hustlytasker.xyz" className="text-violet-400 hover:text-violet-300">
                                    support@hustlytasker.xyz
                                </a>
                            </p>
                        </section>
                    </div>

                    <div className="mt-10 pt-6 border-t border-white/5">
                        <Link
                            href="/legal/privacy"
                            className="text-sm text-violet-400 hover:text-violet-300"
                        >
                            → Xem Chính sách bảo mật
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    )
}
