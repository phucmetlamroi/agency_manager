import Link from 'next/link'
import { ArrowLeft, Check, Crown, Zap, Building2, Sparkles, Mail } from 'lucide-react'

export const metadata = {
    title: 'Nâng cấp tài khoản - HustlyTasker',
    description: 'Chọn gói phù hợp để mở khóa toàn bộ tính năng HustlyTasker.',
}

const PLANS = [
    {
        id: 'starter',
        name: 'Starter',
        price: '199.000',
        period: '/tháng',
        description: 'Cho freelancer và team nhỏ',
        icon: Zap,
        accent: 'from-blue-500 to-cyan-500',
        accentBg: 'bg-blue-500/10 border-blue-500/20',
        features: [
            'Tối đa 5 thành viên',
            '3 workspace',
            'Task không giới hạn',
            'Schedule + Calendar',
            'Email notification',
            'Support qua email',
        ],
        cta: 'Liên hệ để mua',
    },
    {
        id: 'pro',
        name: 'Pro',
        price: '499.000',
        period: '/tháng',
        description: 'Cho team đang phát triển',
        icon: Crown,
        accent: 'from-violet-500 to-fuchsia-500',
        accentBg: 'bg-violet-500/10 border-violet-500/30',
        recommended: true,
        features: [
            'Tối đa 20 thành viên',
            '10 workspace',
            'Task + File + Comment không giới hạn',
            'CRM cho khách hàng',
            'Analytics nâng cao',
            'Audit log đầy đủ',
            'Export PDF/Excel',
            'Support priority (24h)',
        ],
        cta: 'Liên hệ để mua',
    },
    {
        id: 'enterprise',
        name: 'Enterprise',
        price: 'Liên hệ',
        period: '',
        description: 'Cho công ty/agency lớn',
        icon: Building2,
        accent: 'from-amber-500 to-orange-500',
        accentBg: 'bg-amber-500/10 border-amber-500/20',
        features: [
            'Thành viên không giới hạn',
            'Workspace không giới hạn',
            'Tất cả tính năng Pro',
            'Custom branding',
            'SSO / SAML (coming soon)',
            'Dedicated account manager',
            'SLA 99.9% uptime',
            'On-premise deployment (option)',
        ],
        cta: 'Liên hệ sales',
    },
]

export default function UpgradePage() {
    return (
        <div className="min-h-screen px-4 py-12" style={{
            background: 'radial-gradient(circle at top right, #2d1b5e, #000)'
        }}>
            <div className="max-w-6xl mx-auto">
                <Link
                    href="/"
                    className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 mb-6 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Quay lại Dashboard
                </Link>

                {/* Hero */}
                <div className="text-center mb-12">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-semibold mb-4">
                        <Sparkles className="w-3 h-3" />
                        Nâng cấp tài khoản
                    </div>
                    <h1 className="text-4xl md:text-5xl font-extrabold text-zinc-100 mb-4 tracking-tight">
                        Chọn gói phù hợp với bạn
                    </h1>
                    <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
                        Mở khóa toàn bộ tính năng HustlyTasker với các gói thiết kế cho mọi quy mô.
                        Có thể đổi/hủy bất cứ lúc nào.
                    </p>
                </div>

                {/* Plans grid */}
                <div className="grid md:grid-cols-3 gap-6 mb-12">
                    {PLANS.map(plan => {
                        const Icon = plan.icon
                        return (
                            <div
                                key={plan.id}
                                className={`relative backdrop-blur-2xl bg-white/[0.04] border ${plan.recommended ? 'border-violet-500/40 shadow-2xl shadow-violet-500/20' : 'border-white/10'} rounded-2xl p-6 flex flex-col`}
                            >
                                {plan.recommended && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-[11px] font-bold tracking-wide uppercase shadow-lg">
                                        Khuyến nghị
                                    </div>
                                )}

                                <div className={`inline-flex w-12 h-12 items-center justify-center rounded-xl ${plan.accentBg} mb-4`}>
                                    <Icon className={`w-6 h-6 bg-gradient-to-br ${plan.accent} bg-clip-text text-transparent`} style={{ stroke: 'url(#g)' }} />
                                </div>

                                <h3 className="text-2xl font-bold text-zinc-100 mb-1">{plan.name}</h3>
                                <p className="text-sm text-zinc-400 mb-4">{plan.description}</p>

                                <div className="mb-6">
                                    <span className="text-4xl font-extrabold text-zinc-100">
                                        {plan.price === 'Liên hệ' ? plan.price : `${plan.price}đ`}
                                    </span>
                                    {plan.period && (
                                        <span className="text-sm text-zinc-500 ml-1">{plan.period}</span>
                                    )}
                                </div>

                                <ul className="space-y-2.5 mb-6 flex-1">
                                    {plan.features.map((feature, i) => (
                                        <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                                            <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                                            <span>{feature}</span>
                                        </li>
                                    ))}
                                </ul>

                                <a
                                    href={`mailto:sales@hustlytasker.xyz?subject=Yêu cầu nâng cấp gói ${plan.name}`}
                                    className={`w-full py-3 px-4 rounded-xl font-bold text-sm text-center transition-all ${
                                        plan.recommended
                                            ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white shadow-lg shadow-violet-500/30'
                                            : 'bg-white/5 hover:bg-white/10 text-zinc-100 border border-white/10'
                                    }`}
                                >
                                    {plan.cta}
                                </a>
                            </div>
                        )
                    })}
                </div>

                {/* FAQ + contact */}
                <div className="backdrop-blur-2xl bg-white/[0.02] border border-white/5 rounded-2xl p-8">
                    <div className="grid md:grid-cols-2 gap-8">
                        <div>
                            <h2 className="text-xl font-bold text-zinc-100 mb-4">Câu hỏi thường gặp</h2>
                            <div className="space-y-4 text-sm">
                                <div>
                                    <p className="font-semibold text-zinc-200 mb-1">Tôi có thể đổi gói không?</p>
                                    <p className="text-zinc-400">Có, bạn có thể đổi gói bất cứ lúc nào. Phí được tính tỷ lệ theo ngày sử dụng.</p>
                                </div>
                                <div>
                                    <p className="font-semibold text-zinc-200 mb-1">Có cam kết hợp đồng không?</p>
                                    <p className="text-zinc-400">Không. Bạn có thể hủy bất cứ lúc nào và không bị phạt.</p>
                                </div>
                                <div>
                                    <p className="font-semibold text-zinc-200 mb-1">Phương thức thanh toán?</p>
                                    <p className="text-zinc-400">Hiện tại: chuyển khoản ngân hàng + invoice. Sắp ra mắt: VNPay, MoMo, thẻ tín dụng.</p>
                                </div>
                                <div>
                                    <p className="font-semibold text-zinc-200 mb-1">Dữ liệu của tôi sau khi hủy?</p>
                                    <p className="text-zinc-400">Dữ liệu được giữ trong 30 ngày để bạn có thể export. Sau đó xóa vĩnh viễn.</p>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h2 className="text-xl font-bold text-zinc-100 mb-4">Cần tư vấn?</h2>
                            <p className="text-sm text-zinc-400 mb-6">
                                Đội ngũ HustlyTasker sẵn sàng tư vấn gói phù hợp cho team của bạn.
                            </p>
                            <a
                                href="mailto:sales@hustlytasker.xyz"
                                className="inline-flex items-center gap-2 px-5 py-3 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/30 text-violet-300 hover:text-violet-200 rounded-xl text-sm font-semibold transition-colors"
                            >
                                <Mail className="w-4 h-4" />
                                sales@hustlytasker.xyz
                            </a>
                            <p className="text-xs text-zinc-500 mt-4">
                                Hoặc gọi: <strong className="text-zinc-300">+84 (0) 123 456 789</strong> (giờ hành chính)
                            </p>
                        </div>
                    </div>
                </div>

                <p className="text-center text-xs text-zinc-600 mt-8">
                    Tất cả giá đã bao gồm VAT. Hóa đơn điện tử cấp đầy đủ theo quy định Bộ Tài chính.
                </p>
            </div>
        </div>
    )
}
