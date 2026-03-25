import { ShieldCheck, AlertTriangle } from 'lucide-react'

export default function UserAgreementContent() {
    return (
        <div className="space-y-6 text-zinc-300 text-sm md:text-base leading-relaxed overflow-y-auto px-1 pr-2">
            <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl flex items-start gap-4">
                <AlertTriangle className="w-6 h-6 text-orange-400 shrink-0 mt-0.5" />
                <div>
                    <h3 className="text-orange-400 font-semibold mb-1">Cảnh Báo: Chấm điểm lỗi (Error Rate)</h3>
                    <p className="text-orange-200/80 text-sm">
                        Hệ thống mới sẽ bắt đầu ghi nhận và tính toán số liệu Lỗi của toàn bộ Editor. Các lỗi được quản lý (Manager) bắt trực tiếp trên video sẽ ảnh hưởng trực tiếp đến Rank và thu nhập tháng của bạn.
                    </p>
                </div>
            </div>

            <section className="space-y-3">
                <h2 className="text-white text-lg font-semibold flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-red-500/20 text-red-400 flex items-center justify-center text-xs text-center font-bold">1</span>
                    Nhóm Lỗi Nghiêm Trọng (Phạt Nặng)
                </h2>
                <ul className="list-disc pl-6 space-y-2 text-zinc-400 marker:text-red-500">
                    <li><strong className="text-red-300">DEADLINE BREACH:</strong> Giao nộp sản phẩm trễ so với thời hạn (Deadline) quy định mà không có sự đồng ý của quản lý.</li>
                    <li><strong className="text-red-300">BRIEF DEVIATION:</strong> Không tuân thủ hoặc làm sai lệch nội dung Brief ban đầu.</li>
                    <li><strong className="text-red-300">AUDIO MONO BUG:</strong> Lỗi xuất âm thanh kỹ thuật (chỉ nghe được một bên tai hoặc sai kênh).</li>
                    <li><strong className="text-red-300">SPAWN NEW BUGS:</strong> Quá trình chỉnh sửa sinh ra lỗi mới không có trong bản gốc.</li>
                    <li><strong className="text-red-300">REPEAT FEEDBACK:</strong> Cố tình lặp lại lỗi kỹ thuật Manager đã nhắc ở version trước.</li>
                </ul>
            </section>

            <section className="space-y-3">
                <h2 className="text-white text-lg font-semibold flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-yellow-500/20 text-yellow-400 flex items-center justify-center text-xs text-center font-bold">2</span>
                    Nhóm Lỗi Trung Bình & Nhẹ
                </h2>
                <ul className="list-disc pl-6 space-y-2 text-zinc-400 marker:text-yellow-500">
                    <li><strong className="text-yellow-300">PRESET MISMATCH:</strong> Khởi tạo project sai cấu hình, sai tỷ lệ khung hình, hoặc dùng sai Preset xuất tệp.</li>
                    <li><strong className="text-yellow-300">TEXT JUMP/TYPO:</strong> Lỗi phụ đề bị tràn sang cảnh sau hoặc xuất hiện sớm ở cảnh trước do không khớp với điểm cắt, đồng thời nội dung chữ bị lệch nhịp, hiển thị trước hoặc sau so với giọng nói thực tế trong video.</li>
                    <li><strong className="text-yellow-300">BLACK FRAME:</strong> Bỏ sót các khung hình đen chớp giật (Black frame) giữa các cut.</li>
                    <li><strong className="text-yellow-300">NAMING & OUTSOURCE:</strong> Đặt sai định dạng tên tệp xuất, hoặc không lưu versioning v2, v3 hợp lệ.</li>
                </ul>
            </section>

            <section className="space-y-3">
                <h2 className="text-white text-lg font-semibold flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs text-center font-bold">3</span>
                    Cơ Hệ Xếp Hạng & Khóa Tài Khoản
                </h2>
                <div className="bg-black/40 rounded-xl p-4 border border-white/5">
                    <ul className="space-y-2 text-sm">
                        <li className="flex justify-between items-center border-b border-white/5 pb-2">
                            <span className="text-purple-400 font-bold">Rank S</span>
                            <span className="text-zinc-500">Error Rate &lt; 0.3</span>
                        </li>
                        <li className="flex justify-between items-center border-b border-white/5 py-2">
                            <span className="text-green-400 font-bold">Rank A</span>
                            <span className="text-zinc-500">0.3 - 0.6</span>
                        </li>
                        <li className="flex justify-between items-center border-b border-white/5 py-2">
                            <span className="text-blue-400 font-bold">Rank B</span>
                            <span className="text-zinc-500">0.6 - 1.0</span>
                        </li>
                        <li className="flex justify-between items-center border-b border-white/5 py-2">
                            <span className="text-orange-400 font-bold">Rank C (Cảnh cáo)</span>
                            <span className="text-zinc-500">1.0 - 1.5</span>
                        </li>
                        <li className="flex justify-between items-center pt-2">
                            <span className="text-red-500 font-bold">Rank D (Đình chỉ)</span>
                            <span className="text-zinc-500">&gt; 1.5</span>
                        </li>
                    </ul>
                    <p className="mt-4 text-xs text-zinc-500 italic">
                        * Lỗi sẽ được tính tích lũy (Cộng dồn số lượng) nếu lặp đi lặp lại nhiều lần trong cùng 1 video. Xếp hạng Rank C và D sẽ bị giới hạn tài khoản.
                    </p>
                </div>
            </section>
        </div>
    )
}
