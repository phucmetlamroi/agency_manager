import Link from 'next/link'
import { ArrowLeft, Shield, Mail, Cookie, Database, Lock, FileX } from 'lucide-react'

export const metadata = {
    title: 'Chính sách bảo mật - HustlyTasker',
    description: 'Chính sách bảo mật và xử lý dữ liệu cá nhân của HustlyTasker.',
}

export default function PrivacyPage() {
    return (
        <div className="min-h-screen px-4 py-12" style={{
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
                    <div className="flex items-center gap-3 mb-2">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 text-violet-400">
                            <Shield className="w-5 h-5" />
                        </div>
                        <h1 className="text-3xl font-bold text-zinc-100">Chính sách bảo mật</h1>
                    </div>
                    <p className="text-sm text-zinc-500 mb-8 ml-13">Cập nhật lần cuối: 08/05/2026</p>

                    <div className="space-y-6 text-zinc-300 text-sm leading-relaxed">

                        {/* Tóm tắt */}
                        <div className="p-4 rounded-xl bg-violet-500/5 border border-violet-500/15">
                            <p className="text-violet-200 font-semibold mb-2">📌 Tóm tắt nhanh</p>
                            <ul className="list-disc list-inside space-y-1 text-violet-100/90 text-xs">
                                <li>Chúng tôi chỉ thu thập dữ liệu cần thiết để cung cấp Dịch vụ</li>
                                <li>KHÔNG bán/cho thuê dữ liệu cá nhân của bạn</li>
                                <li>Mật khẩu được hash bằng bcrypt — không lưu plaintext</li>
                                <li>Tuân thủ Luật Bảo vệ Dữ liệu Cá nhân Việt Nam (Luật 91/2025/QH15)</li>
                            </ul>
                        </div>

                        <section>
                            <h2 className="text-xl font-bold text-zinc-100 mb-3 flex items-center gap-2">
                                <Database className="w-5 h-5 text-violet-400" />
                                1. Dữ liệu chúng tôi thu thập
                            </h2>
                            <p className="mb-3">Khi bạn dùng HustlyTasker, chúng tôi thu thập:</p>

                            <div className="space-y-3 ml-2">
                                <div>
                                    <p className="font-semibold text-zinc-200">a) Thông tin tài khoản</p>
                                    <ul className="list-disc list-inside text-xs text-zinc-400 mt-1 ml-4">
                                        <li>Email, tên hiển thị, mật khẩu (đã hash)</li>
                                        <li>Số điện thoại (tùy chọn)</li>
                                        <li>Avatar (nếu bạn upload)</li>
                                    </ul>
                                </div>

                                <div>
                                    <p className="font-semibold text-zinc-200">b) Dữ liệu sử dụng</p>
                                    <ul className="list-disc list-inside text-xs text-zinc-400 mt-1 ml-4">
                                        <li>Tasks, comments, files bạn tạo</li>
                                        <li>Thông tin thành viên trong workspace</li>
                                        <li>Lịch sử làm việc và performance metrics</li>
                                    </ul>
                                </div>

                                <div>
                                    <p className="font-semibold text-zinc-200">c) Dữ liệu kỹ thuật</p>
                                    <ul className="list-disc list-inside text-xs text-zinc-400 mt-1 ml-4">
                                        <li>IP address, User Agent (cho audit log + chống brute-force)</li>
                                        <li>Thời gian đăng nhập, thiết bị truy cập</li>
                                        <li>Cookie phiên (session) để duy trì đăng nhập</li>
                                    </ul>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-zinc-100 mb-3">2. Cách chúng tôi dùng dữ liệu</h2>
                            <ul className="list-disc list-inside space-y-1 ml-2">
                                <li>Cung cấp và vận hành Dịch vụ</li>
                                <li>Xác thực danh tính khi đăng nhập</li>
                                <li>Gửi email thông báo (task assigned, deadline, ...)</li>
                                <li>Phân tích để cải thiện sản phẩm</li>
                                <li>Phòng chống gian lận, spam, và lạm dụng</li>
                                <li>Tuân thủ pháp luật khi có yêu cầu hợp lệ</li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-zinc-100 mb-3 flex items-center gap-2">
                                <Lock className="w-5 h-5 text-emerald-400" />
                                3. Bảo mật dữ liệu
                            </h2>
                            <ul className="list-disc list-inside space-y-1 ml-2">
                                <li>Mật khẩu được hash bằng <strong>bcrypt cost 12</strong> — không thể đọc được plaintext</li>
                                <li>Kết nối HTTPS/TLS bắt buộc cho mọi giao tiếp</li>
                                <li>Database isolation theo workspace — không lộ dữ liệu giữa các tổ chức</li>
                                <li>Kiểm tra đăng nhập chống brute-force (5 lần sai → khóa 15 phút)</li>
                                <li>Audit log immutable cho mọi hành động quan trọng</li>
                                <li>OTP đặt lại mật khẩu hash SHA-256, hết hạn 10 phút, max 5 lần thử</li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-zinc-100 mb-3 flex items-center gap-2">
                                <Cookie className="w-5 h-5 text-amber-400" />
                                4. Cookie và lưu trữ
                            </h2>
                            <p className="mb-2">Chúng tôi sử dụng các cookie sau:</p>
                            <div className="space-y-2 ml-2">
                                <div className="text-xs">
                                    <p><strong className="text-zinc-200">session</strong> — JWT phiên đăng nhập (httpOnly, Secure, SameSite=Lax). 7 ngày (hoặc 30 ngày nếu bạn check &quot;Ghi nhớ&quot;).</p>
                                </div>
                                <div className="text-xs">
                                    <p><strong className="text-zinc-200">tracking_session_id</strong> — UUID phiên ngắn cho analytics (30 phút).</p>
                                </div>
                                <div className="text-xs">
                                    <p><strong className="text-zinc-200">NEXT_LOCALE</strong> — Ngôn ngữ ưa thích cho client portal.</p>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-zinc-100 mb-3">5. Chia sẻ với bên thứ ba</h2>
                            <p className="mb-3">Chúng tôi <strong className="text-emerald-400">KHÔNG bán</strong> dữ liệu cá nhân của bạn. Chỉ chia sẻ với các nhà cung cấp dịch vụ vận hành thiết yếu:</p>
                            <ul className="list-disc list-inside space-y-1 ml-2 text-xs">
                                <li><strong className="text-zinc-200">Vercel</strong> — Hosting (Mỹ, EU)</li>
                                <li><strong className="text-zinc-200">Neon</strong> — Database PostgreSQL (Mỹ)</li>
                                <li><strong className="text-zinc-200">Resend</strong> — Gửi email transactional</li>
                                <li><strong className="text-zinc-200">Vercel BotID</strong> — Chống bot signup (passive detection)</li>
                                <li><strong className="text-zinc-200">Upstash Redis</strong> — Rate limiting</li>
                                <li><strong className="text-zinc-200">Have I Been Pwned</strong> — Kiểm tra password leak (k-anonymity, không gửi password)</li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-zinc-100 mb-3 flex items-center gap-2">
                                <Shield className="w-5 h-5 text-emerald-400" />
                                6. Quyền của bạn (PDPL Việt Nam)
                            </h2>
                            <p className="mb-3">Theo Luật Bảo vệ Dữ liệu Cá nhân số 91/2025/QH15, bạn có quyền:</p>
                            <ul className="list-disc list-inside space-y-1 ml-2">
                                <li><strong className="text-zinc-200">Xem</strong> dữ liệu cá nhân chúng tôi đang lưu trữ</li>
                                <li><strong className="text-zinc-200">Sửa</strong> thông tin không chính xác</li>
                                <li><strong className="text-zinc-200">Xóa</strong> tài khoản và toàn bộ dữ liệu</li>
                                <li><strong className="text-zinc-200">Rút lại</strong> sự đồng ý xử lý dữ liệu</li>
                                <li><strong className="text-zinc-200">Phản đối</strong> việc xử lý nhất định</li>
                                <li><strong className="text-zinc-200">Khiếu nại</strong> với cơ quan có thẩm quyền</li>
                            </ul>
                            <p className="mt-3 text-xs text-zinc-400">
                                Để thực hiện các quyền trên, vui lòng email{' '}
                                <a href="mailto:privacy@hustlytasker.xyz" className="text-violet-400 hover:text-violet-300">
                                    privacy@hustlytasker.xyz
                                </a>{' '}
                                với chủ đề &quot;Yêu cầu PDPL&quot;.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-zinc-100 mb-3 flex items-center gap-2">
                                <FileX className="w-5 h-5 text-red-400" />
                                7. Lưu trữ dữ liệu
                            </h2>
                            <ul className="list-disc list-inside space-y-1 ml-2">
                                <li>Dữ liệu được lưu khi tài khoản còn hoạt động</li>
                                <li>Sau khi xóa tài khoản: dữ liệu xóa trong vòng 30 ngày</li>
                                <li>Audit log lưu 90 ngày để bảo mật</li>
                                <li>Login attempts lưu 90 ngày</li>
                                <li>Email tokens và OTP xóa sau khi hết hạn</li>
                            </ul>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-zinc-100 mb-3">8. Trẻ em dưới 16 tuổi</h2>
                            <p>
                                HustlyTasker không dành cho người dưới 16 tuổi. Nếu phát hiện tài khoản của
                                trẻ em, chúng tôi sẽ xóa ngay lập tức.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-zinc-100 mb-3">9. Thay đổi chính sách</h2>
                            <p>
                                Chúng tôi có thể cập nhật Chính sách này. Thay đổi quan trọng sẽ được thông báo
                                qua email ít nhất 30 ngày trước. Phiên bản hiện tại luôn có tại:{' '}
                                <code className="text-xs bg-white/5 px-2 py-0.5 rounded">/legal/privacy</code>
                            </p>
                        </section>

                        <section>
                            <h2 className="text-xl font-bold text-zinc-100 mb-3 flex items-center gap-2">
                                <Mail className="w-5 h-5 text-violet-400" />
                                10. Liên hệ
                            </h2>
                            <div className="space-y-1">
                                <p>Câu hỏi về quyền riêng tư:</p>
                                <p className="ml-2">
                                    📧{' '}
                                    <a href="mailto:privacy@hustlytasker.xyz" className="text-violet-400 hover:text-violet-300">
                                        privacy@hustlytasker.xyz
                                    </a>
                                </p>
                                <p>Hỗ trợ chung:</p>
                                <p className="ml-2">
                                    📧{' '}
                                    <a href="mailto:support@hustlytasker.xyz" className="text-violet-400 hover:text-violet-300">
                                        support@hustlytasker.xyz
                                    </a>
                                </p>
                            </div>
                        </section>
                    </div>

                    <div className="mt-10 pt-6 border-t border-white/5">
                        <Link
                            href="/legal/terms"
                            className="text-sm text-violet-400 hover:text-violet-300"
                        >
                            → Xem Điều khoản dịch vụ
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    )
}
