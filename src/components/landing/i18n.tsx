'use client'

/**
 * Landing-page bilingual dictionary (EN/VI) + lightweight client-side language
 * context. Self-contained — does NOT use next-intl (which only wraps /portal),
 * so there is zero routing conflict. Default language is EN; the choice is
 * persisted in localStorage['ht-lang'].
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Lang = 'en' | 'vi'

const dict = {
    en: {
        nav: {
            velox: 'Velox',
            platform: 'Platform',
            how: 'How it works',
            customers: 'Customers',
            tryFree: 'Try it for free',
            login: 'Log in',
        },
        hero: {
            badgeTag: 'Velox',
            badgeText: 'Deep Scan — now live',
            h1a: 'Point Velox at a folder.',
            h1b: 'Get a task board.',
            lede: 'HustlyTasker is the operating system for high-volume video agencies. Velox scans your Drive or Dropbox, reads the patterns in your project files, and auto-generates a fully assigned task board — tasks, roles, deadlines, all pre-filled.',
            ctaPrimary: 'Try it for free',
            ctaSecondary: 'Watch Velox scan',
            metaTasks: 'tasks auto-created',
            metaAccuracy: 'pattern accuracy',
            metaSaved: 'saved / week',
        },
        demo: {
            sourceFiles: 'Source files',
            generatedTasks: 'Generated tasks',
            scanning: 'Scanning',
            done: 'Done',
        },
        spot: {
            eyebrow: 'Velox · Deep Scan',
            h2a: "It doesn't just list your files.",
            h2b: 'It understands the work inside them.',
            p: 'Connect a cloud drive once. Velox recognizes seven project patterns — and explains every task it creates, with a confidence score you can trust.',
            statPatterns: 'patterns matched',
            statColumns: 'columns pre-filled',
            statManual: 'manual entry',
            why: 'Why these tasks?',
            reasons: [
                { code: 'P3', title: 'Project file → Edit task', desc: 'A <b>.prproj</b> with version suffix means an edit in progress. Assigned to an Editor.', conf: '96%' },
                { code: 'P5', title: 'Color assets detected', desc: 'LUT packs and raw footage imply a color-grading pass. Routed to a Colorist.', conf: '91%' },
                { code: 'P2', title: 'Design source spotted', desc: 'A layered <b>.psd</b> named "thumb" maps to a thumbnail deliverable for a Designer.', conf: '88%' },
                { code: 'P7', title: 'Deadline inferred', desc: '"Q3_Launch" + last-modified dates set a suggested due date you can override.', conf: '84%' },
            ],
        },
        bento: {
            eyebrow: 'One platform',
            h2a: 'Everything an agency runs on,',
            h2b: 'under one pane of glass.',
            p: 'Operations, clients, money, and performance — unified. No more stitching five tools together.',
            opsTitle: 'Project Operations',
            opsDesc: 'A task board built for the full edit lifecycle — from brief to delivery — with claimable tasks and optimistic, instant updates.',
            crmTitle: 'Clients & CRM',
            crmDesc: 'Every client, contract and conversation in one record. A polished portal greets your customers in their own language.',
            finTitle: 'Financials — dual currency',
            finDesc: 'Invoice clients in USD, run payroll in VND, and keep the locked exchange rate on record. Tabular figures that always line up.',
            finRow1: 'Acme Corp — Launch reel',
            finRow2: 'Editor payroll — Phuc',
            kpiTitle: 'Automated KPI',
            kpiDesc: 'Ranks your team S→D from real throughput. No spreadsheets.',
            kpiTopRank: 'Top rank',
            kpiDelta: 'vs last mo.',
        },
        how: {
            eyebrow: 'How it works',
            h2a: 'From cloud folder to running board',
            h2b: 'in three moves.',
            s1Title: 'Connect a drive',
            s1Desc: 'Link Google Drive, Dropbox or OneDrive in two clicks. Read-only, secure, revocable anytime.',
            s2Title: 'Velox deep-scans',
            s2Desc: 'It reads file types, names and structure, matches seven patterns, and drafts tasks with confidence scores.',
            s3Title: 'Review & ship',
            s3Desc: 'Confirm the pre-filled board, tweak any row, assign, and your team is working — within minutes, not hours.',
        },
        stats: {
            s1: 'tasks auto-generated',
            s2: 'pattern accuracy',
            s3: 'agencies onboard',
            s4: 'languages, one portal',
        },
        cta: {
            h2: 'Stop building task boards by hand.',
            p: 'Connect a folder and watch your next project board build itself. Free to start, no card required.',
            primary: 'Try it for free',
            secondary: 'Book a demo',
        },
        footer: {
            tagline: 'The operating system for high-volume video agencies. Built for teams who ship at scale.',
            product: 'Product',
            taskBoard: 'Task board',
            finance: 'Finance',
            clientPortal: 'Client portal',
            company: 'Company',
            about: 'About',
            careers: 'Careers',
            resources: 'Resources',
            docs: 'Docs',
            pricing: 'Pricing',
            support: 'Support',
            copyright: '© 2026 HustlyTasker',
            built: 'Built for agencies that move fast.',
        },
    },
    vi: {
        nav: {
            velox: 'Velox',
            platform: 'Nền tảng',
            how: 'Cách hoạt động',
            customers: 'Khách hàng',
            tryFree: 'Dùng thử miễn phí',
            login: 'Đăng nhập',
        },
        hero: {
            badgeTag: 'Velox',
            badgeText: 'Deep Scan — vừa ra mắt',
            h1a: 'Trỏ Velox vào một thư mục.',
            h1b: 'Nhận ngay bảng task.',
            lede: 'HustlyTasker là hệ điều hành cho các agency dựng video số lượng lớn. Velox quét Drive hoặc Dropbox của bạn, đọc các pattern trong file dự án, và tự động dựng bảng task đã phân công đầy đủ — task, vai trò, deadline, điền sẵn hết.',
            ctaPrimary: 'Dùng thử miễn phí',
            ctaSecondary: 'Xem Velox quét',
            metaTasks: 'task tự tạo',
            metaAccuracy: 'độ chính xác pattern',
            metaSaved: 'tiết kiệm / tuần',
        },
        demo: {
            sourceFiles: 'File nguồn',
            generatedTasks: 'Task tự sinh',
            scanning: 'Đang quét',
            done: 'Xong',
        },
        spot: {
            eyebrow: 'Velox · Deep Scan',
            h2a: 'Không chỉ liệt kê file.',
            h2b: 'Velox hiểu được công việc bên trong.',
            p: 'Kết nối cloud một lần. Velox nhận diện bảy pattern dự án — và giải thích mọi task nó tạo ra, kèm điểm tin cậy bạn có thể tin tưởng.',
            statPatterns: 'pattern khớp',
            statColumns: 'cột điền sẵn',
            statManual: 'nhập tay',
            why: 'Vì sao có những task này?',
            reasons: [
                { code: 'P3', title: 'File dự án → Task dựng', desc: 'File <b>.prproj</b> có hậu tố version = đang dựng. Giao cho Editor.', conf: '96%' },
                { code: 'P5', title: 'Phát hiện asset màu', desc: 'Gói LUT và footage thô = cần grade màu. Định tuyến cho Colorist.', conf: '91%' },
                { code: 'P2', title: 'Phát hiện file thiết kế', desc: 'File <b>.psd</b> nhiều layer tên "thumb" = deliverable thumbnail cho Designer.', conf: '88%' },
                { code: 'P7', title: 'Suy ra deadline', desc: '"Q3_Launch" + ngày sửa cuối = gợi ý ngày hạn, bạn có thể chỉnh.', conf: '84%' },
            ],
        },
        bento: {
            eyebrow: 'Một nền tảng',
            h2a: 'Mọi thứ agency cần vận hành,',
            h2b: 'trong cùng một lớp kính.',
            p: 'Vận hành, khách hàng, tài chính và hiệu suất — hợp nhất. Không còn phải ghép năm công cụ rời rạc.',
            opsTitle: 'Vận hành dự án',
            opsDesc: 'Bảng task cho trọn vòng đời dựng — từ brief tới giao hàng — task có thể nhận, cập nhật tức thì.',
            crmTitle: 'Khách hàng & CRM',
            crmDesc: 'Mọi khách hàng, hợp đồng và trao đổi trong một hồ sơ. Portal sang trọng chào khách bằng chính ngôn ngữ của họ.',
            finTitle: 'Tài chính — song tệ',
            finDesc: 'Xuất hóa đơn USD cho khách, trả lương VND cho nhân sự, lưu rõ tỷ giá đã chốt. Cột số luôn thẳng hàng.',
            finRow1: 'Acme Corp — Reel ra mắt',
            finRow2: 'Lương Editor — Phuc',
            kpiTitle: 'KPI tự động',
            kpiDesc: 'Xếp hạng team S→D theo throughput thật. Không bảng tính.',
            kpiTopRank: 'Hạng cao nhất',
            kpiDelta: 'so tháng trước',
        },
        how: {
            eyebrow: 'Cách hoạt động',
            h2a: 'Từ thư mục cloud tới bảng task chạy',
            h2b: 'chỉ trong ba bước.',
            s1Title: 'Kết nối cloud',
            s1Desc: 'Liên kết Google Drive, Dropbox hay OneDrive trong hai cú click. Chỉ đọc, bảo mật, thu hồi bất cứ lúc nào.',
            s2Title: 'Velox quét sâu',
            s2Desc: 'Đọc loại file, tên và cấu trúc, khớp bảy pattern, dựng nháp task kèm điểm tin cậy.',
            s3Title: 'Duyệt & chạy',
            s3Desc: 'Xác nhận bảng đã điền sẵn, chỉnh dòng nào cần, phân công, và team bắt đầu chạy — trong vài phút.',
        },
        stats: {
            s1: 'task tự sinh',
            s2: 'độ chính xác pattern',
            s3: 'agency đang dùng',
            s4: 'ngôn ngữ, một portal',
        },
        cta: {
            h2: 'Đừng dựng bảng task bằng tay nữa.',
            p: 'Kết nối một thư mục và xem bảng dự án tự dựng. Miễn phí để bắt đầu, không cần thẻ.',
            primary: 'Dùng thử miễn phí',
            secondary: 'Đặt lịch demo',
        },
        footer: {
            tagline: 'Hệ điều hành cho agency dựng video số lượng lớn. Dành cho team giao hàng quy mô.',
            product: 'Sản phẩm',
            taskBoard: 'Bảng task',
            finance: 'Tài chính',
            clientPortal: 'Portal khách',
            company: 'Công ty',
            about: 'Giới thiệu',
            careers: 'Tuyển dụng',
            resources: 'Tài nguyên',
            docs: 'Tài liệu',
            pricing: 'Bảng giá',
            support: 'Hỗ trợ',
            copyright: '© 2026 HustlyTasker',
            built: 'Dành cho agency vận hành nhanh.',
        },
    },
}

export type Dict = (typeof dict)['en']

interface LangCtx {
    lang: Lang
    setLang: (l: Lang) => void
    t: Dict
}

const Ctx = createContext<LangCtx | null>(null)

export function LangProvider({ children }: { children: ReactNode }) {
    const [lang, setLangState] = useState<Lang>('en')

    // Restore saved choice after mount (default stays EN on first paint).
    useEffect(() => {
        try {
            const saved = localStorage.getItem('ht-lang')
            if (saved === 'en' || saved === 'vi') setLangState(saved)
        } catch {
            /* ignore */
        }
    }, [])

    const setLang = (l: Lang) => {
        setLangState(l)
        try {
            localStorage.setItem('ht-lang', l)
        } catch {
            /* ignore */
        }
    }

    return <Ctx.Provider value={{ lang, setLang, t: dict[lang] }}>{children}</Ctx.Provider>
}

export function useLang(): LangCtx {
    const ctx = useContext(Ctx)
    if (!ctx) throw new Error('useLang must be used within <LangProvider>')
    return ctx
}
